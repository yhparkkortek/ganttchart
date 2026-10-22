// ══════════════════════════════════════════════════════════════════════════════
// 📚 패널 비교표 엑셀 → 팀 공용 패널 라이브러리 일괄 이식
//
//  회사가 쓰는 "Panel Comparison Table" 엑셀의 `REFERENCE` 시트는 이 앱의 패널 비교표와
//  **같은 꼴**이다 — 0행이 모델명, A열이 항목 라벨, 섹션은 `[...]` 로 시작. 실측(2026-10-22)에서
//  패널 146개 × 라벨 123개 중 105개가 **이름까지 그대로** 맞았다.
//
//  그래서 AI를 안 쓴다(결정론 먼저 + 무료 키 하루 한도). 이름이 어긋나는 건 공백·대소문자
//  차이뿐이라 정규화로 흡수하고, 진짜 다른 것만 `PLI_LABEL_ALIASES`(데이터)에 적는다.
//
//  ⚠️ 팀 **공용** 라이브러리를 한 번에 100개 넘게 건드린다. 그래서:
//    • 한 번 읽고 한 번 쓴다 — `upsertPanelLibraryEntry`를 146번 부르면 Drive 왕복이 292번이다.
//    • 항목 단위로 **병합**한다. 파일에 있는 값은 파일이 이기고, 파일에 **없는 키는 그대로 둔다** —
//      Item Code·Part Name 처럼 이 파일에 없는 칸을 누가 채워 뒀으면 지우면 안 된다.
//    • 모델명 기준 멱등. 같은 파일을 두 번 넣어도 중복이 안 생긴다.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };

    // 🔤 파일 라벨 ↔ 앱 항목 이름이 **진짜로 다른** 것만. 공백·대소문자 차이는 아래 _norm 이 먹는다.
    //    새로 어긋나는 게 나오면 여기 한 줄 추가 — 코드는 안 고친다.
    window.PLI_LABEL_ALIASES = {
        'latetimeorder': 'Last Time Order'   // 파일 쪽 오타('Late' ← 'Last')
    };

    // 라벨 정규화 — 공백을 다 없애고 소문자로. 끝의 ':'와 섹션의 '[' ']'도 떼어낸다.
    function _norm(s) {
        return String(s == null ? '' : s)
            .replace(/\s*:\s*$/, '')
            .replace(/^\[/, '').replace(/\]$/, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    // 모델명 정규화 — 이 회사 파일엔 `●MV270QUM-N50[LNO-]` 처럼 표시가 붙은 시트도 있다
    // (PROJECT·PANEL COMP TABLE). REFERENCE는 깨끗하지만, 다른 시트를 넣어도 읽히게 떼어 둔다.
    function _model(s) {
        return String(s == null ? '' : s)
            .replace(/^[●○•*\s]+/, '')
            .replace(/\s*\[[^\]]*\]\s*$/, '')
            .trim();
    }

    /** 앱 PANEL 항목: 정규화된 이름 → 원래 이름 */
    function _appFields() {
        var map = {};
        (window.PANEL_SPEC_SCHEMA || []).forEach(function (sec) {
            (sec.fields || []).forEach(function (f) { map[_norm(f[0])] = f[0]; });
        });
        return map;
    }

    /** 이 시트가 "비교표 꼴"인가 — A열에 'Comparison table' 머리행이 있는지로 본다. */
    function _headerRow(aoa) {
        for (var r = 0; r < Math.min(6, aoa.length); r++) {
            if (_norm(aoa[r] && aoa[r][0]) === 'comparisontable') return r;
        }
        return -1;
    }

    /** 워크북 안에서 읽을 시트 이름을 고른다. REFERENCE 우선, 없으면 꼴이 맞는 첫 시트. */
    window._pliPickSheet = function (wb) {
        if (!wb || !wb.SheetNames || !window.XLSX) return null;
        var names = wb.SheetNames.slice();
        // 'REFERENCE'가 **전체 패널 목록**이다. 'PANEL COMP TABLE'은 지금 프로젝트용 발췌라
        // 모델 수가 적고 [Project] 행이 끼어 있어서, 둘 다 있으면 REFERENCE를 쓴다.
        names.sort(function (a, b) {
            var pa = /^reference$/i.test(a) ? 0 : 1, pb = /^reference$/i.test(b) ? 0 : 1;
            return pa - pb;
        });
        for (var i = 0; i < names.length; i++) {
            var aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[names[i]], { header: 1, defval: '', raw: false });
            if (_headerRow(aoa) !== -1) return names[i];
        }
        return null;
    };

    /** 넣어도 되는 파일인지 — 동기 판정(js/42 preParse가 boolean을 기대한다) */
    window._pliLooksLikePanelTable = function (wb) {
        try { return !!window._pliPickSheet(wb); } catch (e) { return false; }
    };

    /**
     * 워크북 → 라이브러리에 넣을 항목 목록.
     * 반환: { sheet, panels:[{model,specs,filled}], usedLabels, unknownLabels, emptyModels }
     */
    window._pliParseWorkbook = function (wb) {
        var sheet = window._pliPickSheet(wb);
        if (!sheet) return null;
        var aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: false });
        var hr = _headerRow(aoa);
        var fields = _appFields();

        // 모델 열 — 머리행에서 값이 있는 칸. A열(라벨)과 B열(우선순위 1/2)은 건너뛴다.
        var cols = [];
        for (var c = 2; c < (aoa[hr] || []).length; c++) {
            var m = _model(aoa[hr][c]);
            if (m && m !== '-') cols.push({ c: c, model: m });
        }

        var specsByCol = {}, usedLabels = [], unknownLabels = [];
        cols.forEach(function (x) { specsByCol[x.c] = {}; });
        for (var r = hr + 1; r < aoa.length; r++) {
            var raw = aoa[r] && aoa[r][0];
            var key = _norm(raw);
            if (!key) continue;
            var app = fields[key] || fields[_norm(window.PLI_LABEL_ALIASES[key] || '')];
            if (!app) { if (unknownLabels.indexOf(String(raw).trim()) === -1) unknownLabels.push(String(raw).trim()); continue; }
            if (usedLabels.indexOf(app) === -1) usedLabels.push(app);
            cols.forEach(function (x) {
                var v = String((aoa[r] || [])[x.c] == null ? '' : aoa[r][x.c]).trim();
                // '-'는 "해당 없음" 표시다 — 값으로 저장하면 비교표에 '-'가 박힌다(어차피 기본 표시가 '-').
                if (v && v !== '-') specsByCol[x.c][app] = v;
            });
        }

        var panels = [], emptyModels = [];
        var seen = {};
        cols.forEach(function (x) {
            var specs = specsByCol[x.c];
            var filled = Object.keys(specs).length;
            if (!filled) { emptyModels.push(x.model); return; }
            var k = x.model.toLowerCase();
            if (seen[k]) return;              // 같은 모델이 두 열에 있으면 첫 열만
            seen[k] = true;
            panels.push({ model: x.model, specs: specs, filled: filled });
        });
        return { sheet: sheet, panels: panels, usedLabels: usedLabels, unknownLabels: unknownLabels, emptyModels: emptyModels };
    };

    // ── Drive 쓰기 — 한 번 읽고 한 번 쓴다 ──────────────────────────────────
    function _token() {
        var t = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        return (t ? t.access_token : null) || window.googleAccessToken;
    }

    /**
     * 항목 여러 개를 라이브러리에 **병합**한다(읽기 1회 + 쓰기 1회).
     * 반환: { ok, added, updated, unchanged, fieldsWritten, error }
     */
    window._pliBulkUpsert = async function (entries) {
        var token = _token();
        if (!token) {
            return { ok: false, error: _t('먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.',
                                          'Please connect Google Drive first.') };
        }
        var fileId = await window.findPanelLibFile(token);
        var lib = { panels: [] };
        if (fileId) {
            var res = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true',
                                  { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) return { ok: false, error: _t('라이브러리를 읽지 못했습니다 (HTTP ' + res.status + ')',
                                                       'Could not read the library (HTTP ' + res.status + ')') };
            var loaded = await res.json();
            if (loaded && Array.isArray(loaded.panels)) lib = loaded;
        }

        var now = new Date().toISOString();
        var by = window.currentUserName || '';
        var added = 0, updated = 0, unchanged = 0, fieldsWritten = 0;
        var idxOf = {};
        lib.panels.forEach(function (p, i) { idxOf[String(p.model || '').trim().toLowerCase()] = i; });

        entries.forEach(function (e) {
            var k = e.model.trim().toLowerCase();
            var i = idxOf[k];
            if (i === undefined) {
                var fresh = {
                    model: e.model,
                    brand: (e.specs['Panel Brand'] && e.specs['Panel Brand'] !== '-') ? e.specs['Panel Brand'] : '',
                    sourceUrl: 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(e.model),
                    specs: Object.assign({}, e.specs),
                    updatedAt: now, updatedBy: by
                };
                idxOf[k] = lib.panels.length;
                lib.panels.push(fresh);
                added++;
                fieldsWritten += Object.keys(e.specs).length;
                return;
            }
            // ⚠️ 통째로 바꾸지 않는다 — 파일에 **없는** 칸(Item Code·Part Name 등)을 누가 채워 뒀으면
            //    지우면 안 된다. 파일이 준 칸만 덮어쓴다.
            var cur = lib.panels[i];
            cur.specs = cur.specs || {};
            var changed = 0;
            Object.keys(e.specs).forEach(function (f) {
                if (String(cur.specs[f] == null ? '' : cur.specs[f]).trim() === e.specs[f]) return;
                cur.specs[f] = e.specs[f];
                changed++;
            });
            if (!cur.brand && e.specs['Panel Brand'] && e.specs['Panel Brand'] !== '-') cur.brand = e.specs['Panel Brand'];
            if (changed) {
                cur.updatedAt = now; cur.updatedBy = by;
                updated++; fieldsWritten += changed;
            } else {
                unchanged++;
            }
        });

        var body = JSON.stringify(lib);
        if (fileId) {
            var up = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&supportsAllDrives=true',
                { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body });
            if (!up.ok) return { ok: false, error: _t('라이브러리를 저장하지 못했습니다 (HTTP ' + up.status + ')',
                                                      'Could not save the library (HTTP ' + up.status + ')') };
        } else {
            var folderId = await window.getOrCreateConfigFolder(token);
            var b = 'panel_lib_boundary';
            var meta = { name: 'PanelSpecLibrary_Shared.json', mimeType: 'application/json', parents: [folderId] };
            var mp = '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta)
                   + '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--' + b + '--';
            var cr = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
                { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + b + '"' }, body: mp });
            var created = await cr.json();
            if (!(created && created.id)) return { ok: false, error: _t('라이브러리 파일을 만들지 못했습니다.', 'Could not create the library file.') };
            window._panelLibFileId = created.id;
        }
        if (window._epLibCache) delete window._epLibCache.panel;   // 다음 읽기에서 최신본을 받게
        return { ok: true, added: added, updated: updated, unchanged: unchanged, fieldsWritten: fieldsWritten };
    };

    /**
     * 워크북을 받아 이식까지 — 꼴이 맞으면 **true를 바로 돌려주고** 뒤는 비동기로 돈다
     * (js/42 `preParse`가 동기 boolean을 기대한다).
     * 사람 승인창은 두지 않는다(사용자 요청 2026-10-22: "이미 검증된 파일"). 대신
     * 모델명 기준 멱등 + 항목 단위 병합이라, 다시 넣어도 중복이나 유실이 없다.
     */
    window._pliImportFromWorkbook = function (wb, fileName) {
        var parsed;
        try { parsed = window._pliParseWorkbook(wb); } catch (e) { parsed = null; }
        if (!parsed || !parsed.panels.length) return false;

        (async function () {
            var n = parsed.panels.length;
            if (window.showToast) {
                window.showToast('⏳ ' + _t('[' + parsed.sheet + '] 패널 ' + n + '개를 라이브러리에 넣는 중…',
                                            'Importing ' + n + ' panels from [' + parsed.sheet + ']…'), 'info');
            }
            var r;
            try { r = await window._pliBulkUpsert(parsed.panels); }
            catch (e) { r = { ok: false, error: e.message }; }

            if (!r.ok) {
                if (window.showToast) window.showToast('❌ ' + _t('일괄 이식 실패: ', 'Import failed: ') + r.error, 'error', 9000);
                if (window._issueLog) { try { window._issueLog('panel-lib-import', { file: fileName, error: r.error }); } catch (e) { /* 신고 실패가 이식을 막지 않게 */ } }
                return;
            }
            // 화면에 바로 반영 — PANEL 뷰를 보고 있으면 다시 그린다.
            if (window._elecView === 'panel' && window.renderPanelCompareTab) {
                try { await window.renderPanelCompareTab(); } catch (e) { /* 표시 실패가 이식을 되돌리진 않는다 */ }
            }
            var msg = '📚 ' + _t('패널 라이브러리에 넣었습니다 — 새로 ' + r.added + '개 · 갱신 ' + r.updated + '개'
                                 + (r.unchanged ? ' · 그대로 ' + r.unchanged + '개' : '') + ' (칸 ' + r.fieldsWritten + '개)',
                                 'Imported into the panel library — ' + r.added + ' new, ' + r.updated + ' updated'
                                 + (r.unchanged ? ', ' + r.unchanged + ' unchanged' : '') + ' (' + r.fieldsWritten + ' fields)');
            if (window.showToast) window.showToast(msg, 'success', 9000);
            // 못 읽은 라벨은 **드러낸다** — 조용히 빠지면 "왜 이 항목만 비어 있지"가 된다.
            if (parsed.unknownLabels.length) {
                console.warn('[패널 일괄 이식] 앱 항목에 없는 라벨 ' + parsed.unknownLabels.length + '개(섹션 머리글 포함):',
                             parsed.unknownLabels);
            }
            if (parsed.emptyModels.length) {
                console.warn('[패널 일괄 이식] 값이 하나도 없어 건너뛴 열 ' + parsed.emptyModels.length + '개:', parsed.emptyModels);
            }
            console.log('[패널 일괄 이식] 시트 [' + parsed.sheet + '] · 쓴 항목 ' + parsed.usedLabels.length + '종 · 패널 ' + n + '개');
        })();
        return true;
    };
})();
