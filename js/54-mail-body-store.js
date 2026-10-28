// 📧 [2026-10-28 신규] 메일 원문 본문 보관 — 프로젝트 파일 밖으로 (NAS 우선, 외부에선 Drive)
//
// 왜: 프로젝트 JSON(Drive)에 메일 원문 본문(row._mailRaw.body2000, 최대 15,000자)이 통째로 들어 있어
//     큰 프로젝트가 9.9MB 중 6MB가 본문이었다(실측 LNW_STELLAR32). 열기·저장마다 그만큼 오가고, 메일이
//     쌓일수록 계속 커진다. 사용자 결정(2026-10-28): 전문은 밖에 두고 **NAS 우선, 외부 접속이면 Drive**.
//
// 어디에 무엇이:
//   - 프로젝트 파일 : 앞부분 MB_PREVIEW_CHARS(2,000자)만 남긴다. AI 문답 "원문 보기"는 원래 2,000자까지만
//                     넣고(js/04h _aiAssistGetMailRaw), 지연·임박 요약은 500자라 **AI가 보는 내용은 그대로**다.
//                     메일 분석(업무 등록)·오분류 학습은 이 값이 아니라 수신 시점의 전문을 쓴다.
//   - NAS          : 2026-10-22부터 받은 메일은 .eml 원본이 이미 있다(js/48 _dsMailParse) — 전문+첨부.
//   - Drive        : SHARED_FOLDER_ID/MailBodies/<key>.txt — 메일 1건당 파일 1개, **한 번 쓰고 안 고친다**
//                     (프로젝트별 큰 파일 하나면 메일이 올 때마다 그걸 통째로 다시 올려야 해 같은 문제가 난다).
//                     text/plain 이라 프로젝트 목록(application/json 조회)에 절대 안 섞인다.
//   - row._mailRaw.bodyRef = { id, key, len } — Drive 파일 id(읽을 때 검색 없이 바로), 전문 길이.
//
// 읽는 순서(_mbFullBody): NAS .eml → Drive 사본 → 프로젝트 파일의 2,000자.
//
// 옮기는 시점(_mbOffloadSweep): 프로젝트를 열고 잠시 뒤 + 주기적으로, 아직 안 옮긴 긴 본문을 Drive에
//   올리고 **업로드가 확인된 행만** 줄인다. 실패하면 그 행은 그대로(본문 유실 없음). 옛 메일 이전도 같은 길.
//   즉시 끄기: localStorage.gantt_mailbody_offload_off = '1'
(function () {
    'use strict';

    var MB_PREVIEW_CHARS = 2000;
    var MB_FOLDER_NAME = 'MailBodies';
    var MB_CONCURRENCY = 2;
    var MB_OFF_KEY = 'gantt_mailbody_offload_off';

    window.MB_PREVIEW_CHARS = MB_PREVIEW_CHARS;
    window.MB_FOLDER_NAME = MB_FOLDER_NAME;

    function _token() {
        try {
            var t = (typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken) ? gapi.client.getToken() : null;
            return (t ? t.access_token : null) || window.googleAccessToken || null;
        } catch (e) { return window.googleAccessToken || null; }
    }

    // 같은 메일이면 누가 언제 올려도 같은 이름 — 중복 업로드를 이름 검색 한 번으로 막는다.
    function _hash(str) {
        var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (var i = 0; i < str.length; i++) {
            var ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    }
    window._mbKey = function (mr, body) {
        return 'mb_' + _hash([mr.fileName || '', mr.date || '', mr.sender || '', mr.subject || '', String(body || '')].join('\u0001'));
    };

    // 이 메일 원문이 프로젝트 파일 밖으로 옮겨져 잘린 상태인가
    window._mbIsTrimmed = function (mr) {
        return !!(mr && mr.bodyRef && mr.bodyRef.id && mr.bodyRef.len > String(mr.body2000 || '').length);
    };

    async function _driveFetchJson(url, opts) {
        var res = await fetch(url, opts);
        if (!res.ok) {
            var err = new Error('Drive HTTP ' + res.status);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    // ── 읽기 ────────────────────────────────────────────────────────────────
    var _driveBodyCache = new Map(); // id → body (세션 메모리만 — 같은 메일을 다시 열면 재요청 안 함)
    window._mbReadDriveBody = async function (bodyRef) {
        if (!bodyRef || !bodyRef.id) return null;
        if (_driveBodyCache.has(bodyRef.id)) return _driveBodyCache.get(bodyRef.id);
        var token = _token();
        if (!token) throw new Error('Drive 미연동');
        var res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(bodyRef.id) + '?alt=media&supportsAllDrives=true', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Drive HTTP ' + res.status);
        var txt = await res.text();
        var body = null;
        try { body = JSON.parse(txt).body; } catch (e) { body = null; }
        if (typeof body !== 'string') throw new Error('Drive 원문 파일 형식 오류');
        _driveBodyCache.set(bodyRef.id, body);
        return body;
    };

    /**
     * 메일 원문 전문 — NAS(.eml) → Drive 사본 → 프로젝트 파일의 앞부분 순서로.
     * 반환: { body, source:'nas'|'drive'|'preview', nas:(NAS 응답 — 첨부 목록 등) }
     */
    window._mbFullBody = async function (mr) {
        if (!mr) return { body: '', source: 'preview' };
        if (mr.fileName && window._dsMailParse) {
            try {
                var j = await window._dsMailParse(mr.fileName);
                if (j && j.ok && j.body) return { body: j.body + (j.truncated ? '\n\n… (너무 길어 잘랐습니다)' : ''), source: 'nas', nas: j };
            } catch (e) { /* 외부 접속·백엔드 꺼짐·원본 없음 → Drive로 */ }
        }
        if (window._mbIsTrimmed(mr)) {
            try {
                var b = await window._mbReadDriveBody(mr.bodyRef);
                if (b != null) return { body: b, source: 'drive' };
            } catch (e) {
                console.warn('[메일 원문] Drive 사본 읽기 실패 — 앞부분만 표시:', e.message || e);
                if (window._issueLog) { try { window._issueLog({ domain: 'drive', kind: 'mailbody_read_fail', rid: '', route: 'mailbody', result: { ok: false, http: 0, durMs: 0, errorRaw: String(e.message || e) } }); } catch (e2) { /* 수집 실패 무시 */ } }
            }
        }
        return { body: String(mr.body2000 || ''), source: 'preview' };
    };

    // ── 쓰기(옮기기) ──────────────────────────────────────────────────────────
    async function _folderId(token) {
        if (!window._getOrCreateNamedFolder) throw new Error('_getOrCreateNamedFolder 없음');
        var id = await window._getOrCreateNamedFolder(token, MB_FOLDER_NAME);
        if (!id) throw new Error('MailBodies 폴더를 만들지 못함');
        return id;
    }

    // 같은 key 파일이 이미 있으면 그 id, 없으면 새로 올려서 id. 실패는 던진다(호출부가 그 행을 그대로 둠).
    async function _putBody(token, folderId, key, mr, body) {
        var name = key + '.txt';
        var q = "name='" + name + "' and '" + folderId + "' in parents and trashed=false";
        var found = await _driveFetchJson('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q)
            + '&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,size)', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (found.files && found.files.length) return found.files[0].id;

        var boundary = 'mb_' + Date.now().toString(36);
        var meta = { name: name, mimeType: 'text/plain', parents: [folderId], appProperties: { kind: 'mailbody', v: '1' } };
        var content = JSON.stringify({ v: 1, key: key, fileName: mr.fileName || '', subject: mr.subject || '', sender: mr.sender || '', date: mr.date || '', body: body });
        var payload = '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta)
            + '\r\n--' + boundary + '\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n' + content
            + '\r\n--' + boundary + '--';
        var created = await _driveFetchJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,size', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: payload
        });
        if (!created || !created.id) throw new Error('업로드 응답에 id 없음');
        return created.id;
    }

    function _trimmedMailRaw(mr, ref) {
        return Object.assign({}, mr, { body2000: String(mr.body2000 || '').slice(0, MB_PREVIEW_CHARS), bodyRef: ref });
    }

    function _needsOffload(mr) {
        return !!(mr && typeof mr === 'object' && !mr.bodyRef && String(mr.body2000 || '').length > MB_PREVIEW_CHARS);
    }

    // 배분 원장(projectDistributions[].mailRaw)에도 같은 원문 사본이 있다 — 같은 메일(key)이 이미
    // 옮겨졌으면 거기도 같은 bodyRef로 줄인다(따로 올리지 않는다).
    function _trimDistributions(refByKey) {
        var dists = window.projectDistributions;
        if (!Array.isArray(dists)) return 0;
        var n = 0;
        for (var i = 0; i < dists.length; i++) {
            var d = dists[i];
            if (!d || !_needsOffload(d.mailRaw)) continue;
            var ref = refByKey.get(window._mbKey(d.mailRaw, d.mailRaw.body2000));
            if (!ref) continue;
            dists[i] = Object.assign({}, d, { mailRaw: _trimmedMailRaw(d.mailRaw, ref) });
            n++;
        }
        return n;
    }

    var _sweepRunning = false;
    /**
     * 지금 열린 프로젝트에서 아직 안 옮긴 긴 본문을 Drive로 옮기고 그 행을 줄인다.
     * 시트를 바꾸면 그 자리에서 멈춘다(다른 프로젝트의 행을 건드리지 않게). 실패한 행은 그대로.
     */
    window._mbOffloadSweep = async function (opts) {
        opts = opts || {};
        if (_sweepRunning) return { skipped: 'running' };
        try { if (localStorage.getItem(MB_OFF_KEY) === '1') return { skipped: 'off' }; } catch (e) { /* 무시 */ }
        var token = _token();
        if (!token) return { skipped: 'no-token' };
        if (!window.currentDriveFileId || typeof globalData === 'undefined' || !globalData || globalData.length < 2) return { skipped: 'no-project' };

        var sheetKey = window._activeSheetKey;
        var fileId = window.currentDriveFileId;
        var rows = [];
        for (var i = 1; i < globalData.length; i++) {
            var r = globalData[i];
            if (r && _needsOffload(r._mailRaw)) rows.push(r);
        }
        var distPending = (window.projectDistributions || []).some(function (d) { return d && _needsOffload(d.mailRaw); });
        if (!rows.length && !distPending) return { done: 0, failed: 0 };

        _sweepRunning = true;
        var t0 = performance.now();
        var done = 0, failed = 0, aborted = false;
        var refByKey = new Map();
        try {
            var folderId = await _folderId(token);
            var next = 0;
            var stillHere = function () { return window._activeSheetKey === sheetKey && window.currentDriveFileId === fileId; };
            var worker = async function () {
                while (next < rows.length) {
                    if (!stillHere()) { aborted = true; return; }
                    var row = rows[next++];
                    var mr = row._mailRaw;
                    if (!_needsOffload(mr)) continue;
                    var body = String(mr.body2000);
                    var key = window._mbKey(mr, body);
                    try {
                        var id = await _putBody(_token() || token, folderId, key, mr, body);
                        var ref = { id: id, key: key, len: body.length };
                        refByKey.set(key, ref);
                        _driveBodyCache.set(id, body);
                        // 올리는 사이 이 행의 원문이 바뀌었거나 시트가 바뀌었으면 손대지 않는다.
                        if (!stillHere() || row._mailRaw !== mr) continue;
                        row._mailRaw = _trimmedMailRaw(mr, ref); // 새 객체로 — Undo 스냅샷이 공유하는 옛 객체는 그대로
                        done++;
                    } catch (e) {
                        failed++;
                        if (failed <= 3) console.warn('[메일 원문 옮기기] 실패 — 이 메일은 프로젝트 파일에 그대로 둡니다:', mr.fileName || mr.subject, e.message || e);
                        if (e && (e.status === 401 || e.status === 403)) { aborted = true; return; } // 권한 문제면 더 해도 같은 결과
                    }
                }
            };
            var workers = [];
            for (var w = 0; w < MB_CONCURRENCY; w++) workers.push(worker());
            await Promise.all(workers);

            var distTrimmed = stillHere() ? _trimDistributions(refByKey) : 0;
            if ((done || distTrimmed) && stillHere()) {
                window._nonGanttDirty = true; // 다음 자동저장에 줄어든 프로젝트 파일이 실린다
            }
            var ms = Math.round(performance.now() - t0);
            console.info('[메일 원문 옮기기] 완료 ' + done + '건 · 배분원장 ' + distTrimmed + '건 · 실패 ' + failed + '건 · 남음 ' + (rows.length - done - failed) + '건 · ' + ms + 'ms' + (aborted ? ' (중단: 시트 전환/권한)' : ''));
            if (failed && window._issueLog) {
                try { window._issueLog({ domain: 'drive', kind: 'mailbody_offload_fail', rid: '', route: 'mailbody', result: { ok: false, http: 0, durMs: ms, errorRaw: failed + '/' + rows.length + ' 실패' } }); } catch (e) { /* 수집 실패 무시 */ }
            }
            if (opts.toast && window.showToast && (done || failed)) {
                window.showToast(window._t('📧 메일 원문 ' + done + '건을 Drive로 옮겼습니다' + (failed ? ' (실패 ' + failed + '건은 그대로 둠)' : ''),
                    '📧 Moved ' + done + ' mail bodies to Drive' + (failed ? ' (' + failed + ' failed, left as is)' : '')), failed ? 'warning' : 'info', 5000);
            }
            return { done: done, failed: failed, distTrimmed: distTrimmed, aborted: aborted, total: rows.length };
        } catch (e) {
            console.warn('[메일 원문 옮기기] 중단:', e.message || e);
            return { error: String(e.message || e), done: done, failed: failed };
        } finally {
            _sweepRunning = false;
        }
    };

    // ── 언제 돌리나 ─────────────────────────────────────────────────────────
    //   프로젝트를 열고(=executeLoadFile) 20초 뒤 — 열기 직후 몰리는 렌더·토픽 프로파일·메일 수집을 피한다.
    //   그 뒤엔 10분마다(새로 등록된 메일 업무). 둘 다 할 일이 없으면 요청 0건이다.
    var _openTimer = null;
    function _scheduleAfterOpen() {
        clearTimeout(_openTimer);
        _openTimer = setTimeout(function () { window._mbOffloadSweep(); }, 20000);
    }
    if (typeof window.executeLoadFile === 'function') {
        var _origLoad = window.executeLoadFile;
        window.executeLoadFile = async function () {
            var r = await _origLoad.apply(this, arguments);
            _scheduleAfterOpen();
            return r;
        };
    }
    if (typeof window.switchToSheet === 'function') {
        var _origSwitch = window.switchToSheet;
        window.switchToSheet = function () {
            var r = _origSwitch.apply(this, arguments);
            _scheduleAfterOpen();
            return r;
        };
    }
    setInterval(function () { window._mbOffloadSweep(); }, 10 * 60 * 1000);
})();
