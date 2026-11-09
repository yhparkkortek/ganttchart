// ═══════════════════════════════════════════════════════════════════════════
// 🩹 색인 자동 복구 — "살아 있는 파일인데 항목이 없으면 되살린다" (2026-11-09)
//
//  왜 이게 필요한가 — 오늘 하루의 결론이다.
//    `project_index.json` 은 전사 공용 파일이고, 거기서 항목이 사라지면 그 프로젝트는
//    목록에서 담당자·팀·색이 빈 **"미지정"** 이 되고 메일 자동배분 색인에서도 빠진다.
//    그런데 **오류가 안 난다** — 사람이 알아챌 방법이 없다.
//
//  막는 쪽은 두 번 손봤는데 둘 다 **남의 PC 에 의존**했다:
//    ① js/15b — 유령 정리가 색인을 지우지 않게 고쳤다 → **그 PC 가 새로고침해야** 듣는다
//    ② kortek_backend.py — `/nas/app/put` 가드 → **그 PC 백엔드가 최신이어야** 듣는다
//  실측(2026-11-09): ①②를 모두 넣은 뒤에도 17:34:42 에 2건이 또 사라졌다. 지우는 쪽이
//  **다른 PC**(낡은 백엔드)였기 때문이다. 하루 종일 앱을 열어 둔 탭은 갱신 확인조차
//  하지 않는다(js/04b 는 **페이지 로드 3초 뒤**에만 묻는다).
//
//  → 그래서 **고치는 쪽**을 둔다. 누가 지우든 다음 매칭에서 되살아나므로
//    남의 PC 업데이트를 기다리지 않는다. 지우는 건 한 번이면 되지만, 되살리는 것도
//    이제 한 번이면 된다.
//
//  ⚠️ 하지 않는 것
//    · **없는 파일의 항목을 만들지 않는다** — 되살리는 대상은 `_listProjectFiles()` 가
//      내놓은 **실제로 있는 파일**뿐이다. 그래서 정상 삭제(파일+항목 둘 다 지움)는
//      절대 되살아나지 않는다.
//    · **값을 지어내지 않는다** — 먼저 이 PC 가 **전에 본 그 항목**을 쓰고(키워드·토픽까지
//      그대로), 없으면 프로젝트 파일을 읽어 앱과 **같은 함수**(`buildProjectIndexEntry`)로
//      만든다. 둘 다 안 되면 **아무것도 안 넣는다**.
//    · **이미 있는 항목은 안 건드린다** — 더하기만 한다.
//
//  ⚠️ 수치는 전부 데이터(`INDEX_SELFHEAL`) — 코드에 박지 않는다.
//  ⚠️ 킬스위치: localStorage `gantt_index_selfheal_off = '1'`
//
//  → docs/nas-dsm.md
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    window.INDEX_SELFHEAL = {
        maxPerSweep: 5,        // 한 스윕에 되살릴 최대 건수 — 폭주 방지
        cooldownMs: 120000,    // 같은 파일을 이 시간 안엔 다시 안 건드린다(PC 끼리 다투지 않게)
        snapshotKey: 'gantt_index_entry_cache_v1',
        snapshotMax: 300,      // 스냅샷에 보관할 항목 수
        fetchMeta: true,       // 스냅샷이 없으면 프로젝트 파일을 읽어 만든다
        toastOncePerSession: true
    };

    const OFF_KEY = 'gantt_index_selfheal_off';
    const _lastTouch = {};     // 파일 열쇠 → 마지막으로 되살린 시각
    let _running = false;
    let _toasted = false;

    function off() {
        try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
    }

    /** 파일/항목을 가리키는 **흔들리지 않는 열쇠** — 경로가 제일이고 없으면 이름.
     *  (id 는 한 경로에 여럿 걸려 승자가 바뀌고, 이름은 사람이 칸을 고칠 때 바뀐다 —
     *   2026-11-09 의 교훈. 경로가 있으면 경로를 쓴다.) */
    function keyOfId(id, name) {
        let rel = '';
        try { rel = (window._storageRelOfId && window._storageRelOfId(id)) || ''; } catch (e) { rel = ''; }
        return rel ? ('rel:' + rel) : ('name:' + String(name || ''));
    }

    // ── 스냅샷 ────────────────────────────────────────────────────────────
    //   색인을 읽을 때마다 "본 항목"을 적어 둔다. 나중에 누가 지우면 **이걸로** 되살리므로
    //   `keywords`(메일 매칭 누적 어휘)·`topicKeywords` 까지 그대로 돌아온다.
    //   프로젝트 파일에서 다시 만들면 그 둘이 안 돌아온다(그게 오늘 수동 복구에서 확인된 차이다).
    function loadSnap() {
        try { return JSON.parse(localStorage.getItem(window.INDEX_SELFHEAL.snapshotKey) || '{}') || {}; }
        catch (e) { return {}; }
    }

    window._indexSnapshotRemember = function (projects) {
        if (off() || !Array.isArray(projects) || !projects.length) return;
        try {
            const snap = loadSnap();
            projects.forEach(function (p) {
                if (!p || !p.drive_file_id) return;
                snap[keyOfId(p.drive_file_id, p.file_name)] = p;
            });
            const keys = Object.keys(snap);
            const max = window.INDEX_SELFHEAL.snapshotMax;
            if (keys.length > max) keys.slice(0, keys.length - max).forEach(function (k) { delete snap[k]; });
            localStorage.setItem(window.INDEX_SELFHEAL.snapshotKey, JSON.stringify(snap));
        } catch (e) { /* 용량 초과 등 — 복구는 파일 읽기로도 된다 */ }
    };

    // ── 프로젝트 파일에서 항목 만들기(스냅샷이 없을 때) ──────────────────
    async function entryFromFile(file) {
        if (!window.INDEX_SELFHEAL.fetchMeta || !window.buildProjectIndexEntry) return null;
        let doc = null;
        try {
            const r = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true });
            doc = r && (r.result || (typeof r.body === 'string' ? JSON.parse(r.body) : null));
        } catch (e) {
            console.warn('[색인 복구] 프로젝트 파일을 못 읽었습니다 — 건너뜁니다:', file.name, e && e.message);
            return null;
        }
        if (!doc || typeof doc !== 'object') return null;
        const pm = doc.projectMeta || {};
        // 담당자조차 모르면 **안 넣는다** — 빈 항목을 넣으면 "미지정"을 색인에 굳히는 셈이다.
        if (!String(pm.프로젝트담당자 || '').trim()) {
            console.warn('[색인 복구] 담당자가 비어 있어 건너뜁니다(파일에도 없습니다):', file.name);
            return null;
        }
        const mats = ((doc.tabData || {}).projectMaterials) || [];
        const e = window.buildProjectIndexEntry(file.id, file.name, pm, mats);
        const color = String(((doc.tabData || {}).themeColor) || '').trim();
        if (color && !e.themeColor) e.themeColor = color;
        return e;
    }

    // ── 본체 ──────────────────────────────────────────────────────────────
    /** 살아 있는 파일 중 색인에 없는 것을 되살린다. `_msLoadProjectIndex`(js/15b)가 부른다.
     *  @param realFiles  `_listProjectFiles()` 결과(실제로 있는 프로젝트 파일)
     *  @param entries    이번에 유효하다고 본 색인 항목들 */
    window._indexSelfHeal = async function (realFiles, entries) {
        if (off() || _running) return 0;
        if (!Array.isArray(realFiles) || !realFiles.length) return 0;   // 목록이 비면 아무 판단도 안 한다
        if (!Array.isArray(entries)) return 0;

        // 색인이 이미 들고 있는 것들 — 세 열쇠 전부로 본다(어댑터 `attachAppProps` 와 같은 순서)
        const haveIds = new Set(), haveKeys = new Set(), haveNames = new Set();
        entries.forEach(function (p) {
            if (!p) return;
            if (p.drive_file_id) { haveIds.add(p.drive_file_id); haveKeys.add(keyOfId(p.drive_file_id, p.file_name)); }
            if (p.file_name) haveNames.add(p.file_name);
        });

        const nowTs = Date.now();
        const cool = window.INDEX_SELFHEAL.cooldownMs;
        const missing = realFiles.filter(function (f) {
            if (!f || !f.id) return false;
            if (haveIds.has(f.id) || haveNames.has(f.name) || haveKeys.has(keyOfId(f.id, f.name))) return false;
            const k = keyOfId(f.id, f.name);
            return !(_lastTouch[k] && (nowTs - _lastTouch[k]) < cool);   // 방금 손댔으면 쉰다
        }).slice(0, window.INDEX_SELFHEAL.maxPerSweep);

        if (!missing.length) return 0;

        _running = true;
        try {
            const snap = loadSnap();
            const add = [];
            for (let i = 0; i < missing.length; i++) {
                const f = missing[i];
                const k = keyOfId(f.id, f.name);
                let e = snap[k] || snap['name:' + f.name] || null;
                if (e) {
                    e = Object.assign({}, e);
                    e.drive_file_id = f.id;      // 지금 목록이 내놓는 id 로 맞춘다(승자는 바뀐다)
                    e.file_name = f.name;        // 이름도 지금 것으로
                } else {
                    e = await entryFromFile(f);
                }
                if (e) { add.push(e); _lastTouch[k] = Date.now(); }
            }
            if (!add.length) return 0;

            // 쓰기 직전에 색인을 **다시 읽는다** — 그 사이 다른 PC 가 썼을 수 있다.
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token || !window.findProjectIndexFile) return 0;
            const idxId = await window.findProjectIndexFile(token);
            if (!idxId) return 0;
            const res = await fetch('https://www.googleapis.com/drive/v3/files/' + idxId
                                    + '?alt=media&supportsAllDrives=true',
                                    { headers: { 'Authorization': 'Bearer ' + token } });
            const doc = await res.json();
            // 못 읽었으면 **쓰지 않는다** — 빈 색인으로 덮어쓰는 길이다(js/04c 와 같은 가드).
            if (!doc || !Array.isArray(doc.projects) || !doc.projects.length) {
                console.warn('[색인 복구] 색인을 못 읽어 건너뜁니다 — 덮어쓰지 않습니다.');
                return 0;
            }
            const now = new Set(doc.projects.map(function (p) { return p && p.drive_file_id; }));
            const nowNames = new Set(doc.projects.map(function (p) { return p && p.file_name; }));
            const fresh = add.filter(function (e) { return !now.has(e.drive_file_id) && !nowNames.has(e.file_name); });
            if (!fresh.length) return 0;        // 그 사이 누가 되살렸다 — 할 일 없음

            doc.projects = doc.projects.concat(fresh);
            await fetch('https://www.googleapis.com/upload/drive/v3/files/' + idxId
                        + '?uploadType=media&supportsAllDrives=true',
                        { method: 'PATCH',
                          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                          body: JSON.stringify(doc) });
            if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            window._projectIndexCache = { data: null, at: 0 };   // 다음 매칭부터 반영

            const names = fresh.map(function (e) { return e.file_name; });
            console.warn('[색인 복구] 살아 있는 파일인데 색인에 없던 항목 ' + fresh.length + '건을 되살렸습니다: '
                       + names.join(', ') + '\n  ⚠️ 이게 반복되면 **옛 버전 앱이 열려 있는 PC** 가 계속 지우는 중입니다'
                       + ' — 그 PC 에서 새로고침 + 백엔드 업데이트가 필요합니다.');
            if (window._issueLog) {
                window._issueLog({ domain: 'storage', kind: 'index_entry_healed',
                                   route: 'project_index.json',
                                   detail: { restored: names, source: 'selfheal' } });
            }
            if (window.showToast && window.INDEX_SELFHEAL.toastOncePerSession && !_toasted) {
                _toasted = true;
                window.showToast('🩹 프로젝트 색인 ' + fresh.length + '건을 되살렸습니다 (옛 버전 앱이 열린 PC 가 있을 수 있습니다)',
                                 'warning', 7000);
            }
            return fresh.length;
        } catch (e) {
            console.warn('[색인 복구] 실패:', e && e.message);
            return 0;
        } finally {
            _running = false;
        }
    };
})();
