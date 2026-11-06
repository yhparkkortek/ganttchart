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

    //  🗄️ [2026-11-04] **플래그가 없으면 사내 NAS 다**(STORAGE_POLICY.nasOnly, js/04a).
    //    그전엔 없으면 'drive' 였다 — 즉 아무것도 안 한 사람은 드라이브에 남았고, 그 사람
    //    것만 조용히 갈라졌다. 이제 아무것도 안 하면 팀과 같은 곳(NAS)에 저장된다.
    //    ⚠️ **명시적으로 저장된 값은 그대로 존중한다** — 콘솔에서 'drive' 를 넣어 둔 사람은
    //       비상 탈출구를 쓴 것이다. 그 사람에겐 "드라이브에 저장되고 있다" 배너가 뜬다.
    function currentBackend() {
        var saved = '';
        try { saved = String(localStorage.getItem(FLAG_KEY) || '').toLowerCase(); }
        catch (e) { saved = ''; }       // 시크릿 모드 등에서 localStorage 가 던질 수 있다
        if (saved === 'drive' || saved === 'mirror' || saved === 'nas') return saved;
        return ((window.STORAGE_POLICY || {}).nasOnly) ? 'nas' : 'drive';
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
    var ID_MAP_REL_ADAPTER = 'App_Config/nas_id_map.json';   // js/58 이 만드는 그 파일
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
        // 🗓 [2026-11-05] `createdTime` 도 채운다 — Drive 는 주던 값이고 **복원 목록이 그걸로
        //    백업 시각을 찍는다**(js/04c `new Date(file.createdTime)`). NAS 엔 없어서
        //    `Invalid Date` 가 떴다(실측: 백업 502건 전부 createdTime 없음 → 날짜 칸이 깨짐).
        //    ⚠️ 백업은 **파일 이름의 타임스탬프가 가장 정확하다.** mtime 은 11-03 이사 때
        //       전부 복사 시각으로 바뀌어서, 그걸 쓰면 502건이 전부 같은 날로 보인다.
        var stamp = backupStampOf(item.name);
        f.createdTime = stamp || f.modifiedTime || undefined;
        if (f.createdTime === undefined) delete f.createdTime;
        if (item.size !== null && item.size !== undefined) f.size = String(item.size);
        return f;
    }

    /** `백업_<원본>_<YYYYMMDD>_<HHMM>.json` → ISO 시각. 백업이 아니면 ''. */
    function backupStampOf(name) {
        var m = /_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.json$/i.exec(String(name || ''));
        if (!m) return '';
        var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    }

    /** `백업_<원본>_<YYYYMMDD>_<HHMM>.json` → `<원본>.json`. 백업이 아니면 ''. */
    function backupOrigNameOf(name) {
        var s = String(name || '');
        if (!/^백업_/.test(s) || !/_\d{8}_\d{4}\.json$/i.test(s)) return '';
        return s.replace(/^백업_/, '').replace(/_\d{8}_\d{4}\.json$/i, '') + '.json';
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
            mimeOf: mimeOf, toDriveFile: toDriveFile, rootId: rootId,
            backupStampOf: backupStampOf, backupOrigNameOf: backupOrigNameOf
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

    // ═══ 🔀 저장소 바꾸기 UI ═══════════════════════════════════════════════
    //  ⚠️ 이 블록은 **플래그 검사보다 위**에 있지만, 부르기 전에는 아무 일도 하지 않는다 —
    //     함수를 내놓을 뿐 화면도 네트워크도 건드리지 않는다. 그래서 "플래그 OFF 면
    //     지금과 동일" 이라는 약속은 그대로다.
    //  ⚠️ **Drive 모드에서는 배지를 안 띄운다.** 아직 안 옮긴 팀원 화면에 못 보던 아이콘이
    //     생기면 그것만으로 연락이 온다. Drive 에서 들어가는 길은 🔑 설정 모달 쪽에 둔다.
    var STORAGE_MODES = [
        { id: 'drive', icon: '☁️',
          ko: '구글 드라이브', en: 'Google Drive',
          koDesc: '지금까지 쓰던 방식', enDesc: 'What you have been using',
          // 전환 선언이 켜지면 이 줄로 바뀐다 — "쓸 수 있다"와 "써도 된다"는 다르다.
          koDescAfter: '⚠️ 전환 전까지만 — 여기서 만든 내용은 팀에 안 보입니다',
          enDescAfter: '⚠️ Only until you switch — what you save here is invisible to the team',
          koWarnAfter: '⚠️ 이 팀의 데이터는 이제 사내 NAS 에 있습니다.\n\n'
                     + '드라이브로 돌아가면 「여기서 저장한 새 내용은 팀원에게 안 보이고」 '
                     + '팀원이 NAS 에 저장한 내용도 나에게 안 보입니다.\n\n'
                     + '백엔드가 꺼져서 급히 보기만 하려는 경우가 아니라면 되돌리지 마세요.',
          enWarnAfter: 'The team data now lives on the in-house NAS. If you go back to Drive, '
                     + 'what you save here will not be visible to your team, and vice versa.',
          koWarn: '구글 드라이브로 돌아갑니다.\n\n⚠️ NAS 모드에서 저장한 내용은 NAS 에만 있습니다 — '
                + '드라이브에는 그때까지의 내용만 있습니다.',
          enWarn: 'Switch back to Google Drive.\n\nAnything saved while in NAS mode lives only on the NAS.' },
        { id: 'mirror', icon: '🪞', afterCutover: 'hide',   // 이사 중간 단계 — 끝났으면 안 보인다
          ko: '미러 (둘 다)', en: 'Mirror (both)',
          koDesc: '드라이브에 저장하면서 NAS 에도 같이 씀 · 읽기는 드라이브',
          enDesc: 'Save to Drive and mirror to NAS · reads from Drive',
          koWarn: '드라이브에 저장하면서 NAS 에도 같이 씁니다.\n\n읽기는 드라이브이고, '
                + 'NAS 쪽이 실패해도 앱은 그대로 돌아갑니다.',
          enWarn: 'Saves to Drive and mirrors to the NAS. Reads still come from Drive.' },
        { id: 'nas', icon: '🗄️',
          ko: '사내 NAS', en: 'In-house NAS',
          koDesc: '읽기·쓰기 모두 NAS · 구글 드라이브를 쓰지 않음',
          enDesc: 'Reads and writes on the NAS · Google Drive not used',
          koWarn: '이제부터 읽기·쓰기가 모두 사내 NAS 로 갑니다.\n\n'
                + '⚠️ 백엔드(kortek_backend)가 꺼져 있으면 데이터를 읽을 수 없습니다.\n'
                + '⚠️ 여기서 저장한 내용은 구글 드라이브에 남지 않습니다.',
          enWarn: 'All reads and writes go to the in-house NAS. The local backend must be running.' }
    ];

    /** 전환 선언이 켜져 있나 — 데이터(js/04a `STORAGE_POLICY`)만 본다. */
    function cutover() {
        var p = window.STORAGE_POLICY || {};
        return !!p.cutover;
    }

    /** 모드를 바꾼다. **어디에 저장되는지가 바뀌는 일**이라 반드시 물어보고 바꾼다. */
    //  opts.silent — **이미 사람 확인을 받은 경로**에서만 쓴다(🚀 간편 전환). 확인창을 두 번
    //  띄우면 두 번째를 읽지 않고 누르게 되고, 그러면 확인창이 있는 의미가 없어진다.
    window.storageSetMode = function (id, opts) {
        var m = STORAGE_MODES.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        var now = currentBackend();
        if (now === id) return;
        var en = window._currentLang === 'en';
        var head = (en ? 'Switch storage to ' : '저장소를 바꿉니다 → ') + m.icon + ' ' + (en ? m.en : m.ko);
        // 전환이 끝난 뒤 Drive 로 되돌리는 건 **데이터가 갈라지는 일**이다 — 문구를 바꿔 말한다.
        var warn = (cutover() && (en ? m.enWarnAfter : m.koWarnAfter)) || (en ? m.enWarn : m.koWarn);
        if (!(opts && opts.silent)
            && !confirm(head + '\n\n' + warn + '\n\n'
                        + (en ? 'The page will reload.' : '페이지를 새로고침합니다.'))) return;
        try {
            if (id === 'drive') localStorage.removeItem('gantt_storage_backend');
            else localStorage.setItem('gantt_storage_backend', id);
        } catch (e) {
            alert(en ? 'Could not save the setting (localStorage blocked).'
                     : '설정을 저장하지 못했습니다(localStorage 가 막혀 있습니다).');
            return;
        }
        location.reload();
    };

    /** 작은 고르기 창. 바로 토글하지 않고 **세 가지를 보여주고 고르게** 한다 —
     *  돌려 가며 누르다 엉뚱한 모드에 멈추면 그게 제일 나쁘다. */
    window.storageOpenSwitcher = function (anchor) {
        var old = document.getElementById('storage-switch-pop');
        if (old) { old.remove(); return; }                 // 한 번 더 누르면 닫힘
        var en = window._currentLang === 'en';
        var now = currentBackend();
        var pop = document.createElement('div');
        pop.id = 'storage-switch-pop';
        pop.style.cssText = 'position:fixed; z-index:100000; background:#fff; border:1px solid #d0d0d0;'
            + ' border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.18); padding:6px; min-width:288px;'
            + ' font-size:12px; color:#333;';
        pop.innerHTML = '<div style="padding:5px 8px 7px; color:#777; font-size:11px;">'
            + (en ? 'Where the app saves' : '앱 데이터를 어디에 저장할까요') + '</div>'
            + STORAGE_MODES.filter(function (m) {
                // 지금 쓰고 있는 모드는 숨기지 않는다 — 내가 어디 있는지는 항상 보여야 한다.
                return !(cutover() && m.afterCutover === 'hide' && m.id !== now);
            }).map(function (m) {
                var cur = m.id === now;
                var desc = (cutover() && (en ? m.enDescAfter : m.koDescAfter)) || (en ? m.enDesc : m.koDesc);
                return '<button data-mode="' + m.id + '"' + (cur ? ' disabled' : '')
                    + ' style="display:block; width:100%; box-sizing:border-box; text-align:left;'
                    + ' padding:7px 9px; margin:0 0 2px; border:none; border-radius:6px;'
                    + ' background:' + (cur ? '#eef3ff' : 'transparent') + '; cursor:' + (cur ? 'default' : 'pointer') + ';">'
                    + '<span style="font-size:14px;">' + m.icon + '</span> '
                    + '<b style="color:' + (cur ? '#1971c2' : '#333') + ';">' + (en ? m.en : m.ko) + '</b>'
                    + (cur ? ('<span style="color:#1971c2;"> ● ' + (en ? 'now' : '지금') + '</span>') : '')
                    + '<div style="color:' + (/⚠️/.test(desc) ? '#b1432f' : '#777')
                    + '; font-size:11px; margin-top:2px; line-height:1.45;">'
                    + desc + '</div></button>';
            }).join('');
        document.body.appendChild(pop);
        var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 20, bottom: 40 };
        // 화면 밖으로 나가지 않게 — 배지는 헤더 오른쪽에 있을 수 있다
        pop.style.top = Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 10) + 'px';
        pop.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - pop.offsetWidth - 10)) + 'px';
        pop.addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-mode]');
            if (!b || b.disabled) return;
            pop.remove();
            window.storageSetMode(b.getAttribute('data-mode'));
        });
        setTimeout(function () {
            document.addEventListener('mousedown', function closer(ev) {
                if (pop.contains(ev.target)) return;
                pop.remove();
                document.removeEventListener('mousedown', closer);
            });
        }, 0);
    };

    // ═══ 📢 배너 ═════════════════════════════════════════════════════════
    //  ⚠️ 조용한 실패가 제일 나쁘다 — 둘 다 "모르고 지나가는" 상태를 없애려는 것이다:
    //     ① Drive 모드인데 팀은 NAS 로 넘어간 상태(새 데이터가 갈라진다)
    //     ② NAS 모드인데 백엔드/로그인이 없는 상태(버튼이 회색인 이유를 사람이 모른다)
    function storageBanner(id, bg, bd, fg, html, buttons) {
        if (document.getElementById(id)) return;
        var go = function () {
            if (document.getElementById(id)) return;
            var el = document.createElement('div');
            el.id = id;
            el.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%);'
                + ' z-index:999997; display:flex; align-items:center; gap:10px; padding:10px 16px;'
                + ' background:' + bg + '; border:1px solid ' + bd + '; border-radius:8px; color:' + fg + ';'
                + ' font-size:12px; font-weight:bold; box-shadow:0 4px 14px rgba(0,0,0,.18);'
                + ' max-width:92vw; flex-wrap:wrap;';
            var bs = 'padding:4px 12px; border-radius:5px; font-size:11.5px; font-weight:bold; cursor:pointer;';
            el.innerHTML = '<span style="font-weight:normal;">' + html + '</span>'
                + (buttons || []).map(function (b, i) {
                    return '<button data-i="' + i + '" style="' + bs + ' border:1px solid ' + bd + ';'
                        + ' background:' + (b.primary ? fg : 'transparent') + ';'
                        + ' color:' + (b.primary ? '#fff' : fg) + ';">' + b.label + '</button>';
                }).join('')
                + '<button data-close="1" style="' + bs + ' border:none; background:transparent; color:' + fg + ';">✕</button>';
            el.addEventListener('click', function (ev) {
                var t = ev.target.closest('button');
                if (!t) return;
                if (t.getAttribute('data-close')) { el.remove(); return; }   // 이 창에서만 숨김
                var b = (buttons || [])[Number(t.getAttribute('data-i'))];
                if (b && b.onClick) b.onClick();
            });
            document.body.appendChild(el);
        };
        if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    }

    //  하네스가 배너 모양을 볼 수 있게 내놓는다(화면만 그린다 — 저장 경로와 무관).
    window._storageBanner = storageBanner;

    /** 🔑 설정을 열고 🚀 간편 전환 패널까지 펼쳐 준다 — "어디서 하나"를 묻지 않게. */
    window.storageOpenQuickSwitch = async function () {
        if (!window.openSapLoginSettings) { alert('설정 화면을 찾지 못했습니다.'); return; }
        await window.openSapLoginSettings();
        setTimeout(function () {
            var box = document.getElementById('naslogin-quick');
            if (box && box.style.display === 'none' && window._nasQuickToggle) window._nasQuickToggle();
            if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' });
        }, 700);
    };

    /** 📥 백엔드 설치 안내(알람 설정 안의 섹션)를 펼쳐 준다. */
    window.storageOpenBackendGuide = function () {
        if (window.openAlarmSettings) window.openAlarmSettings();
        setTimeout(function () {
            var sec = document.getElementById('sec-server');
            if (sec && sec.style.display === 'none' && window._toggleAlarmSection) {
                window._toggleAlarmSection('sec-server');
            }
            if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'center' });
        }, 500);
    };

    // ⚠️ 여기서 끝. 플래그가 꺼져 있으면 **저장 경로는 아무것도 감싸지 않는다.**
    //    (2026-11-04 보탬: 경로는 그대로 두되, 전환 선언이 켜졌으면 **안내만** 한다 —
    //     안 옮긴 팀원이 "지금 어디에 저장되고 있는지" 모르는 게 이 단계의 제일 큰 위험이다.)
    var MODE = currentBackend();
    if (MODE !== 'nas' && MODE !== 'mirror') {
        if (cutover()) {
            var en0 = window._currentLang === 'en';
            storageBanner('storage-cutover-banner', '#fff8e6', '#e6a817', '#7a5210',
                en0 ? ('This team saves to the in-house NAS since ' + ((window.STORAGE_POLICY || {}).since || '')
                       + '. You are still on Google Drive — <b>what you save here is not visible to the team.</b>')
                    : ('이 팀의 데이터는 ' + ((window.STORAGE_POLICY || {}).since || '') + ' 부터 <b>사내 NAS</b> 에 있습니다. '
                       + '지금은 ☁️ 구글 드라이브에 저장되고 있어 <b>여기서 만든 내용이 팀원에게 보이지 않습니다.</b>'),
                [{ label: '🚀 ' + (en0 ? 'Switch now' : '지금 전환'), primary: true,
                   onClick: function () { window.storageOpenQuickSwitch(); } }]);
        }
        return;
    }
    if (MODE === 'mirror' && cutover()) {
        var en1 = window._currentLang === 'en';
        storageBanner('storage-mirror-banner', '#fff8e6', '#e6a817', '#7a5210',
            en1 ? 'Mirror mode reads from Drive — you may not see what the team saved on the NAS.'
                : '🪞 미러 모드는 <b>읽기가 드라이브</b>라, 팀원이 NAS 에 저장한 내용이 안 보일 수 있습니다.',
            [{ label: '🚀 ' + (en1 ? 'Switch to NAS' : 'NAS 로 전환'), primary: true,
               onClick: function () { window.storageSetMode('nas'); } }]);
    }

    // ── 🏷 지금 데이터가 어디 있는지 **화면에 보여준다** ──────────────────
    //  ⚠️⚠️ 안 보여주면 사람이 알 수가 없다. 실제로 "이 주소를 쓰면 NAS 인가요?"라는
    //     질문을 받았다 — 주소로는 안 정해지고(플래그는 **브라우저마다** 따로다),
    //     앱은 NAS 모드에서도 헤더 배지에 **"구글 드라이브 연결됨"** 이라고 말하고 있었다.
    //     저장 위치를 잘못 알면 "어디에 저장됐는지 모르는" 상태가 된다.
    //  ⚠️ 기존 배지 함수(js/04b)를 **감싼다** — 그 함수가 여러 곳에서 불리므로 한 곳만 고치면 된다.
    //  🏷 [2026-11-04] **NAS 모드에선 배지를 아예 안 띄운다.**
    //    저장소가 하나뿐이면 "지금 어디에 저장되는지"는 늘 같은 답이라 말할 가치가 없다.
    //    ⚠️⚠️ 그렇다고 이 블록을 **지우면 안 된다.** 배지를 그리는 원래 함수(js/04b
    //       `_updateDriveConnBadge`)가 그 자리에 **"구글 드라이브 연결됨"** 을 다시 그린다 —
    //       그게 2026-11-04 에 고쳤던 바로 그 버그다(NAS 에 저장하면서 드라이브라고 말함).
    //       그래서 여기서 **끝까지 감싸서 숨긴다.**
    //    ⚠️ 미러는 비정상 상태라 **계속 보여준다** — 그건 말할 가치가 있다.
    var BADGE = {
        mirror: { icon: '🪞', ko: '구글 드라이브에 저장하면서 사내 NAS 에도 같이 씁니다 (읽기는 드라이브)',
                  en: 'Saving to Google Drive and mirroring to the in-house NAS (reads come from Drive)' }
    }[MODE];
    (function paintBadge() {
        function paint() {
            var el = document.getElementById('drive-conn-badge');
            if (!el) return;
            if (!BADGE) {                     // nas — 숨긴다(지우는 게 아니라 덮어쓴다)
                el.style.display = 'none';
                el.onclick = null;
                el.title = '';
                return;
            }
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
    //  🛡️🛡️ [2026-11-04] NAS 읽기는 **절대 캐시에서 오면 안 된다.**
    //    이 앱은 여러 파일을 "읽고 → 고쳐서 → 통째로 다시 쓴다"(프로젝트 색인·보관함·주소록…).
    //    읽기가 옛 사본이면 그 위에 쓰는 순간 **그 사이 바뀐 내용이 조용히 되돌아간다.**
    //    실제로 그렇게 색인의 projects 가 0건이 됐다(실측: 같은 순간 디스크 721,649 바이트 /
    //    브라우저가 준 것 489,543 바이트).
    //    백엔드에도 Cache-Control: no-store 를 달았지만 **구버전 백엔드가 도는 PC**가 있으므로
    //    프런트에서도 막는다 — 둘 다 걸어 두는 쪽이 맞다.
    //    ⚠️ cache:'no-store' 는 그 요청만 막는다. 이미 캐시에 들어앉은 항목까지 피하려면
    //       **URL 을 다르게** 해야 해서 _cb 도 같이 붙인다.
    async function nas(method, route, payload) {
        var url = BACKEND + route;
        var opts = { method: method };
        if (method === 'GET') {
            url += (route.indexOf('?') >= 0 ? '&' : '?') + '_cb=' + Date.now()
                 + '_' + Math.random().toString(36).slice(2, 8);
            opts.cache = 'no-store';
        }
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

    //  🛡 [2026-11-04] **색인을 빈 채로 덮어쓰지 못하게 한다.**
    //    실제로 당했다: NAS 의 `project_index.json` 이 `projects: []` 가 된 채
    //    `unmatchedClusters` 746건만 남았다. 이 파일은 메일 자동배분의 색인이고,
    //    담당자·팀·완료·테마색(Drive 의 appProperties 대용)이 전부 여기서 나온다.
    //    비어도 **오류가 나지 않는다** — 분류가 조용히 풀리고 배분이 빗나갈 뿐이다.
    //    ⚠️ 이 파일을 통째로 다시 쓰는 코드가 여럿이다(저장 시 upsert, 군집 감지 flush,
    //       삭제 정리…). 그중 누가 범인인지와 **무관하게** 막으려면 그들을 하나씩 고칠 게
    //       아니라 **쓰기 경계 한 곳**에서 막아야 한다. 여기가 그 한 곳이다.
    //    ⚠️ 평소에는 아무 비용도 들지 않는다 — 들어온 내용이 **0건일 때만** 현재 파일을 읽어 본다.
    async function guardIndexWrite(rel, text) {
        if (rel !== IDX_REL || typeof text !== 'string') return null;
        var incoming;
        try { incoming = JSON.parse(text); } catch (e) { return null; }   // 색인이 아니면 통과
        if (!incoming || !Array.isArray(incoming.projects)) return null;
        if (incoming.projects.length > 0) return null;                    // 정상적인 쓰기
        var now = [];
        try {
            var res = await nas('GET', '/nas/app/get' + qs(IDX_REL));
            if (res.ok) now = (JSON.parse(await res.text()).projects) || [];
        } catch (e) { return null; }      // 지금 것을 못 읽으면 판단 못 한다 — 막지 않는다
        if (!now.length) return null;     // 원래도 비어 있었다 — 이 쓰기가 범인은 아니다
        var msg = '프로젝트 색인을 0건으로 덮어쓰려 해서 막았습니다(지금 ' + now.length + '건). '
                + '담당자 분류·메일 자동배분이 조용히 풀리는 변경입니다.';
        console.error('[storage-adapter] ⛔ ' + msg);
        if (window._issueLog) {
            try {
                window._issueLog({ domain: 'storage', kind: 'index_wipe_blocked', route: '/nas/app/put',
                                   result: { errorRaw: msg }, env: { had: now.length } });
            } catch (e) { /* 기록 실패가 가드를 막지는 않는다 */ }
        }
        if (window.showToast) {
            try { window.showToast('⛔ ' + msg, 'warning', 12000); } catch (e) { /* ignore */ }
        }
        return { ok: false, blocked: 'index-wipe', message: msg };
    }

    //  하네스용 — **읽기만 하는 함수다**(막을지 말지를 판단할 뿐 쓰지 않는다).
    window._storageGuardIndexWrite = guardIndexWrite;

    async function writeRel(rel, media, isB64) {
        var payload = { rel: normRel(rel) };
        if (isB64) payload.b64 = media; else payload.text = String(media === null || media === undefined ? '' : media);
        if (payload.rel === IDX_REL) {
            var blocked = await guardIndexWrite(payload.rel, payload.text);
            if (blocked) return blocked;
            _idxAt = 0;   // 📇 꼬리표 출처가 바뀌었다 — 캐시 버림
        }
        return await nasJson('POST', '/nas/app/put', payload);
    }

    // ── 📄 팀 공용 파일 헬퍼 — **새 기능이 fetch 를 또 베끼지 않게** ────────────────
    // ⚠️ 이게 없어서 `/nas/app/*` 를 부르는 곳마다 `no-store`·`_cb` 난수·403/404 구분을
    //    각자 다시 짰다(js/36·js/58). 네 번째가 생기기 전에 한 곳으로 모은다 —
    //    "목록을 베끼면 한쪽만 살고 나머지는 조용히 빠진다"가 2026-11-04 의 반복 교훈이다.
    // ⚠️ 앱 루트 기준 **상대경로만** 받는다(백엔드가 절대경로 쓰기를 거부하는 이유와 같다:
    //    프런트 버그가 NAS 아무 데나 못 쓰게 + 사내 경로가 프런트 코드에 안 들어가게).
    // ⚠️ `get` 은 **없으면 null**(404 를 오류로 올리지 않는다 — "아직 안 쓴 파일"이 정상인
    //    기능이 많다). 권한 거부(403)는 그대로 던진다 — 그걸 null 로 삼키면 "없다"와
    //    "못 본다"가 섞여 조용한 오답이 된다.
    window.nasAppFile = {
        /** 텍스트로 읽는다. 없으면 null. JSON 이면 `json:true` 로 파싱까지. */
        get: async function (rel, opts) {
            opts = opts || {};
            var res = await nas('GET', '/nas/app/get' + qs(rel));
            if (res.status === 404) return null;
            if (!res.ok) {
                var e = new Error('NAS 읽기 실패(HTTP ' + res.status + '): ' + normRel(rel));
                e.status = res.status;
                throw e;
            }
            var txt = await res.text();
            if (!opts.json) return txt;
            try { return JSON.parse(txt); }
            catch (err) { throw new Error('JSON 이 아니다: ' + normRel(rel) + ' — ' + err.message); }
        },
        /** 통째로 쓴다(원자적). 객체를 주면 JSON 으로. */
        put: async function (rel, body) {
            var text = (typeof body === 'string') ? body : JSON.stringify(body, null, 2);
            return await writeRel(rel, text, false);
        },
        /** 이진을 쓴다 — base64 문자열(접두어 없이)을 준다. 사진·문서 첨부가 이 길이다.
         *  ⚠️ 텍스트로 보내면 바이트가 바뀐다(js/58 이사에서 실측) — 이진은 **반드시 b64**. */
        putBytes: async function (rel, b64) {
            return await writeRel(rel, String(b64 || ''), true);
        },
        /** 바이트를 Blob 으로 읽는다. 없으면 null.
         *  ⚠️ DSM 은 **없는 파일에도 502 + "페이지를 찾을 수 없습니다" HTML** 을 준다 —
         *     백엔드가 404 로 바꿔 주지만, 그래도 받은 것이 HTML 이면 파일로 저장하면 안 된다
         *     (그 HTML 을 바이트로 돌려줘서 "파일 내용"으로 저장한 전력이 있다). */
        getBlob: async function (rel) {
            var res = await nas('GET', '/nas/app/get' + qs(rel));
            if (res.status === 404) return null;
            if (!res.ok) {
                var e = new Error('NAS 읽기 실패(HTTP ' + res.status + '): ' + normRel(rel));
                e.status = res.status;
                throw e;
            }
            return await res.blob();
        },
        /** NAS 원본을 **그 자리에서** 연결 프로그램으로 연다(사진 뷰어·PDF·엑셀).
         *  ⚠️ 브라우저로 여는 `blob:` URL 은 **파일 이름을 못 싣는다** — 받아 보면
         *     확장자 없는 GUID 가 된다(2026-11-05 실사용 신고). 그래서 보기는 이 길이 기본이다.
         *  ⚠️ Windows + SMB 전용이고, 공유가 안 보이면 404 로 **정직하게 실패한다** —
         *     부르는 쪽이 브라우저로 되돌리라고. 여기서 삼키면 "눌렀는데 아무 일도 안 난다"가 된다. */
        openNative: async function (rel) {
            return await nasJson('POST', '/nas/app/open-native', { rel: normRel(rel) });
        },
        /** 지운다. ⚠️ 되돌릴 수 없다 — 사람 확인은 **부르는 쪽**이 받는다. */
        del: async function (rel) {
            return await nasJson('POST', '/nas/app/delete', { rel: normRel(rel) });
        },
        /** 폴더 목록. 없거나 권한 없으면 빈 배열(목록은 "없음"과 "못 봄"을 같게 취급해도 안전하다). */
        list: async function (rel) {
            try { return await listRel(rel); }
            catch (e) { return []; }
        },
        /** 있는지만. */
        exists: async function (rel) {
            var items = await this.list(normRel(rel).split('/').slice(0, -1).join('/'));
            var name = normRel(rel).split('/').pop();
            return items.some(function (it) { return it && it.name === name; });
        }
    };

    // ── 📇 appProperties — Drive 가 파일에 붙여 주던 작은 꼬리표 ─────────────────
    // NAS 엔 그런 게 없다. 그런데 앱은 그걸로 **담당자·팀·완료·테마색**을 가른다.
    // 없으면 목록이 통째로 "미지정" 으로 묶인다(2026-11-04 신고: "담당자 분류가 풀렸음").
    //
    // ⚠️ 새 저장소를 만들지 않는다 — 같은 값이 이미 `App_Config/project_index.json` 에 있고
    //    그건 **저장할 때마다** 갱신된다. 꼬리표용 파일을 따로 두면 저장마다 왕복이 하나 늘고,
    //    두 사람이 동시에 저장할 때 서로 덮어쓰는 자리가 하나 더 생긴다.
    // ⚠️⚠️ 붙이는 곳은 **어댑터 한 곳**이다. 목록 모달(js/04c)·배분 원장(js/14d)·
    //    복원 목록 색(js/21)이 전부 `file.appProperties` 를 읽는다 — 화면마다 고치면
    //    고친 화면만 살고 나머지는 조용히 "미지정" 으로 남는다.
    var IDX_REL = 'App_Config/project_index.json';
    var _idxCache = null, _idxAt = 0;
    var IDX_TTL = 5000;                 // 목록 한 번에 폴더를 여러 개 훑는다 — 그 사이엔 한 번만 읽는다

    async function loadIndexProps() {
        if (_idxCache && (Date.now() - _idxAt) < IDX_TTL) return _idxCache;
        var map = {};
        try {
            var res = await nas('GET', '/nas/app/get' + qs(IDX_REL));
            if (res.ok) {
                var idx = JSON.parse(await res.text());
                (idx.projects || []).forEach(function (p) {
                    if (!p || !p.drive_file_id) return;
                    var props = {
                        pm: p.assignee || '',
                        team: p.team || '',
                        completed: p.completed ? '1' : '',   // Drive 는 문자열만 담았다 — 읽는 쪽이 '1' 을 본다
                        themeColor: p.themeColor || ''
                    };
                    map[p.drive_file_id] = props;
                    // 🗄 [2026-11-05] **이름으로도** 찾게 해 둔다 — 백업 파일(`Backups/…`)은
                    //    Drive id 가 없어 id 로는 영영 못 맞춘다. 그래서 복원 목록이 팀·담당자·
                    //    테마색을 통째로 잃고 "미지정" 한 덩어리로 보였다(실측 502건 전부).
                    if (p.file_name) map['name:' + p.file_name] = props;
                });
            }
        } catch (e) {
            // 꼬리표가 없어도 목록 자체는 보여야 한다 — 여기서 던지면 프로젝트를 못 연다.
            note('appprops-skip', String((e && e.message) || e));
        }
        _idxCache = map; _idxAt = Date.now();
        return map;
    }

    async function attachAppProps(files) {
        if (!files.length) return files;
        var map = await loadIndexProps();
        for (var i = 0; i < files.length; i++) {
            var p = map[files[i].id];
            if (!p) {
                // 🏷 [2026-11-05] id 로 못 찾으면 **이름으로** 되짚는다.
                //    왜 id 가 빗나가나 — 이사 때 생긴 **별칭** 때문에 한 경로에 Drive id 가
                //    둘 이상 걸릴 수 있고, 역방향(경로→id) 에선 그중 하나만 이긴다.
                //    하필 색인에 없는 별칭이 이기면 그 프로젝트가 통째로 "미지정" 이 된다
                //    (실측: OBSIDIAN 이 정확히 그랬다). 이름은 색인이 들고 있으니 그걸 쓴다.
                p = map['name:' + files[i].name];
            }
            if (!p) {
                // 백업이면 **원본 프로젝트**의 꼬리표를 물려준다 — 같은 프로젝트의 과거 모습이니
                // 같은 색·같은 담당자로 묶이는 게 맞다(복원 목록이 그걸로 그룹을 만든다).
                var orig = backupOrigNameOf(files[i].name);
                if (orig) p = map['name:' + orig];
            }
            if (p) files[i].appProperties = p;
        }
        return files;
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
        await attachAppProps(files);    // 📇 담당자·팀·완료·테마색
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
                // ⚠️⚠️ **지도를 같이 옮겨야 한다**(2026-11-04 실사고).
                //    Drive 는 이름이 바뀌어도 fileId 가 **그대로**라 아무것도 안 깨진다.
                //    우리 지도는 id→**경로**라, 이름이 바뀌면 그 id 가 허공을 가리킨다.
                //    앱은 저장할 때 파일명을 다시 조립하므로(고객_모델_인치) 이름은 **실제로 바뀐다** —
                //    실측에서 저장 한 번에 `KGI_dimension EC_75.0.json` → `KGI_75.0.json` 이 됐고,
                //    그 순간 project_index 가 들고 있던 id 가 안 풀렸다.
                await remapIdPath(cur.rel, newRel);
                return await driveGetMeta(newRel, false);
            }
        }
        return await driveGetMeta(cur.rel, false);
    }

    /** 파일이 옮겨지면 지도도 같이 옮긴다 — 메모리와 NAS 파일 둘 다.
     *  ⚠️ 실패해도 **저장을 깨뜨리지 않는다**(저장은 이미 끝났다). 대신 시끄럽게 남긴다. */
    async function remapIdPath(oldRel, newRel) {
        var moved = [];
        Object.keys(_idMap).forEach(function (id) {
            if (_idMap[id] === oldRel) { _idMap[id] = newRel; moved.push(id); }
        });
        if (!moved.length) return 0;
        delete _relToOldId[oldRel];
        _relToOldId[newRel] = moved[0];
        try {
            var res = await nas('GET', '/nas/app/get' + qs(ID_MAP_REL_ADAPTER));
            var doc = res.ok ? JSON.parse(await res.text()) : { version: 1, map: {} };
            moved.forEach(function (id) { doc.map[id] = newRel; });
            doc.movedAt = new Date().toISOString();
            await nasJson('POST', '/nas/app/put', { rel: ID_MAP_REL_ADAPTER, text: JSON.stringify(doc) });
            note('idmap-remap', { from: oldRel, to: newRel, ids: moved.length });
        } catch (e) {
            note('idmap-remap-fail', String((e && e.message) || e));
            console.warn('[storage-adapter] 파일은 옮겼는데 **id 지도를 못 고쳤습니다** — '
                + '그 프로젝트를 id 로 여는 경로가 막힙니다. 🔑 설정 ▸ 📦 이사 를 한 번 누르면 지도가 다시 만들어집니다.',
                oldRel, '→', newRel, e);
        }
        return moved.length;
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
                    // ⚠️⚠️ **`result` 를 같이 줘야 한다**(2026-11-04 실사고).
                    //    진짜 gapi 는 JSON 본문이면 파싱한 객체를 `result` 에 담아 준다.
                    //    앱은 `response.result` 를 읽고 `if (saveData && saveData.globalData)` 로
                    //    넘어가므로, `body` 만 주면 **오류 하나 없이 조용히 아무것도 안 열린다.**
                    //    (🗄️ 배지는 떠 있고 목록도 12건 보이는데 프로젝트만 안 열렸다)
                    //    ⚠️ 하네스가 이걸 놓친 이유: `fetch(...alt=media)` 로만 확인하고
                    //       **`gapi.client.drive.files.get` 쪽은 안 봤다** — 앱이 쓰는 건 이쪽이다.
                    var res = await readRel(g.rel);
                    var txt = await res.text();
                    var parsed;
                    try { parsed = JSON.parse(txt); } catch (e) { parsed = undefined; }
                    return { body: txt, result: parsed, status: 200 };
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
            // ⚠️⚠️ **여기서 한 번 크게 틀렸다**(2026-11-04): "없으면 넣는다"로만 둬서,
            //    gapi 가 나중에 로드되며 **진짜 `getToken`(=null 을 돌려주는)** 을 깔면
            //    앱 전체가 "구글 로그인 안 함"으로 판정했다. 🗄️ 배지는 떠 있는데
            //    **프로젝트를 못 불러왔다** — 저장소만 바꾸고 "로그인했나" 검사는
            //    Drive 기준 그대로 뒀던 것이다(`gapi.client.getToken()` 검사가 40곳 넘는다).
            //    NAS 모드에서 신원은 **NAS 계정**이다. 그러니 **항상** 덮어쓴다.
            // ⚠️⚠️ 표시는 **함수 자체**에 단다. 예전엔 `gapi.client.__nasToken` 에 달았는데,
            //    gapi 가 그 뒤에 `getToken` 만 덮어써도 표시는 그대로 남아 **다시 안 넣었다** —
            //    그래서 몇 초 뒤엔 다시 null 이 돼 "로그인 안 함"으로 돌아갔다(실측).
            //    가드는 "했는지"가 아니라 **"지금 내 것인지"** 를 봐야 한다.
            if (!window.gapi.client.getToken || !window.gapi.client.getToken.__nas) {
                var _tok = function () { return { access_token: 'nas' }; };
                _tok.__nas = true;
                window.gapi.client.getToken = _tok;
                window.gapi.client.setToken = function () { };
            }
            // 앱의 "연결됨" 상태도 같이 맞춘다 — 이걸 보는 가드가 따로 또 있다(`selectProject` 등).
            // ⚠️ 거짓으로 켜는 게 아니라 **NAS 에 실제로 붙어 있을 때만** 켠다(아래 _nasIdentity).
            if (_nasOnline) {
                window.isDriveConnected = true;
                window._driveWasEverConnected = true;
            }
        } catch (e) { console.error('[storage-adapter] gapi 심기 실패', e); }
    }

    // 🪪 NAS 계정이 곧 신원이다. 붙어 있는지 **실제로 물어보고**, 사용자 이름도 그쪽에서 가져온다.
    //    ⚠️ 무조건 "연결됨"으로 켜면 백엔드가 꺼져 있을 때도 앱이 멀쩡한 척하게 된다 —
    //       그러면 저장이 조용히 실패한다. 붙어 있을 때만 켠다.
    var _nasOnline = false;

    /** 저장된 계정으로 **딱 한 번** 로그인한다.
     *
     *  🔌 [2026-11-04] 왜 필요한가 — `/nas/status` 는 **로그인을 시도하지 않는다**(그게 맞다).
     *     그래서 백엔드를 재시작하면 세션이 없고, 그때까지 로그인을 거는 곳은 🔑 설정 화면
     *     뿐이었다. 저장소가 NAS 하나뿐인 지금은 **재시작할 때마다 사람이 설정을 열어
     *     버튼을 눌러야** 앱이 살아나는 셈이다 — 그건 고장이다.
     *  ⚠️⚠️ 재시도는 하지 않는다. 한 페이지에 **한 번**이고, 실패가 쌓이면 그 PC 의 IP 가
     *     차단된다. 횟수 관리는 백엔드 예산(_LOGIN_POLICY, 기본 3회)이 한다 — 거기서
     *     잠기면 `reason:'blocked'` 로 오므로 여기서는 **시도조차 하지 않는다.**
     */
    var _loginTried = false;
    async function nasLoginOnce(s) {
        if (_loginTried) return s;
        if (!s || !s.configured) return s;          // 계정이 없으면 할 일이 없다
        if (s.ok) return s;                         // 이미 붙어 있다
        if (s.reason === 'blocked') return s;       // 잠겨 있다 — 더 두드리지 않는다
        if (s.budget && s.budget.left === 0) return s;
        _loginTried = true;
        try {
            var lg = await (await nas('POST', '/nas/login', {})).json();
            if (!lg || !lg.ok) {
                note('nas-login-failed', (lg && lg.message) || '');
                return Object.assign({}, s, { message: (lg && lg.message) || s.message,
                                              budget: (lg && lg.budget) || s.budget });
            }
            return await (await nas('GET', '/nas/status')).json();
        } catch (e) {
            note('nas-login-error', String((e && e.message) || e));
            return s;
        }
    }

    (async function _nasIdentity() {
        try {
            var s = await (await nas('GET', '/nas/status')).json();
            // 백엔드가 막 떴으면 세션이 없다 — 저장된 계정으로 한 번만 붙어 본다.
            if (s && s.configured && !s.ok && s.reason === 'no_session') s = await nasLoginOnce(s);
            if (s && s.ok) {
                _nasOnline = true;
                // 🪪 [2026-11-05] 계정 id 를 **그 자체로** 드러낸다.
                //    `currentUserName` 은 **표시용**이라 아래 조건에 걸리지 않으면 덮지 않고,
                //    사람이 js/09 로 넣은 한글 실명·'로컬 사용자 (PC)' 가 그대로 남는다.
                //    그걸 파일 이름의 근거로 쓴 곳이 있었다(일일보고) → 한글이 깎여 **전원이
                //    한 파일(`__unknown.json`)** 에 몰렸다. 파일 이름은 이 값을 쓸 것.
                if (s.user) window._nasAccount = String(s.user);
                if (s.user && (!window.currentUserName || /비로그인|익명|알 수 없는/.test(window.currentUserName))) {
                    window.currentUserName = s.user;
                }
                note('nas-identity', s.user || '(이름 없음)');
            } else {
                note('nas-offline', (s && s.message) || '');
                console.warn('[storage-adapter] NAS 에 붙어 있지 않습니다 — 🔑 설정에서 로그인해주세요.',
                             (s && s.message) || '');
                // ⚠️ 전엔 콘솔에만 적었다 — 사람 눈엔 **[📂 프로젝트 열기] 가 회색인 것**만 보이고
                //    왜 그런지는 알 길이 없었다. 사유별로 다르게 말한다(고치는 방법이 다르다).
                nasOfflineBanner(s || {});
            }
        } catch (e) {
            note('nas-offline', String((e && e.message) || e));
            console.warn('[storage-adapter] 백엔드에 못 붙었습니다 — kortek_backend.bat 이 떠 있는지 확인하세요.');
            nasOfflineBanner({ reason: 'backend' });
        }
        implant();          // 상태를 알아낸 뒤 한 번 더 — 그 사이 가드가 돌았을 수 있다
        if (window._updateDriveConnBadge) { try { window._updateDriveConnBadge(); } catch (e) { /* ignore */ } }
        if (_nasOnline) nasMarkConnected();
    })();

    // 📂 [2026-11-06, 사용자 요청] "앱 초기 실행 + 로그인 정보 미저장"일 때만 모달을 자동으로
    //    띄운다 — 페이지 생애 동안 한 번만(세션 만료 등으로 매번 뜨면 성가시다).
    var _autoOpenedNasModal = false;

    /** NAS 모드인데 못 붙은 상태 — **사유마다 할 일이 다르다.** */
    function nasOfflineBanner(s) {
        var en = window._currentLang === 'en';
        var reason = s.reason || '';
        var msg, btn;
        // 📱 휴대폰·태블릿에는 이 PC 백엔드(127.0.0.1:5000)가 **존재할 수 없다.**
        //    그런데 "백엔드가 꺼져 있습니다 / 설치 안내"라고 하면 사람을 할 수 없는 일로 보낸다.
        var isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        if (isPhone && (reason === 'backend' || reason === 'module')) {
            storageBanner('storage-nas-offline-banner', '#fdecea', '#e05c4a', '#a3281c',
                en ? 'On a phone or tablet the app cannot reach the in-house NAS — it needs the backend running on your PC.'
                   : '📱 휴대폰·태블릿에서는 사내 NAS 에 붙을 수 없습니다 — PC 에서 도는 백엔드가 있어야 합니다. '
                     + 'PC 에서 열어주세요.', []);
            return;
        }
        if (reason === 'backend' || reason === 'module') {
            msg = en ? 'The local backend is not running, so the app cannot read the NAS.'
                     : '🗄️ 사내 NAS 에 연결하지 못했습니다 — <b>백엔드(kortek_backend)가 꺼져 있습니다.</b> '
                       + '작업 표시줄에 검은 창이 있는지 확인하거나, 설치 안내를 보세요.';
            btn = { label: '📥 ' + (en ? 'Setup guide' : '설치 안내'), primary: true,
                    onClick: function () { window.storageOpenBackendGuide(); } };
        } else if (reason === 'blocked') {
            msg = en ? 'NAS login is locked after failed attempts — fix the password and save again.'
                     : '⛔ NAS 로그인이 <b>잠겨 있습니다</b> — 🔑 설정에서 비밀번호를 고쳐 다시 저장하면 풀립니다.';
            btn = { label: '🔑 ' + (en ? 'Settings' : '설정 열기'), primary: true,
                    onClick: function () { window.storageOpenQuickSwitch(); } };
        } else {
            msg = en ? 'Not signed in to the NAS yet.'
                     : '🗄️ 아직 사내 NAS 에 로그인하지 않았습니다 — 아이디·비밀번호만 넣으면 됩니다.';
            btn = { label: '🚀 ' + (en ? 'Sign in' : '로그인'), primary: true,
                    onClick: function () { window.storageOpenQuickSwitch(); } };
        }
        storageBanner('storage-nas-offline-banner', '#fdecea', '#e05c4a', '#a3281c', msg, [btn]);
        // 📂 로그인 정보가 아예 저장된 적 없으면(최초 실행 등) 배너만 띄우고 기다리지 않는다 —
        //    모달을 바로 연다. 세션만 만료된 경우(reason:'expired' 등)는 배너만 띄운다(이미
        //    설정돼 있는데 매번 모달이 뜨면 성가시다).
        if (reason === 'not_configured' && !_autoOpenedNasModal) {
            _autoOpenedNasModal = true;
            if (window.storageOpenQuickSwitch) window.storageOpenQuickSwitch();
        }
    }
    window._storageNasOfflineBanner = nasOfflineBanner;   // 하네스용(백엔드를 끌 수 없으므로)

    // 🔌 **"붙었다"를 앱에 알린다.** 이게 빠져서 🗄️ 배지는 떠 있는데
    //    [📂 프로젝트 열기] 가 HTML 의 `disabled` 그대로 회색이었다(실사용 신고 2026-11-04).
    //    버튼 활성화와 팀 공용 데이터 당겨오기는 **구글 OAuth 성공 콜백 안에만** 있었다 —
    //    토큰 가드를 고친 것과는 별개의 문턱이었고, 내가 `fetch` 로만 검증해서 못 봤다.
    //    ⚠️ 목록을 여기 베끼지 않는다 — js/05 의 `_storageEnableDataButtons`/`_storageLoadSharedData`
    //       **그 함수를 부른다**. 베끼면 Drive 쪽에 하나 늘 때 NAS 모드만 조용히 빠진다.
    function nasMarkConnected() {
        try {
            if (window._storageEnableDataButtons) window._storageEnableDataButtons();
            // 연동 버튼은 NAS 모드에서 할 일이 없다 — 누르면 안내만 나온다(blockGoogleAuth).
            // 그래도 "🔵 드라이브 연동하기" 로 남겨두면 **아직 로그인 안 한 것처럼** 보인다.
            var ab = document.getElementById('auth_button');
            if (ab) {
                ab.innerText = '🗄️ ' + (window.currentUserName || 'NAS');
                ab.style.borderColor = '';
                ab.style.color = '';
            }
            if (window._storageLoadSharedData) window._storageLoadSharedData();
            // 📂 [2026-11-04] 프로젝트 불러오기 창을 **이 페이지에서 한 번만** 띄운다.
            //    ⚠️ 한 번만인 이유: 이 함수는 연결이 확인될 때 불리는데, NAS 모드에서 그건
            //       **페이지를 열 때마다**다. 가드가 없으면 다른 일로 앱을 열어도 매번 뜬다.
            //    ⚠️ 이미 프로젝트를 연 상태면 띄우지 않는다(저장 후 돌아온 경우 등).
            //    끄려면 js/04a 의 `STORAGE_POLICY.autoOpenProjectList` 를 false 로.
            if ((window.STORAGE_POLICY || {}).autoOpenProjectList
                && !window._projectListAutoOpened
                && !window.currentDriveFileId
                && typeof window.loadFromGoogleDrive === 'function') {
                window._projectListAutoOpened = true;
                setTimeout(function () {
                    try { window.loadFromGoogleDrive(); } catch (e) { console.warn('[storage] 목록 자동 열기 실패', e); }
                }, 300);
            }
            note('nas-connected-ui', '');
        } catch (e) { console.error('[storage-adapter] 연결 후처리 실패', e); }
    }
    // ⚠️⚠️ **구글 OAuth 창을 띄우지 않는다**(2026-11-04 신고: "구글 OAuth 팝업창 뜨고…").
    //    NAS 모드에선 구글 계정이 아예 필요 없는데, 자동 로그인(`gantt_auto_drive_login`)과
    //    배지/버튼이 `handleAuthClick` 을 불러 팝업이 떴다. 사람 입장에선 "NAS 로 바꿨는데
    //    왜 구글 로그인을 시키나" 가 된다. 토큰 갱신 루프도 같이 멈춘다.
    //    ⚠️ 조용히 없애지 않고 **왜 안 뜨는지 말해 준다** — 안 그러면 "버튼이 고장났다"가 된다.
    (function blockGoogleAuth() {
        var en = function () { return window._currentLang === 'en'; };
        window.handleAuthClick = function () {
            if (window.showToast) {
                window.showToast(en() ? 'NAS mode — Google sign-in is not needed.'
                                      : '🗄️ NAS 모드입니다 — 구글 로그인이 필요 없습니다.');
            }
            console.info('[storage-adapter] NAS 모드라 구글 로그인을 띄우지 않습니다.');
        };
        window.startSilentTokenRefresh = function () { };      // 토큰 갱신 루프도 멈춘다
        window._handleDriveDisconnected = function () { };     // "드라이브 끊김" 경보도 안 띄운다
    })();

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

    // ⚠️⚠️ **어댑터보다 먼저 로드된 파일이 `window.fetch` 를 잡아 두면 우회가 생긴다.**
    //    js/30(이슈 수집)이 로드 시점에 원본 fetch 를 잡아 두고 그걸로 Drive 를 부른다 —
    //    NAS 모드에서 그대로 구글로 나가 **401 이 반복**됐다(실측 콘솔).
    //    다행히 js/30 에 모킹용 이음새(`_issueRawFetch`)가 있어 거기 꽂는다.
    //    ⚠️ 통째로 우리 fetch 를 꽂으면 **무한 재귀**다 — 우리 `_origFetch` 가 바로 js/30 의
    //       래퍼이기 때문이다. 그래서 **Drive 주소만** 어댑터로 보내고 나머지는 원래대로 둔다.
    //    (저장소 전체를 훑어 이렇게 fetch 를 미리 잡는 곳은 js/30 하나뿐인 것을 확인했다)
    if (typeof window._issueRawFetch === 'function') {
        var _issueOrig = window._issueRawFetch;
        window._issueRawFetch = function (input, init) {
            var u = (typeof input === 'string') ? input : (input && input.url) || '';
            if (DRIVE_RE.test(u)) return window.fetch(input, init);
            return _issueOrig(input, init);
        };
    }

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
