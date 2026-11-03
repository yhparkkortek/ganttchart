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
// ⚠️⚠️ 플래그가 'nas' 가 아니면 **아무것도 감싸지 않는다.** 파일을 읽어 들이기만 하고
//    즉시 return 한다 — 플래그를 안 켠 사람의 코드 경로는 이 파일이 없을 때와 **완전히 동일**하다.
//    (지금 앱을 쓰는 사람들이 있다 — 이 파일 하나로 그 사람들 저장이 바뀌면 안 된다)
//
//    켜기:  localStorage.setItem('gantt_storage_backend', 'nas')   → 새로고침
//    끄기:  localStorage.removeItem('gantt_storage_backend')       → 새로고침
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

    /** 상대경로 → Drive 흉내 fileId. rel 이 비면 루트 id. */
    function idOf(rel, isdir) {
        rel = normRel(rel);
        if (!rel) return rootId();
        return 'nas_' + (isdir ? 'd' : 'f') + '_' + b64urlEncode(rel);
    }

    /** fileId → {rel, isdir}. 우리가 만든 id 가 아니면 null(= 우리 것이 아니니 건드리지 않는다). */
    function relOf(id) {
        id = String(id || '');
        if (id && id === rootId()) return { rel: '', isdir: true };
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
                out.unknown.push(c);
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
            parseQ: parseQ, parseMultipart: parseMultipart,
            mimeOf: mimeOf, toDriveFile: toDriveFile, rootId: rootId
        }
    };

    // ⚠️ 여기서 끝. 플래그가 꺼져 있으면 **아무것도 감싸지 않는다.**
    if (currentBackend() !== 'nas') return;

    // ───────────────────────────────────────────────────────────────────────
    // 여기서부터는 플래그가 켜졌을 때만 돈다.
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
            throw new Error('NAS ' + route + ' 실패(HTTP ' + res.status + '): ' +
                            ((j && j.message) || '사유 없음'));
        }
        return j || {};
    }

    function qs(rel) { return '?rel=' + encodeURIComponent(normRel(rel)); }

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
            if (!pr) { note('list-unknown-parent', parentIds[i]); continue; }
            var items;
            try { items = await listRel(pr.rel); }
            catch (e) {
                // ⚠️ 권한이 없는 폴더는 **건너뛴다**. 통째로 실패하면 목록이 0건이 된다
                //    (팀별 폴더는 서로 열람 권한이 없는 게 정상이다).
                note('list-skip', { rel: pr.rel, why: String(e.message || e) });
                continue;
            }
            for (var k = 0; k < items.length; k++) {
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

    window.fetch = async function (input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var m = DRIVE_RE.exec(url);
        if (!m) return _origFetch(input, init);

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
                return new Response('', { status: 204 });
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
            list: async function (p) { return { result: await driveList(p || {}), status: 200 }; },
            get: async function (p) {
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
    window.STORAGE_ADAPTER.log = function () { return _log.slice(); };
    window.STORAGE_ADAPTER._io = {
        listRel: listRel, readRel: readRel, writeRel: writeRel,
        driveList: driveList, driveGetMeta: driveGetMeta,
        driveCreate: driveCreate, driveUpdate: driveUpdate
    };
    console.warn('[storage-adapter] 🔀 NAS 모드로 돌고 있습니다 — Drive 를 부르지 않습니다.' +
                 ' 끄려면: localStorage.removeItem("gantt_storage_backend") 후 새로고침');
})();
