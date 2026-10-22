// ══════════════════════════════════════════════════════════════════════════════
// 🗂 PARTS — 구분별 하위 화면 (스펙 도표가 아직 없는 구분용)
//
//  Summary "주요 자재"의 구분은 고정 13개 + 사람이 직접 더 넣는 것까지 있는데, 스펙 비교표
//  (도표)를 설계해 둔 건 PANEL / AD BD / CONV / TOUCH CTRL 네 개뿐이다. 예전엔 나머지 구분이
//  드롭다운에 **아예 안 나왔다** — 화면도 없고, 따라서 자료를 둘 NAS 폴더도 없었다.
//
//  그래서 "도표까지만" 있는 공용 화면 하나를 만들어 구분마다 돌려 쓴다:
//    ① 주요자재에 이미 적혀 있는 값(KTK PN·내역·원가)을 모델별로 보여주는 도표
//       — **새로 저장하는 값이 없다.** 주요자재가 원본이고 여기는 보여주기만 한다.
//    ② 그 구분의 NAS 폴더(PARTS/<구분>) 파일 목록 — 올리기·열기·AI 분석.
//
//  스펙 항목을 설계해서 ELEC_PART_TYPES(js/22d)와 ELEC_CATEGORY_META(js/23)에 넣으면
//  그 구분은 이 화면을 안 쓰고 **진짜 비교표**로 바뀐다 — 이 파일은 손댈 필요 없다.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _kb = function (n) {
        n = Number(n || 0);
        return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
    };

    // 지금 그려져 있는 구분 — NAS 올리기/다시 읽기가 어느 폴더를 쓸지 기억한다.
    var _cur = { category: '', folder: '', icon: '', label: '' };

    // ── 주요자재에서 이 구분의 행을 모델별로 모은다 ─────────────────────────
    //   화면 값이 가장 최신(저장 전 편집 포함)이라 Summary가 그려져 있으면 화면에서 읽고,
    //   아니면 저장된 값으로 — js/22e `_epProjectModelParts`와 **같은 규칙**이다.
    function _rowsByModel(cat) {
        var aliases = (window._MATERIAL_CATEGORY_ALIASES || {})[cat] || [];
        var names = [cat].concat(aliases);
        var models = (window.tabData && window.tabData.projectModels) || [];
        if (!models.length) models = [{}];
        return models.map(function (m, i) {
            var rows = [];
            try {
                if (window.collectMaterialRows && document.getElementById('sum-materials-rows-a-' + i)) {
                    rows = window.collectMaterialRows(true, i) || [];
                }
            } catch (e) { rows = []; }
            if (!rows.length) rows = m.materials || [];
            var hit = null;
            for (var k = 0; k < rows.length; k++) {
                if (names.indexOf(String(rows[k].category || '').trim()) !== -1) { hit = rows[k]; break; }
            }
            return {
                head: '#' + (i + 1) + (m.unitId ? ' · ' + m.unitId : ''),
                sub: m['고객모델명'] || '',
                ktkPn: (hit && hit.ktkPn) || '', description: (hit && hit.description) || '', cost: (hit && hit.cost) || ''
            };
        });
    }

    // ── 도표 ────────────────────────────────────────────────────────────────
    function _tableHtml(cat) {
        var cols = _rowsByModel(cat);
        var fields = [
            ['KTK PN', 'KTK PN', 'ktkPn'],
            ['내역', 'Description', 'description'],
            ['원가', 'Cost', 'cost']
        ];
        var head = '<tr><th style="min-width:140px;">' + _t('구분', 'Category') + '</th>'
            + cols.map(function (c) {
                return '<th style="min-width:130px; padding:4px 6px;">'
                    + '<span style="color:#2c5f8a; font-weight:bold;">' + _esc(c.head) + '</span>'
                    + (c.sub ? '<div style="margin-top:2px; font-size:10px; color:#888; font-weight:normal;">' + _esc(c.sub) + '</div>' : '')
                    + '</th>';
            }).join('') + '</tr>';
        var body = '<tr class="ep-section-row"><td colspan="' + (cols.length + 1) + '" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">['
            + _esc(_t('주요자재 등록값', 'Registered in Summary materials')) + ']</td></tr>';
        fields.forEach(function (f) {
            body += '<tr><td style="font-weight:bold; color:#555;">' + _esc(_t(f[0], f[1])) + '</td>'
                + cols.map(function (c) {
                    var v = String(c[f[2]] || '').trim();
                    return '<td style="text-align:center; color:' + (v ? '#1f2937' : '#bbb') + ';">' + _esc(v || '-') + '</td>';
                }).join('') + '</tr>';
        });
        return '<table class="concept-table" style="min-width:600px; border-collapse:collapse;">'
            + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    }

    // ── 화면 전체 ───────────────────────────────────────────────────────────
    /** opt: { key, category, icon, label } — js/23 `_getElecDropdownOptions()`가 주는 항목 */
    window._pcpRender = function (opt) {
        var host = document.getElementById('elec-view-generic');
        if (!host || !opt) return;
        _cur = {
            category: opt.category,
            folder: window._elecNasFolder ? window._elecNasFolder(opt.key) : 'PARTS',
            icon: opt.icon || '📄', label: opt.label || opt.category
        };
        host.innerHTML =
              '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13px; color:#555;">'
            + '  <span style="font-weight:bold; color:#2c5f8a; font-size:14px;">' + _esc(_cur.icon + ' ' + _cur.label) + '</span>'
            + '  <span style="background:#fff8e6; border:1px solid #ffe08a; color:#8a6d1f; border-radius:10px; font-size:11px; font-weight:bold; padding:1px 8px;">'
            +      _esc(_t('스펙 도표 준비 중', 'Spec table not designed yet')) + '</span>'
            + '  <span style="font-size:11.5px; color:#888;">'
            +      _esc(_t('스펙 항목이 아직 설계되지 않은 구분입니다 — 아래 도표와 NAS 자료까지만 제공합니다.',
                           'Spec fields are not designed for this category yet — only the table below and the NAS files are available.')) + '</span>'
            + '</div>'
            + '<div style="margin-top:8px; overflow-x:auto; border:1px solid #cfe3e5; border-radius:8px;">' + _tableHtml(_cur.category) + '</div>'
            + '<div style="margin-top:14px; border:1px solid #cfe3e5; border-radius:6px; overflow:hidden; background:#fff;">'
            + '  <div style="padding:10px 15px; background:#f8f9fa; display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13px; font-weight:bold; color:#2c5f8a;">'
            + '    <span>📁 ' + _esc(_t('NAS 자료', 'NAS files')) + '</span>'
            + '    <code style="font-weight:normal; font-size:11px; color:#777; background:#eef1f3; border-radius:4px; padding:1px 6px;">' + _esc(_cur.folder) + '</code>'
            + '    <span style="margin-left:auto; display:inline-flex; gap:6px;">'
            + '      <button onclick="window._pcpNasUpload()" style="padding:5px 11px; background:#eaf7ea; color:#1f6a3a; border:1px solid #a8dab8; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer;">⬆ ' + _esc(_t('올리기', 'Upload')) + '</button>'
            + '      <button onclick="window._pcpNasReload()" style="padding:5px 11px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer;">↻ ' + _esc(_t('다시 읽기', 'Reload')) + '</button>'
            + '    </span>'
            + '  </div>'
            + '  <div id="pcp-nas-body" style="max-height:340px; overflow-y:auto;"></div>'
            + '</div>';
        window._pcpNasReload();
    };

    window._pcpNasReload = async function () {
        var body = document.getElementById('pcp-nas-body');
        if (!body) return;
        body.innerHTML = '<div style="padding:16px; color:#888; font-size:12px;">⏳ ' + _esc(_t('목록을 받는 중…', 'Loading…')) + '</div>';
        if (!window._dsList) {
            body.innerHTML = '<div style="padding:16px; color:#8a4b00; font-size:12px;">⚠️ ' + _esc(_t('문서 저장소 기능을 불러오지 못했습니다.', 'The document store is not available.')) + '</div>';
            return;
        }
        var files;
        // ⚠️ 실패를 "파일 없음"으로 삼키지 않는다 — 백엔드가 꺼져 있는 것과 폴더가 빈 것은 다르다.
        try { files = (await window._dsList(_cur.folder)).files || []; }
        catch (e) {
            body.innerHTML = '<div style="padding:16px; font-size:12px; color:#8a4b00; background:#fff8e6; line-height:1.7;">⚠️ ' + _esc(e.message) + '</div>';
            return;
        }
        if (!files.length) {
            body.innerHTML = '<div style="padding:16px; color:#999; font-size:12px;">'
                + _esc(_t('이 폴더에 파일이 없습니다 — ⬆ 올리기로 사양서·사진을 넣어두면 팀원도 같이 봅니다.',
                          'This folder is empty — use Upload so the whole team can see the files.')) + '</div>';
            return;
        }
        body.innerHTML = files.map(function (f) {
            return '<div style="display:flex; align-items:center; gap:8px; padding:6px 14px; border-bottom:1px solid #f0f0f0;">'
                + '<span style="flex:1; min-width:0; font-size:12px; overflow-wrap:anywhere;">' + _esc(f.name) + '</span>'
                + '<span style="font-size:11px; color:#aaa; flex-shrink:0;">' + _kb(f.size) + '</span>'
                + '<span style="font-size:10.5px; color:#bbb; flex-shrink:0;">' + _esc(String(f.mtime || '').slice(0, 10)) + '</span>'
                + '<button onclick="window._dsOpenInNewTab(' + _esc(JSON.stringify(_cur.folder)) + ', ' + _esc(JSON.stringify(f.name)) + ')"'
                + ' title="' + _esc(_t('새 창에서 열기', 'Open in a new tab')) + '" style="flex-shrink:0; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:5px; width:24px; height:24px; padding:0; cursor:pointer; font-size:11px;">↗</button>'
                + '</div>';
        }).join('');
    };

    // ══════════════════════════════════════════════════════════════════════
    // 🤖 NAS 파일 → AI 추출 → 표 저장
    //
    //  새 추출기를 만들지 않는다. "항목 추가 ▸ AI로 추출"이 이미 있고(js/22d PANEL,
    //  js/22e 나머지), 거기엔 **사람이 추출 결과를 보고 저장하는 단계**가 들어 있다.
    //  여기서 하는 일은 그 흐름에 파일을 꽂아 주는 것뿐이다 — 파일 출처가 내 PC냐
    //  NAS냐만 다르다. 복제하면 프롬프트가 두 벌이 되어 한쪽만 고쳐진다.
    // ══════════════════════════════════════════════════════════════════════

    /** 지금 보고 있는 구분의 AI 추출 입구. 스펙 도표가 없는 구분은 null. */
    function _aiTarget() {
        var view = window._elecView;
        if (view === 'panel' && window.panelCompareOpenAddModal && window._pcProcessFile) {
            return { open: function () { return window.panelCompareOpenAddModal(); }, feed: window._pcProcessFile };
        }
        if (window.ELEC_PART_TYPES && window.ELEC_PART_TYPES[view]
            && window.elecCompareOpenAddModal && window._epProcessFile) {
            return { open: function () { return window.elecCompareOpenAddModal(view); }, feed: window._epProcessFile };
        }
        return null;
    }

    /**
     * 파일 하나를 지금 구분의 AI 추출 창에 올린다. 처리할 수 있으면 true.
     * js/42 `PAGE_EXCEL_SPECS.elecparts.onForeignFile`이 이 값을 보고 공용 AI 경로로
     * 넘길지 말지 정한다 — false면 js/42가 지금까지처럼 정직하게 "못 읽는다"고 말한다.
     */
    window._pcpAiFromFile = function (file) {
        var tgt = _aiTarget();
        if (!tgt || !file) return false;
        (async function () {
            try {
                await tgt.open();
                await tgt.feed(file);
                if (window.showToast) {
                    window.showToast('🤖 ' + _t('"' + file.name + '"에서 글자를 읽었습니다 — [AI로 추출]을 눌러주세요.',
                                                'Text loaded from "' + file.name + '" — press [Extract with AI].'), 'info', 6000);
                }
            } catch (e) {
                if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000);
            }
        })();
        return true;
    };

    /** 추가 모달의 "📁 NAS에서" — 지금 구분의 NAS 폴더에서 사양서를 골라 그대로 AI 추출로 */
    window._pcpPickNasForAi = function () {
        var tgt = _aiTarget();
        if (!tgt) {
            if (window.showToast) {
                window.showToast('⚠️ ' + _t('이 구분은 스펙 도표가 아직 없어 AI 추출을 할 수 없습니다.',
                                            'This category has no spec table yet, so AI extraction is not available.'), 'warning', 6000);
            }
            return;
        }
        if (!window._dsOpenPicker) {
            if (window.showToast) window.showToast('⚠️ ' + _t('문서 저장소 기능을 불러오지 못했습니다.', 'The document store is not available.'), 'error');
            return;
        }
        window._dsOpenPicker({
            folder: window._elecNasFolder ? window._elecNasFolder() : 'PARTS',
            folders: window._elecNasFolders ? window._elecNasFolders() : null,
            title: _t('NAS에서 사양서 고르기 — AI 추출', 'Pick a datasheet from the NAS — AI extraction'),
            onPick: async function (folder, name) {
                try {
                    if (window.showToast) window.showToast('⏳ ' + _t('"' + name + '" 받는 중…', 'Fetching "' + name + '"…'), 'info');
                    var file = await window._dsFileOf(folder, name);
                    await tgt.feed(file);
                } catch (e) {
                    if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000);
                }
            }
        });
    };

    window._pcpNasUpload = function () {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.multiple = true;
        inp.onchange = async function () {
            var fs = Array.prototype.slice.call(inp.files || []);
            if (!fs.length) return;
            var ok = 0, fail = [];
            for (var i = 0; i < fs.length; i++) {
                try { await window._dsPut(_cur.folder, fs[i]); ok++; }
                catch (e) { fail.push(fs[i].name + ': ' + e.message); }
            }
            if (window.showToast) {
                window.showToast('✅ ' + ok + _t('개 올렸습니다', ' uploaded') + (fail.length ? ' · ❌ ' + fail.length : ''),
                                 fail.length ? 'warning' : 'info', fail.length ? 6000 : 3000);
            }
            if (fail.length) console.warn('[PARTS] NAS 업로드 실패:', fail);
            await window._pcpNasReload();
        };
        inp.click();
    };
})();
