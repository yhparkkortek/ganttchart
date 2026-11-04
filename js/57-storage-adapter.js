// ═══════════════════════════════════════════════════════════════════════════
// 🔀 js/57-storage-adapter.js — 저장소 어댑터 (Google Drive ↔ 사내 NAS)
//
// 왜 이렇게 만들었나 — **기존 파일을 안 고치려고.**
//   Drive 를 부르는 자리가 24개 파일에 흩어져 있다(googleapis 호출 ~120곳,
//   gapi.client ~110곳). 그걸 하나하나 고치면 ① 리뷰가 불가능하고 ② 지금 앱을
//   쓰고 있는 사람들에게 그 변경이 **즉시** 배포된다(GitHub Pages).
//   그래서 호출지점이 아니라 **네트워크 경계 두 곳**만 감싼다:
//     ① window.fetch           — `googleapis.com/(upload/)drive/v3/files…`
//     ② gapi.client.drive.files — `.get` / `.list`
//   이 두 곳이 Drive 데이터 접근의 전부다(나머지 gapi 사용은 getToken/setToken,
//   즉 인증이라 데이터와 무관하다).
//
// ⚠️⚠️ 플래그가 꺼져 있으면 **아무것도 감싸지 않는다.** 파일을 읽어 들이기만 하고
//    즉시 return 한다 — 플래그를 안 켠 사람의 코드 경로는 이 파일이 없을 때와 **완전히 동일**하다.
//    (지금 앱을 쓰는 사람들이 있다 — 이 파일 하나로 그 사람들 저장이 바뀌면 안 된다)
//
//    모드 세 가지 (`localStorage.gantt_storage_backend`):
//      없음 / 'drive' — 지금과 완전히 같다.
//      'mirror'       — 🪞 Drive 에 쓸 때 NAS 에도 **같이** 쓴다. 읽기는 전부 Drive.
//                        NAS 실패는 앱에 전달되지 않는다 — Drive 가 계속 정답이다.
//                        (되돌릴 기준을 남긴 채 실데이터로 NAS 쓰기를 검증하는 단계)
//      'nas'          — 읽기·쓰기 모두 NAS. Drive 를 전혀 부르지 않는다.
//
//    켜기:  localStorage.setItem('gantt_storage_backend', 'mirror')  → 새로고침
//    끄기:  localStorage.removeItem('gantt_storage_backend')         → 새로고침
//           (= 비상 탈출구. 어댑터가 뭘 잘못해도 이 한 줄로 Drive 로 돌아간다)
//
// ⚠️ NAS 는 **브라우저가 직접 못 부른다**(DSM 이 CORS 헤더를 안 준다). 그래서 로컬
//    백엔드(`/nas/app/*`)가 중계한다 — `/doc/*` 와 `C:\SAP_DMS` 에 이미 쓰는 패턴.
// ⚠️ 사내 공유 경로는 **이 파일에 안 적는다.** 여기서 쓰는 건 앱 루트 기준 **상대경로**뿐이고,
//    실제 경로는 백엔드가 `nas_login_config.json`(.gitignore) 에서 붙인다.
//    (이 저장소는 GitHub Pages 로 공개돼 있다)
//
// 📐 매핑 규칙 — **이름을 그대로 쓴다.**
//    Drive 의 폴더/파일 이름을 NAS 앱 루트 아래 **같은 이름**으로 둔다. 이름을 바꾸면
//    "앱이 부르는 이름"과 "NAS 에 있는 이름"이 어긋나는 사고가 반드시 난다.
//    Drive 는 불투명한 fileId 를 쓰고 앱이 그걸 **저장해 둔다**(project_index 의
//    drive_file_id 등). NAS 엔 id 가 없고 경로만 있으니, id 를 경로에서 **만들어** 준다:
//      ROOT            → SHARED_FOLDER_ID 그대로 (앱이 상수로 들고 있어서 바꿀 수 없다)
//      그 밖의 모든 것 → 'nas_' + 'd'|'f' + '_' + base64url(상대경로)
//    경로가 곧 id 이므로 **id 대장을 따로 들 필요가 없다**(들면 그게 또 꼬인다).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var FLAG_KEY = 'gantt_storage_backend';
    var BACKEND = 'http://127.0.0.1:5000';
    var FOLDER_MIME = 'application/vnd.google-apps.folder';

    function currentBackend() {
        try { return (localStorage.getItem(FLAG_KEY) || 'drive').toLowerCase(); }
        catch (e) { return 'drive'; }   // 시크릿 모드 등에서 localStorage 가 던질 수 있다
    }

    // ───────────────────────────────────────────────────────────────────────
    // 순수 함수들 — 플래그와 무관하게 노출한다. **node 로 단독 검증하려고** 그렇게 했다.
    //   (이 파일에서 조용히 틀리기 쉬운 곳이 전부 여기다: id 인코딩, q 파싱, multipart 파싱)
    // ───────────────────────────────────────────────────────────────────────

    function b64urlEncode(str) {
        // UTF-8 → base64url. btoa 는 라틴1만 받으므로 먼저 UTF-8 바이트로 눕힌다.
        var b64 = btoa(unescape(encodeURIComponent(str)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function b64urlDecode(s) {
        var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        return decodeURIComponent(escape(atob(b64)));
    }

    function rootId() {
        // 앱이 상수로 들고 있는 값(js/04a). 이 id 로 오는 요청은 "앱 루트"를 뜻한다.
        try { return (typeof SHARED_FOLDER_ID !== 'undefined' && SHARED_FOLDER_ID) || ''; }
        catch (e) { return ''; }
    }

    // ═══ 🗺 옛 Drive id 지도 ═══════════════════════════════════════════════
    //  ⚠️⚠️ 앱 **데이터 안에 Drive 파일 id 가 박혀 있다** — 실측 5,089곳(프로젝트 파일 3,214 ·
    //     TaskInbox 백업 1,862 · project_index 13). 코드도 `drive_file_id === currentDriveFileId`
    //     처럼 **같은지 비교**하는 자리가 40곳 가까이다. id 체계가 바뀌면 그 비교가 전부
    //     빗나가고, 오류가 아니라 **메일 배분·보관함 배치·중복 검사가 조용히 안 맞는다.**
    //  → 그래서 데이터를 고쳐 쓰는 대신 **옛 id 를 그대로 살린다**: 이사 때 만든 지도
    //     (`App_Config/nas_id_map.json`)를 읽어 ① 옛 id 를 경로로 풀고 ② 목록에도 **그 옛 id 를
    //     그대로** 실어 준다. 그러면 저장된 모든 참조가 계속 맞는다.
    //  ⚠️ 지도가 없어도 돌아간다(경로에서 만든 id 를 쓴다) — 다만 그 경우 위 비교들이 빗나간다.
    var _idMap = {};         // 옛 Drive id → 상대경로
    var _relToOldId = {};    // 상대경로 → 옛 Drive id

    function adoptIdMap(obj) {
        var m = (obj && obj.map) || {};
        _idMap = {}; _relToOldId = {};
        Object.keys(m).forEach(function (k) {
            var rel = String(m[k] || '');
            if (!rel) return;
            _idMap[k] = rel;
            _relToOldId[rel] = k;
        });
        return Object.keys(_idMap).length;
    }

    /** 상대경로 → fileId. **이사해 온 파일은 옛 Drive id 를 그대로 돌려준다.** */
    function idOf(rel, isdir) {
        rel = normRel(rel);
        if (!rel) return rootId();
        if (!isdir && _relToOldId[rel]) return _relToOldId[rel];
        return 'nas_' + (isdir ? 'd' : 'f') + '_' + b64urlEncode(rel);
    }

    /** fileId → {rel, isdir}. 우리가 만든 id 도, 지도에 있는 옛 id 도 받는다. */
    function relOf(id) {
        id = String(id || '');
        if (id && id === rootId()) return { rel: '', isdir: true };
        if (_idMap[id]) return { rel: _idMap[id], isdir: false };
        var m = /^nas_([df])_(.+)$/.exec(id);
        if (!m) return null;
        try { return { rel: normRel(b64urlDecode(m[2])), isdir: m[1] === 'd' }; }
        catch (e) { return null; }
    }

    /** 상대경로 정규화. `..` 은 거부 — 앱 루트 밖을 가리키는 길을 만들지 않는다. */
    function normRel(rel) {
        var parts = String(rel || '').replace(/\\/g, '/').split('/');
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim();
            if (!p || p === '.') continue;
            if (p === '..') throw new Error('상위 경로(..)는 쓸 수 없습니다: ' + rel);
            out.push(p);
        }
        return out.join('/');
    }

    function joinRel(parentRel, name) {
        parentRel = normRel(parentRel);
        return parentRel ? parentRel + '/' + name : String(name);
    }

    /**
     * Drive `q` 질의를 뜻으로 바꾼다. 앱이 실제로 쓰는 문법만 받는다(실측해서 추린 것):
     *   name='X'  ·  mimeType='…'  ·  mimeType!='…'  ·  'ID' in parents  ·  trashed=false
     *   AND 로 이어지고, parents 만 OR 묶음으로 올 수 있다.
     * ⚠️ 모르는 절은 **조용히 무시하지 않고** unknown 에 담아 돌려준다 —
     *    무시하면 "조건을 덜 걸고 전건을 돌려주는" 조용한 오답이 된다.
     */
    function parseQ(q) {
        var out = { name: null, mime: null, mimeNot: null, parents: [], unknown: [] };
        var s = String(q || '');
        // 따옴표 안에 'and'/'or' 가 들어와도 안전하게: 먼저 리터럴을 빼내고 자리표시로 바꾼다.
        var lits = [];
        s = s.replace(/'((?:[^'\\]|\\.)*)'/g, function (_, inner) {
            lits.push(inner.replace(/\\(.)/g, '$1'));
            return '\u0000' + (lits.length - 1) + '\u0000';
        });
        var L = function (tok) {
            var m = /^\u0000(\d+)\u0000$/.exec(String(tok).trim());
            return m ? lits[+m[1]] : null;
        };
        s.split(/\s+and\s+/i).forEach(function (clauseRaw) {
            clauseRaw.split(/\s+or\s+/i).forEach(function (raw) {
                var c = raw.replace(/^[\s()]+|[\s()]+$/g, '');
                if (!c) return;
                var m;
                if ((m = /^name\s*=\s*(\S+)$/i.exec(c)) && L(m[1]) !== null) { out.name = L(m[1]); return; }
                if ((m = /^mimeType\s*=\s*(\S+)$/i.exec(c)) && L(m[1]) !== null) { out.mime = L(m[1]); return; }
                if ((m = /^mimeType\s*!=\s*(\S+)$/i.exec(c)) && L(m[1]) !== null) { out.mimeNot = L(m[1]); return; }
                if ((m = /^(\S+)\s+in\s+(parents|ancestors)$/i.exec(c)) && L(m[1]) !== null) {
                    out.parents.push(L(m[1]));
                    return;
                }
                if (/^trashed\s*=\s*(false|true)$/i.test(c)) return;   // NAS 엔 휴지통이 없다
                // 신고할 땐 자리표시를 **원래 글자로 되돌린다** — 안 그러면 오류 메시지에
                // `fullText contains \u00000\u0000` 같은 내부 표시가 새어 나가 사람이 못 읽는다.
                out.unknown.push(c.replace(/\u0000(\d+)\u0000/g, function (_, n) {
                    return "'" + lits[+n] + "'";
                }));
            });
        });
        return out;
    }

    /**
     * Drive multipart/related 업로드 본문을 쪼갠다 → {meta, media, mediaIsB64}.
     * 앱이 손으로 조립하는 모양이라 공백/줄바꿈이 제각각이다. boundary 로만 자른다.
     */
    function parseMultipart(body, contentType) {
        var bm = /boundary=("?)([^";]+)\1/i.exec(String(contentType || ''));
        if (!bm) return null;
        var parts = String(body).split('--' + bm[2]);
        var meta = null, media = null, mediaIsB64 = false;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!p || /^--\s*$/.test(p.trim()) || !p.trim()) continue;
            // 머리글과 본문은 빈 줄로 갈린다(CRLF 든 LF 든).
            var split = p.search(/\r?\n\r?\n/);
            if (split < 0) continue;
            var head = p.slice(0, split);
            var bodyPart = p.slice(split).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');
            if (meta === null) {
                try { meta = JSON.parse(bodyPart); } catch (e) { meta = {}; }
            } else if (media === null) {
                media = bodyPart;
                mediaIsB64 = /content-transfer-encoding\s*:\s*base64/i.test(head);
            }
        }
        return { meta: meta || {}, media: media, mediaIsB64: mediaIsB64 };
    }

    /** 이름으로 mimeType 흉내. Drive 가 돌려주던 값과 같은 자리에 들어간다. */
    function mimeOf(name, isdir) {
        if (isdir) return FOLDER_MIME;
        var n = String(name || '').toLowerCase();
        if (/\.json$/.test(n)) return 'application/json';
        if (/\.txt$/.test(n)) return 'text/plain';
        if (/\.eml$/.test(n)) return 'message/rfc822';
        if (/\.(enc|bin|dat)$/.test(n)) return 'application/octet-stream';
        if (/\.pdf$/.test(n)) return 'application/pdf';
        if (/\.(xlsx|xlsm)$/.test(n)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return 'application/octet-stream';
    }

    /** NAS 목록 항목 → Drive files 항목 모양. */
    function toDriveFile(item, parentRel) {
        var rel = joinRel(parentRel, item.name);
        var f = {
            id: idOf(rel, item.isdir),
            name: item.name,
            mimeType: mimeOf(item.name, item.isdir),
            parents: [idOf(parentRel, true)],
            trashed: false
        };
        if (item.mtime) f.modifiedTime = new Date(item.mtime * 1000).toISOString();
        if (item.size !== null && item.size !== undefined) f.size = String(item.size);
        return f;
    }

    // 순수 함수는 플래그와 무관하게 내놓는다 — 검증 하네스(tests/)가 이걸 쓴다.
    window.STORAGE_ADAPTER = {
        version: '2026-11-03',
        backend: currentBackend(),
        installed: false,
        _fn: {
            b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
            idOf: idOf, relOf: relOf, normRel: normRel, joinRel: joinRel,
            parseQ: parseQ, adoptIdMap: adoptIdMap, parseMultipart: parseMultipart,
            mimeOf: mimeOf, toDriveFile: toDriveFile, rootId: rootId
        }
    };

    // ───────────────────────────────────────────────────────────────────────
    // 🔖 저장소 표식 — 저장소를 바꾸면 **저장소에 매인 캐시**를 버려야 한다
    //
    // ⚠️⚠️ 실측으로 잡은 사고(2026-11-03): `gantt_folder_cache_v1` 에는 **Drive 폴더 id** 가
    //    localStorage 에 영속된다(js/04b `_getChildFolderIds`). NAS 로 켜면 그 옛 id 들이
    //    `'<driveId>' in parents` 로 들어오고, 그건 NAS 경로로 못 바꾸니 결과가 **오류가 아니라
    //    팀 폴더가 통째로 빠진 짧은 목록**이 된다. 실사용 브라우저는 이 캐시가 꽉 차 있으므로
    //    켜는 순간 **모든 팀 프로젝트가 조용히 사라진다.** 재현·확인했다.
    //
    // ⚠️ 이 블록은 **플래그 검사보다 위**에 있다. Drive 로 되돌릴 때도 반대 방향으로 썩은
    //    캐시를 버려야 하기 때문이다(킬스위치가 제대로 들으려면 필요하다).
    //    플래그를 한 번도 안 켠 사람은 표식이 없어 'drive' 로 읽히고 지금과 같으므로
    //    **아무 일도 일어나지 않는다**(쓰기도 안 한다).
    // ⚠️⚠️ localStorage 만 지우면 **안 지워진다.** 그 캐시를 쓰는 파일(js/04b)이 이 파일보다
    //    **먼저 로드돼 이미 메모리로 읽어 갔기** 때문이다. 실제로 그렇게 한 번 틀렸다 —
    //    localStorage 는 비었는데 목록은 여전히 옛 Drive id 로 나갔다.
    //    그래서 키마다 **메모리 무효화 함수**를 같이 적는다(없으면 키만 지운다).
    // ⚠️ 비교는 모드 이름이 아니라 **id 공간**으로 한다. `mirror` 는 읽기를 Drive 로 하므로
    //    캐시에 든 Drive id 가 그대로 유효하다 — drive↔mirror 전환에 캐시를 버리면
    //    멀쩡한 캐시를 매번 날려 느려지기만 한다.
    function idSpace(mode) { return mode === 'nas' ? 'nas' : 'drive'; }
    var MARK_KEY = 'gantt_storage_backend_active';
    var BACKEND_SCOPED_CACHES = [          // 새 캐시가 생기면 여기 한 줄 — 데이터로 둔다
        { key: 'gantt_folder_cache_v1', invalidate: '_clearFolderCache' }
    ];
    try {
        var mark = idSpace(localStorage.getItem(MARK_KEY) || 'drive');
        if (mark !== idSpace(currentBackend())) {
            BACKEND_SCOPED_CACHES.forEach(function (c) {
                try { localStorage.removeItem(c.key); } catch (e) { /* ignore */ }
                var fn = c.invalidate && window[c.invalidate];
                if (typeof fn === 'function') { try { fn(); } catch (e) { /* ignore */ } }
            });
            localStorage.setItem(MARK_KEY, currentBackend());
            console.warn('[storage-adapter] 저장소가 ' + mark + ' → ' + currentBackend() +
                         ' 로 바뀌어 저장소에 매인 캐시를 비웠습니다: ' +
                         BACKEND_SCOPED_CACHES.map(function (c) { return c.key; }).join(', '));
        }
    } catch (e) { /* localStorage 가 막힌 환경 — 캐시도 없으니 할 일이 없다 */ }

    // ⚠️ 여기서 끝. 플래그가 꺼져 있으면 **아무것도 감싸지 않는다.**
    var MODE = currentBackend();
    if (MODE !== 'nas' && MODE !== 'mirror') return;

    // ── 🏷 지금 데이터가 어디 있는지 **화면에 보여준다** ──────────────────
    //  ⚠️⚠️ 안 보여주면 사람이 알 수가 없다. 실제로 "이 주소를 쓰면 NAS 인가요?"라는
    //     질문을 받았다 — 주소로는 안 정해지고(플래그는 **브라우저마다** 따로다),
    //     앱은 NAS 모드에서도 헤더 배지에 **"구글 드라이브 연결됨"** 이라고 말하고 있었다.
    //     저장 위치를 잘못 알면 "어디에 저장됐는지 모르는" 상태가 된다.
    //  ⚠️ 기존 배지 함수(js/04b)를 **감싼다** — 그 함수가 여러 곳에서 불리므로 한 곳만 고치면 된다.
    var BADGE = {
        nas:    { icon: '🗄️', ko: '사내 NAS 에 저장됩니다 (구글 드라이브를 쓰지 않습니다)',
                  en: 'Saving to the in-house NAS (Google Drive is not used)' },
        mirror: { icon: '🪞', ko: '구글 드라이브에 저장하면서 사내 NAS 에도 같이 씁니다 (읽기는 드라이브)',
                  en: 'Saving to Google Drive and mirroring to the in-house NAS (reads come from Drive)' }
    }[MODE];
    (function paintBadge() {
        function paint() {
            var el = document.getElementById('drive-conn-badge');
            if (!el) return;
            el.textContent = BADGE.icon;
            el.title = (window._currentLang === 'en' ? BADGE.en : BADGE.ko);
            el.style.display = 'inline-flex';
            el.style.cursor = 'default';
            el.onclick = null;
        }
        var orig = window._updateDriveConnBadge;
        window._updateDriveConnBadge = function () {
            if (typeof orig === 'function') { try { orig.apply(this, arguments); } catch (e) { /* ignore */ } }
            paint();          // ⚠️ 원래 함수가 무슨 말을 했든 **마지막에 덮어쓴다**
        };
        // 배지가 아직 안 그려졌을 수 있다(부팅 순서) — 잠깐 지켜보다 한 번 칠하고 끝낸다.
        var tries = 0;
        var iv = setInterval(function () { paint(); if (++tries > 20) clearInterval(iv); }, 500);
        if (document.readyState !== 'loading') paint();
        else document.addEventListener('DOMContentLoaded', paint);
    })();

    // ───────────────────────────────────────────────────────────────────────
    // 여기서부터는 플래그가 켜졌을 때만 돈다. (nas = NAS 로 갈아끼움 / mirror = 같이 쓰기)
    // ───────────────────────────────────────────────────────────────────────

    var _origFetch = window.fetch.bind(window);
    var _log = [];

    function note(kind, detail) {
        _log.push({ t: Date.now(), kind: kind, detail: detail });
        if (_log.length > 300) _log.shift();
    }

    /** 백엔드 중계 호출. 실패는 **삼키지 않는다** — 던져서 호출한 쪽이 알게 한다. */
    async function nas(method, route, payload) {
        var url = BACKEND + route;
        var opts = { method: method };
        if (payload !== undefined && method !== 'GET') {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(payload);
        }
        var res = await _origFetch(url, opts);
        return res;
    }

    async function nasJson(method, route, payload) {
        var res = await nas(method, route, payload);
        var j = null;
        try { j = await res.json(); } catch (e) { /* 본문이 JSON 이 아닐 수 있다 */ }
        if (!res.ok || (j && j.ok === false)) {
            var err = new Error('NAS ' + route + ' 실패(HTTP ' + res.status + '): ' +
                                ((j && j.message) || '사유 없음'));
            err.status = res.status;   // 호출한 쪽이 "권한 거부"와 "내 잘못"을 가르려면 필요하다
            throw err;
        }
        return j || {};
    }

    function qs(rel) { return '?rel=' + encodeURIComponent(normRel(rel)); }

    // 🗺 옛 id 지도를 **한 번만** 읽는다. 없으면 없는 대로 간다(그땐 경로에서 만든 id 를 쓴다).
    // ⚠️ 모든 입구에서 `await` 해야 한다 — 목록을 먼저 그려 버리면 그 목록의 id 가
    //    새 id 라서, 저장된 옛 id 와 **그 한 번만** 안 맞는 꼬임이 생긴다.
    var _idMapOnce = null;
    function ensureIdMap() {
        if (_idMapOnce) return _idMapOnce;
        _idMapOnce = (async function () {
            try {
                var res = await nas('GET', '/nas/app/get' + qs('App_Config/nas_id_map.json'));
                if (!res.ok) { note('idmap-none', 'HTTP ' + res.status); return 0; }
                var n = adoptIdMap(JSON.parse(await res.text()));
                note('idmap', n + '건');
                return n;
            } catch (e) {
                note('idmap-fail', String((e && e.message) || e));
                return 0;
            }
        })();
        return _idMapOnce;
    }

    async function listRel(rel) {
        var j = await nasJson('GET', '/nas/app/list' + qs(rel));
        return j.items || [];
    }

    async function readRel(rel) {
        var res = await nas('GET', '/nas/app/get' + qs(rel));
        if (!res.ok) {
            var j = null;
            try { j = await res.json(); } catch (e) { /* ignore */ }
            throw new Error('NAS 읽기 실패(HTTP ' + res.status + '): ' + ((j && j.message) || rel));
        }
        return res;
    }

    async function writeRel(rel, media, isB64) {
        var payload = { rel: normRel(rel) };
        if (isB64) payload.b64 = media; else payload.text = String(media === null || media === undefined ? '' : media);
        return await nasJson('POST', '/nas/app/put', payload);
    }

    /** Drive 흉내 JSON 응답. 앱은 res.ok / res.status / res.json() 을 본다. */
    function jsonResponse(obj, status) {
        return new Response(JSON.stringify(obj), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function errResponse(e, status) {
        // Drive 오류 모양으로 돌려준다 — 앱의 기존 오류 처리가 그 모양을 본다.
        return jsonResponse({ error: { code: status || 500, message: String(e && e.message || e) } },
                            status || 500);
    }

    // ── files.list ────────────────────────────────────────────────────────
    async function driveList(params) {
        var parsed = parseQ(params.q || '');
        if (parsed.unknown.length) {
            // 모르는 조건을 무시하면 조건을 덜 걸고 전건을 돌려주는 조용한 오답이 된다.
            throw new Error('아직 못 읽는 Drive 질의 절: ' + parsed.unknown.join(' / '));
        }
        var parentIds = parsed.parents.length ? parsed.parents : [rootId()];
        var seen = {}, files = [];
        for (var i = 0; i < parentIds.length; i++) {
            var pr = relOf(parentIds[i]);
            if (!pr) {
                // ⚠️⚠️ 모르는 부모 id 를 **건너뛰지 않는다.** 건너뛰면 결과가 오류가 아니라
                //    "그 폴더만 빠진 짧은 목록"이 되고, 그건 사람이 절대 못 알아챈다.
                //    거의 전부 **옛 Drive id 가 어딘가에 남아 있다**는 뜻이다(캐시·저장된 id).
                note('list-unknown-parent', parentIds[i]);
                throw new Error('NAS 모드인데 Drive 폴더 id 가 들어왔습니다: ' + parentIds[i] +
                                ' — 저장소에 매인 캐시가 남아 있습니다. ' +
                                'localStorage.removeItem("gantt_folder_cache_v1") 후 새로고침하세요.');
            }
            var items;
            try { items = await listRel(pr.rel); }
            catch (e) {
                // ⚠️ 권한이 없는 폴더(403)는 **건너뛴다** — 통째로 실패하면 목록이 0건이 된다
                //    (팀별 폴더는 서로 열람 권한이 없는 게 정상이다).
                // ⚠️⚠️ 그런데 **아무 실패나 건너뛰면 안 된다.** 처음엔 전부 건너뛰었더니
                //    백엔드가 루트 조회를 400 으로 거절하는 버그를 '권한 거부'로 삼켜
                //    프로젝트 목록이 **조용히 0건**이 됐다(2026-11-03 실측).
                //    400/500 은 내 잘못이니 던진다.
                if (e && e.status === 403) {
                    note('list-skip', { rel: pr.rel, why: String(e.message || e) });
                    continue;
                }
                throw e;
            }
            for (var k = 0; k < items.length; k++) {
                // 원자적 쓰기가 쓰는 임시 폴더는 **저장소 배관**이지 앱 데이터가 아니다.
                // 숨기지 않으면 폴더 캐시에 들어가 매번 쓸데없는 왕복(61ms)을 더 한다.
                if (items[k].isdir && items[k].name.indexOf('.ganttput-') === 0) continue;
                var f = toDriveFile(items[k], pr.rel);
                if (parsed.name !== null && f.name !== parsed.name) continue;
                if (parsed.mime !== null && f.mimeType !== parsed.mime) continue;
                if (parsed.mimeNot !== null && f.mimeType === parsed.mimeNot) continue;
                if (seen[f.id]) continue;
                seen[f.id] = true;
                files.push(f);
            }
        }
        if (/modifiedTime\s+desc/i.test(params.orderBy || '')) {
            files.sort(function (a, b) { return (b.modifiedTime || '') > (a.modifiedTime || '') ? 1 : -1; });
        } else if (/\bname\b/i.test(params.orderBy || '')) {
            files.sort(function (a, b) { return a.name.localeCompare(b.name); });
        }
        return { files: files, incompleteSearch: false };
    }

    // ── files.get ─────────────────────────────────────────────────────────
    async function driveGetMeta(rel, isdir) {
        // 메타만 필요한 요청. 부모를 한 번 훑어 그 항목을 찾는다(NAS 엔 "파일 하나 메타" 가 없다).
        var parts = normRel(rel).split('/');
        var name = parts.pop();
        var items = await listRel(parts.join('/'));
        for (var i = 0; i < items.length; i++) {
            if (items[i].name === name) return toDriveFile(items[i], parts.join('/'));
        }
        throw new Error('그 경로에 파일이 없습니다: ' + rel);
    }

    // ── 만들기 / 덮어쓰기 ──────────────────────────────────────────────────
    function relFromMeta(meta, fallbackName) {
        var name = (meta && meta.name) || fallbackName;
        if (!name) throw new Error('파일 이름이 없습니다.');
        var parents = (meta && meta.parents) || [];
        var pr = parents.length ? relOf(parents[0]) : { rel: '' };
        if (!pr) throw new Error('모르는 부모 폴더 id: ' + parents[0]);
        return joinRel(pr.rel, name);
    }

    async function driveCreate(meta, media, isB64) {
        if (meta && meta.mimeType === FOLDER_MIME) {
            var frel = relFromMeta(meta);
            await nasJson('POST', '/nas/app/mkdir', { rel: frel });
            return { id: idOf(frel, true), name: meta.name, mimeType: FOLDER_MIME,
                     parents: [idOf(normRel(frel).split('/').slice(0, -1).join('/'), true)] };
        }
        var rel = relFromMeta(meta);
        await writeRel(rel, media, isB64);
        return await driveGetMeta(rel, false);
    }

    async function driveUpdate(id, meta, media, isB64) {
        var cur = relOf(id);
        if (!cur) throw new Error('모르는 파일 id: ' + id);
        // 내용 갱신
        if (media !== null && media !== undefined) {
            await writeRel(cur.rel, media, isB64);
        }
        // 이름 바꾸기 / 옮기기 — NAS 중계엔 move 라우트가 없으니 읽기→쓰기→삭제로 옮긴다.
        //   ⚠️ 쓰기가 **확인까지** 끝난 뒤에만 원본을 지운다(put 라우트가 되읽어 확인한다).
        var wantName = meta && meta.name;
        var addParent = meta && meta.addParents;
        if (wantName || addParent) {
            var parts = normRel(cur.rel).split('/');
            var oldName = parts.pop();
            var destParentRel = parts.join('/');
            if (addParent) {
                var dp = relOf(String(addParent).split(',')[0].trim());
                if (!dp) throw new Error('모르는 대상 폴더 id: ' + addParent);
                destParentRel = dp.rel;
            }
            var newRel = joinRel(destParentRel, wantName || oldName);
            if (newRel !== cur.rel) {
                var res = await readRel(cur.rel);
                var buf = await res.arrayBuffer();
                await writeRel(newRel, bytesToB64(buf), true);
                await nasJson('POST', '/nas/app/delete', { rel: cur.rel });
                note('moved', { from: cur.rel, to: newRel });
                return await driveGetMeta(newRel, false);
            }
        }
        return await driveGetMeta(cur.rel, false);
    }

    function bytesToB64(buf) {
        var bytes = new Uint8Array(buf), s = '';
        for (var i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(s);
    }

    // ── fetch 가로채기 ─────────────────────────────────────────────────────
    var DRIVE_RE = /^https?:\/\/(?:www\.)?googleapis\.com\/(upload\/)?drive\/v3\/files(\/([^/?#]+))?(\/(copy|export))?/;

    // ═══════════════════════════════════════════════════════════════════════
    // 🪞 미러 모드 — Drive 에 쓸 때 NAS 에도 같이 쓴다. **읽기는 전부 Drive.**
    //
    // 왜 이 단계가 있나: 바로 갈아타면 뭐가 틀렸을 때 **되돌릴 기준이 없다.**
    //   미러 동안은 Drive 가 계속 정답이라, 실데이터로 NAS 쓰기가 검증되는 동안에도
    //   앱은 지금과 똑같이 돈다. 어느 시점에 읽기만 NAS 로 돌리면 이사가 끝난다.
    //
    // ⚠️⚠️ **불변식 하나: 미러는 앱에 절대 영향을 주지 않는다.**
    //    ① Drive 응답을 **그대로** 돌려준다(손대지 않는다)
    //    ② Drive 가 실패하면 미러하지 않는다
    //    ③ NAS 쪽 실패는 **던지지 않는다** — 세고, 적고, 콘솔에 경고만 한다
    //    ④ 응답을 **기다리게 하지 않는다**(쓰기가 NAS 왕복만큼 느려지면 안 된다)
    //    ⚠️ 그래서 `res.clone()` 을 쓴다 — 본문은 한 번만 읽을 수 있고, 그 한 번은
    //       **앱 몫**이다. 원본을 읽으면 앱이 빈 본문을 받는다.
    // ⚠️ 기다리지 않는 대신 **경로별로 줄을 세운다** — 자동저장(1분)과 수동 저장이
    //    겹치면 순서가 뒤집혀 옛 내용이 나중에 쓰일 수 있다.
    // ═══════════════════════════════════════════════════════════════════════
    //  ⚠ `baseFetch` 는 **검증용 경계 주입구**다. 평상엔 진짜 `fetch` 가 들어간다.
    //    Drive 는 로그인 없이 못 부르는데, 그렇다고 검증을 건너뛰면 안 된다 —
    //    가짜는 **바깥 경계(Drive)에만** 두고 안쪽(경로 해석·줄 세우기·NAS 쓰기)은 진짜로 돌린다.
    //    NAS 쪽은 `nasJson`/`writeRel` 이 모듈 밖 `_origFetch` 를 써서 **항상 진짜**다.
    function installMirror(baseFetch) {
        var bfetch = baseFetch || _origFetch;
        var stats = { ok: 0, fail: 0, skip: 0, pending: 0, lastError: null, lastOkAt: null };
        var chains = {};            // 키별 직렬 체인 — 순서 보장
        var folderRelCache = {};    // Drive 폴더 id → 앱 루트 기준 상대경로
        var MAX_HOPS = 6;

        function driveToken() {
            try {
                var t = window.gapi && gapi.client && gapi.client.getToken && gapi.client.getToken();
                return (t && t.access_token) || null;
            } catch (e) { return null; }
        }

        async function driveMeta(fileId) {
            // ⚠ 토큰이 없다고 **미리 막지 않는다** — 진짜 Drive 는 401 로 분명히 말해 주고,
            //   경계를 가짜로 바꿔 돌리는 검증에서는 토큰이 아예 없다.
            var t = driveToken();
            var r = await bfetch('https://www.googleapis.com/drive/v3/files/' +
                encodeURIComponent(fileId) + '?fields=name,parents,mimeType&supportsAllDrives=true',
                t ? { headers: { Authorization: 'Bearer ' + t } } : undefined);
            if (!r.ok) throw new Error('Drive 메타 조회 실패(HTTP ' + r.status + '): ' + fileId);
            return await r.json();
        }

        /** Drive 폴더 id → 앱 루트 기준 상대경로. 앱 루트까지 **반드시 올라가야** 한다. */
        async function folderRel(folderId) {
            if (!folderId) throw new Error('부모 폴더 id 가 없습니다');
            if (folderId === rootId()) return '';
            if (folderRelCache[folderId] !== undefined) return folderRelCache[folderId];
            var names = [], cur = folderId, hops = 0;
            while (cur && cur !== rootId()) {
                if (++hops > MAX_HOPS) throw new Error('앱 루트까지 못 올라갔습니다: ' + folderId);
                var meta = await driveMeta(cur);
                names.unshift(meta.name);
                cur = (meta.parents || [])[0];
            }
            // ⚠️ 여기서 멈추지 않으면 **앱과 무관한 폴더가 앱 루트로 접힌다.**
            //    (올라가다 Drive 최상위에 닿으면 cur 이 undefined 가 된다)
            if (cur !== rootId()) throw new Error('OUTSIDE:앱 폴더 밖입니다 — 미러하지 않습니다');
            var rel = names.join('/');
            folderRelCache[folderId] = rel;
            return rel;
        }

        async function relOfDriveFile(fileId) {
            var meta = await driveMeta(fileId);
            return joinRel(await folderRel((meta.parents || [])[0]), meta.name);
        }

        /** 키별로 줄을 세워 실행. **절대 던지지 않는다.** */
        function enqueue(key, label, fn) {
            stats.pending++;
            var prev = chains[key] || Promise.resolve();
            var next = prev.then(fn).then(function () {
                stats.ok++; stats.lastOkAt = Date.now();
                note('mirror-ok', label);
            }, function (e) {
                var why = String((e && e.message) || e);
                if (why.indexOf('OUTSIDE:') === 0) {       // 앱 폴더 밖 — 고장이 아니다
                    stats.skip++; note('mirror-skip', { label: label, why: why.slice(8) });
                } else {
                    stats.fail++; stats.lastError = why;
                    note('mirror-fail', { label: label, why: why });
                    console.warn('[storage-adapter] 🪞 미러 실패 — **앱에는 영향 없습니다**(Drive 가 정답):',
                                 label, why);
                }
            }).then(function () { stats.pending--; });
            chains[key] = next;
            return next;
        }

        async function mirrorMove(fromRel, toRel) {
            var res = await readRel(fromRel);
            var buf = await res.arrayBuffer();
            await writeRel(toRel, bytesToB64(buf), true);
            await nasJson('POST', '/nas/app/delete', { rel: fromRel });
        }

        window.fetch = async function (input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url) || '';
            var m = DRIVE_RE.exec(url);
            if (!m) return bfetch(input, init);

            var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (method === 'GET') return bfetch(input, init);   // 읽기는 그대로 Drive

            var isUpload = !!m[1];
            var sub = m[5] || '';
            var fileId = m[3] ? decodeURIComponent(m[3]) : '';
            var body = (init && init.body) || null;
            var ctype = ((init && init.headers && (init.headers['Content-Type'] ||
                          (init.headers.get && init.headers.get('Content-Type')))) || '');

            // ⚠️ 지우거나 옮기기 **전에** 지금 경로를 알아 둬야 한다 — Drive 가 먼저 바꾸면
            //    어디 있던 파일인지 물어볼 데가 없다.
            var beforeRel = null;
            if ((method === 'DELETE' || (method === 'PATCH' && !isUpload) || sub === 'copy') && fileId) {
                try { beforeRel = await relOfDriveFile(fileId); } catch (e) { beforeRel = null; }
            }

            var res = await bfetch(input, init);
            if (!res.ok) return res;        // Drive 가 실패했으면 미러할 것도 없다

            try {
                if (sub === 'copy') {
                    // 백업의 서버 사본. 새 파일 id 는 **응답**에 있다 → clone 해서 읽는다.
                    var src = beforeRel;
                    enqueue('copy:' + fileId, 'copy ' + fileId, async function () {
                        if (!src) throw new Error('OUTSIDE:원본 경로를 못 찾았습니다');
                        var j = await res.clone().json();
                        if (!j || !j.id) throw new Error('사본 응답에 id 가 없습니다');
                        var destRel = await relOfDriveFile(j.id);
                        var r = await readRel(src);
                        await writeRel(destRel, bytesToB64(await r.arrayBuffer()), true);
                    });
                } else if (isUpload) {
                    var mp = parseMultipart(body, ctype);
                    if (mp) {
                        if (method === 'POST') {
                            // ⚠⚠ 여기서 한 번 틀렸다 — `relFromMeta` 는 **NAS id**(`nas_d_…`) 를 기대하는
                            //    함수다. 미러 모드의 `parents` 는 **진짜 Drive 폴더 id** 라 전부
                            //    '모르는 부모 폴더 id' 로 떨어졌고, NAS 에 한 건도 안 올라갔다.
                            //    모드마다 **id 공간이 다르다** — 미러는 `folderRel` 로 풀어야 한다.
                            var meta = mp.meta, pid = (meta.parents || [])[0];
                            enqueue('new:' + pid + '/' + meta.name, 'create ' + meta.name, async function () {
                                var relNew = joinRel(await folderRel(pid), meta.name);
                                return writeRel(relNew, mp.media, mp.mediaIsB64);
                            });
                        } else if (fileId) {
                            enqueue(fileId, 'update ' + fileId, async function () {
                                return writeRel(await relOfDriveFile(fileId), mp.media, mp.mediaIsB64);
                            });
                        }
                    }
                } else if (method === 'POST') {
                    var meta0 = {};
                    try { meta0 = JSON.parse(body); } catch (e) { /* ignore */ }
                    if (meta0 && meta0.mimeType === FOLDER_MIME && meta0.name) {
                        var fpid = (meta0.parents || [])[0];
                        enqueue('mkdir:' + fpid + '/' + meta0.name, 'mkdir ' + meta0.name, async function () {
                            var frel = joinRel(await folderRel(fpid), meta0.name);
                            return nasJson('POST', '/nas/app/mkdir', { rel: frel });
                        });
                    }
                } else if (method === 'PATCH' && fileId) {
                    var was = beforeRel;
                    enqueue(fileId, 'move/rename ' + fileId, async function () {
                        if (!was) throw new Error('OUTSIDE:옮기기 전 경로를 못 찾았습니다');
                        var now = await relOfDriveFile(fileId);
                        if (now !== was) await mirrorMove(was, now);
                    });
                } else if (method === 'DELETE' && fileId) {
                    var del = beforeRel;
                    enqueue(fileId, 'delete ' + fileId, function () {
                        if (!del) throw new Error('OUTSIDE:지우기 전 경로를 못 찾았습니다');
                        return nasJson('POST', '/nas/app/delete', { rel: del });
                    });
                }
            } catch (e) {
                // 미러를 **거는 것**조차 실패해도 앱은 그대로 간다.
                stats.fail++; stats.lastError = String((e && e.message) || e);
                note('mirror-fail', { label: method + ' ' + url, why: stats.lastError });
                console.warn('[storage-adapter] 🪞 미러 예약 실패 — 앱에는 영향 없습니다:', e);
            }
            return res;        // ⚠️ Drive 응답을 **손대지 않고** 그대로
        };

        window.STORAGE_ADAPTER.installed = true;
        window.STORAGE_ADAPTER.mode = 'mirror';
        window.STORAGE_ADAPTER.log = function () { return _log.slice(); };
        window.STORAGE_ADAPTER.mirror = {
            stats: function () { return JSON.parse(JSON.stringify(stats)); },
            /** 줄 선 미러 쓰기가 다 끝날 때까지 — 검증·수동 확인용. */
            drain: function () { return Promise.all(Object.keys(chains).map(function (k) { return chains[k]; })); },
            _fn: { folderRel: folderRel, relOfDriveFile: relOfDriveFile, enqueue: enqueue },
            /** 검증 전용 — Drive 경계를 가짜로 바꾸어 다시 깜. 사용 후 새로고침할 것. */
            _reinstall: function (fakeDriveFetch) { installMirror(fakeDriveFetch); }
        };
        console.warn('[storage-adapter] 🪞 미러 모드 — Drive 에 쓰면서 NAS 에도 같이 씁니다.' +
                     ' 읽기는 전부 Drive 이고, NAS 실패는 앱에 영향을 주지 않습니다.' +
                     ' 상태: STORAGE_ADAPTER.mirror.stats()');
    }

    if (MODE === 'mirror') { installMirror(); return; }

    window.fetch = async function (input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var m = DRIVE_RE.exec(url);
        if (!m) return _origFetch(input, init);

        await ensureIdMap();                     // 🗺 옛 id 를 풀 수 있게 먼저 읽어 둔다
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        var sub = m[5] || '';                    // copy / export
        var fileId = m[3] ? decodeURIComponent(m[3]) : '';
        var u;
        try { u = new URL(url); } catch (e) { u = { searchParams: new URLSearchParams() }; }
        var params = {};
        u.searchParams.forEach(function (v, k) { params[k] = v; });
        var body = (init && init.body) || null;
        var ctype = ((init && init.headers && (init.headers['Content-Type'] ||
                      (init.headers.get && init.headers.get('Content-Type')))) || '');

        note('fetch', method + ' ' + (m[1] ? 'upload ' : '') + (fileId || '(collection)') + (sub ? '/' + sub : ''));

        try {
            if (sub === 'copy') {
                // 백업의 "서버 복사" 빠른 길. 앱은 이게 실패하면 **직접 업로드로 폴백**한다
                // (js/04b backupToDrive) — 그러니 실패가 정상 동작이다. 시끄럽게 굴지 않는다.
                var ec = new Error('NAS 모드에는 서버 사본이 없습니다 — 직접 업로드로 폴백합니다.');
                ec.expected = true;
                throw ec;
            }
            if (sub === 'export') {
                // 참조 시트(Google Sheet) 내보내기 — NAS 로 옮길 수 없는 것이다. 솔직하게 막는다.
                throw new Error('NAS 모드에서는 Google 시트 내보내기를 쓸 수 없습니다.');
            }

            if (method === 'GET' && !fileId) {
                return jsonResponse(await driveList(params));
            }
            if (method === 'GET' && fileId) {
                var g = relOf(fileId);
                if (!g) throw new Error('모르는 파일 id: ' + fileId);
                if (params.alt === 'media') return await readRel(g.rel);
                return jsonResponse(await driveGetMeta(g.rel, g.isdir));
            }
            if (method === 'POST') {
                var mp = parseMultipart(body, ctype);
                if (mp) return jsonResponse(await driveCreate(mp.meta, mp.media, mp.mediaIsB64));
                // uploadType=media 또는 메타만 있는 POST(폴더 만들기)
                if (m[1]) throw new Error('metadata 없는 업로드는 대상 경로를 알 수 없습니다.');
                var metaOnly = {};
                try { metaOnly = JSON.parse(body); } catch (e) { /* ignore */ }
                return jsonResponse(await driveCreate(metaOnly, null, false));
            }
            if (method === 'PATCH') {
                var mp2 = parseMultipart(body, ctype);
                if (mp2) return jsonResponse(await driveUpdate(fileId, mp2.meta, mp2.media, mp2.mediaIsB64));
                if (m[1]) {
                    // 업로드 엔드포인트 + multipart 아님 = uploadType=media (본문이 곧 내용)
                    return jsonResponse(await driveUpdate(fileId, null, body, false));
                }
                var meta2 = {};
                try { meta2 = JSON.parse(body); } catch (e) { /* ignore */ }
                return jsonResponse(await driveUpdate(fileId, meta2, null, false));
            }
            if (method === 'DELETE') {
                var d = relOf(fileId);
                if (!d) throw new Error('모르는 파일 id: ' + fileId);
                await nasJson('POST', '/nas/app/delete', { rel: d.rel });
                // ⚠️ 204 는 **본문을 가질 수 없다** — `new Response('', …)` 는 빈 문자열도
                //    본문으로 쳐서 TypeError 를 던진다. 실제로 삭제는 됐는데 그 뒤에서 터져
                //    "500 실패"로 보고됐다(2026-11-03 실측). 반드시 null.
                return new Response(null, { status: 204 });
            }
            throw new Error('아직 안 만든 경로: ' + method + ' ' + url);
        } catch (e) {
            note('error', String(e && e.message || e));
            // ⚠️ 조용히 실패하지 않는다 — 콘솔에 남기고 Drive 오류 모양으로 돌려준다.
            //    단 앱이 폴백을 **가지고 있는** 실패(expected)는 경고로만 — 가짜 경보를 만들지 않는다.
            if (e && e.expected) console.warn('[storage-adapter]', method, url, e.message);
            else console.error('[storage-adapter]', method, url, e);
            return errResponse(e, /없습니다/.test(String(e && e.message)) ? 404 : 500);
        }
    };

    // ── gapi.client.drive.files 가로채기 ───────────────────────────────────
    // 앱은 `gapi.client.drive.files.get/list` 를 쓰고 결과를 `resp.result` 에서 읽는다.
    // gapi 가 나중에 `gapi.client.init` 으로 drive 를 다시 심으므로 **덮였는지 지켜본다**.
    var stub = {
        files: {
            list: async function (p) {
                await ensureIdMap();
                return { result: await driveList(p || {}), status: 200 };
            },
            get: async function (p) {
                await ensureIdMap();
                p = p || {};
                var g = relOf(p.fileId);
                if (!g) throw new Error('모르는 파일 id: ' + p.fileId);
                if (p.alt === 'media') {
                    var res = await readRel(g.rel);
                    return { body: await res.text(), status: 200 };
                }
                return { result: await driveGetMeta(g.rel, g.isdir), status: 200 };
            }
        },
        about: { get: async function () { return { result: { user: { emailAddress: 'nas' } }, status: 200 }; } }
    };

    function implant() {
        try {
            if (!window.gapi) window.gapi = {};
            if (!window.gapi.client) window.gapi.client = {};
            if (window.gapi.client.drive !== stub) {
                // ⚠️ `gapi.client.init({discoveryDocs})` 가 나중에 `drive` 를 **덮어쓴다.**
                //    그 1초가 "조용히 Drive 로 나가는" 창이 된다 — 그래서 아래 세 겹으로 막는다:
                //      ① 못 덮게 defineProperty(getter) ② init 직후 다시 심기 ③ 1초 간격 백스톱
                try {
                    Object.defineProperty(window.gapi.client, 'drive', {
                        configurable: true, get: function () { return stub; }, set: function () { }
                    });
                } catch (e) { window.gapi.client.drive = stub; }
            }
            if (typeof window.gapi.client.getToken !== 'function') {
                // NAS 모드엔 Drive 토큰이 없다. 앱이 "연결됨"으로 보도록 가짜 토큰을 준다.
                window.gapi.client.getToken = function () { return { access_token: 'nas' }; };
                window.gapi.client.setToken = function () { };
            }
        } catch (e) { console.error('[storage-adapter] gapi 심기 실패', e); }
    }
    implant();
    // ② gapi 초기화가 끝나는 **그 순간** 다시 심는다(폴링을 기다리지 않는다).
    if (typeof window.intializeGapiClient === 'function') {
        var _origInit = window.intializeGapiClient;
        window.intializeGapiClient = async function () {
            var r;
            try { r = await _origInit.apply(this, arguments); } finally { implant(); }
            return r;
        };
    }
    setInterval(implant, 1000);   // ③ 백스톱 — 위 둘이 다 빗나가도 1초 안에 되돌린다

    window.STORAGE_ADAPTER.installed = true;
    window.STORAGE_ADAPTER.mode = 'nas';
    window.STORAGE_ADAPTER.log = function () { return _log.slice(); };
    window.STORAGE_ADAPTER._io = {
        listRel: listRel, readRel: readRel, writeRel: writeRel,
        driveList: driveList, driveGetMeta: driveGetMeta,
        driveCreate: driveCreate, driveUpdate: driveUpdate
    };
    console.warn('[storage-adapter] 🔀 NAS 모드로 돌고 있습니다 — Drive 를 부르지 않습니다.' +
                 ' 끄려면: localStorage.removeItem("gantt_storage_backend") 후 새로고침');
})();
