// ══════════════════════════════════════════════════════════════════════════════
// 🗂 PARTS — 전용 도표가 없는 구분도 AD BD와 **같은** 비교표를 쓰게 만든다
//
//  Summary "주요 자재"의 구분은 고정 13개 + 사람이 더 넣는 것까지 있는데, 전용 스펙 도표를
//  설계해 둔 건 PANEL / AD BD / CONV / TOUCH CTRL 네 개뿐이다. 예전엔 나머지 구분이 드롭다운에
//  아예 안 나왔고, 한동안은 "도표까지만" 보여주는 별도 화면을 썼다 — 그러면 ➕ 추가 · 🔽 펼치기 ·
//  📊 엑셀 저장 · AI 추출이 전부 없어서 반쪽이다.
//
//  그래서 베끼지 않고 **복제**한다:
//    ① 부품 종류를 `ELEC_PART_TYPES`에 등록한다 — 스키마는 공용 기본 항목
//       (`GENERIC_PART_SPEC_SCHEMA`, js/22d). 이러면 js/22e의 비교표 엔진·추가 모달·
//       AI 추출·엑셀 저장이 **고칠 것 없이** 그 구분에서도 돈다.
//    ② 화면 DOM과 헤더 버튼 묶음은 **AD BD 것을 통째로 복제**하고 id 안의 `adbd`만 바꾼다.
//       HTML에 9벌을 더 붙여넣지 않는 이유가 그것이다 — 한 벌을 고치면 전부 따라온다.
//
//  전용 항목이 필요해지면 그 구분만 전용 스키마를 만들어 ELEC_PART_TYPES에 꽂고
//  ELEC_CATEGORY_META(js/23)에 `view`를 적으면 된다 — 그때부터 이 파일을 안 탄다.
//
//  🤖 아래쪽은 NAS 사양서 → AI 추출 연결. 추출기를 복제하지 않고 기존 흐름에 파일만 꽂는다.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };

    // 복제 원본 — AD BD 한 벌. 이 둘의 구조가 바뀌면 복제본도 같이 바뀐다(그게 목적이다).
    var SRC_VIEW = 'elec-view-adbd';
    var SRC_BTNS = 'eh-adbd-btns';

    /**
     * 전용 도표가 없는 구분을 부품 종류로 등록한다. js/23 `_getElecDropdownOptions()`가
     * 구분을 훑을 때마다 부른다(구분 목록을 아는 곳이 거기 하나뿐이라서).
     * 이미 있으면 **손대지 않는다** — 전용 스키마를 덮어쓰면 안 된다.
     */
    window._pcpRegisterType = function (key, category, icon, label) {
        if (!key || !window.ELEC_PART_TYPES || !window.GENERIC_PART_SPEC_SCHEMA) return;
        if (window.ELEC_PART_TYPES[key]) return;
        window.ELEC_PART_TYPES[key] = {
            label: label || category,
            icon: icon || '📜',
            // `domain`은 AI 추출 프롬프트가 "무슨 부품인지" 알려주는 유일한 단서다(js/22e).
            domain: category,
            // 팀 공용 라이브러리 파일 — 구분마다 따로. 처음 쓸 때 Drive에 만들어진다.
            libFilename: 'ElecPartLib_' + String(key).toUpperCase() + '_Shared.json',
            schema: window.GENERIC_PART_SPEC_SCHEMA,
            // 공용 기본 항목을 쓰는 중이라는 표시 — 드롭다운 꼬리표(js/23)가 이걸 본다.
            generic: true
        };
    };

    /**
     * 그 구분의 화면과 헤더 버튼을 만든다(이미 있으면 그냥 true).
     * AD BD 한 벌을 복제하고 id·onclick 안의 `adbd`를 키로 바꾼다.
     */
    window._pcpEnsureView = function (key) {
        if (!key) return false;
        if (document.getElementById('elec-view-' + key)) return true;
        // 전용 화면이 HTML에 이미 있는 구분(panel/adbd/convbd/touchctrl)은 만들 일이 없다.
        if (!(window.ELEC_PART_TYPES || {})[key]) return false;
        var srcView = document.getElementById(SRC_VIEW);
        var srcBtns = document.getElementById(SRC_BTNS);
        if (!srcView || !srcBtns) return false;

        // `adbd`는 이 두 덩어리 안에서 id와 onclick 인자로만 쓰인다 — 통째 치환이 안전하다.
        var re = new RegExp('adbd', 'g');
        var box = document.createElement('div');

        box.innerHTML = srcView.outerHTML.replace(re, key);
        var view = box.firstElementChild;
        view.style.display = 'none';
        srcView.parentNode.appendChild(view);

        box.innerHTML = srcBtns.outerHTML.replace(re, key);
        var btns = box.firstElementChild;
        btns.style.display = 'none';
        // ⚠️ 📊/📂/📁 묶음(#eh-pxio-anchor, js/42)이 **마지막**이어야 오른쪽에 붙는다.
        //    그래서 뒤에 붙이지 않고 AD BD 묶음 앞에 끼운다.
        srcBtns.parentNode.insertBefore(btns, srcBtns);
        return true;
    };

    // ══════════════════════════════════════════════════════════════════════
    // 🤖 NAS 파일 → AI 추출 → 표 저장
    //
    //  새 추출기를 만들지 않는다. "항목 추가 ▸ AI로 추출"이 이미 있고(js/22d PANEL,
    //  js/22e 나머지), 거기엔 **사람이 추출 결과를 보고 저장하는 단계**가 들어 있다.
    //  여기서 하는 일은 그 흐름에 파일을 꽂아 주는 것뿐이다 — 파일 출처가 내 PC냐
    //  NAS냐만 다르다. 복제하면 프롬프트가 두 벌이 되어 한쪽만 고쳐진다.
    // ══════════════════════════════════════════════════════════════════════

    /** 지금 보고 있는 구분의 AI 추출 입구. */
    function _aiTarget() {
        var view = window._elecView;
        if (view === 'panel' && window.panelCompareOpenAddModal && window._pcProcessFile) {
            return { open: function () { return window.panelCompareOpenAddModal(); }, feed: window._pcProcessFile };
        }
        if ((window.ELEC_PART_TYPES || {})[view] && window.elecCompareOpenAddModal && window._epProcessFile) {
            return { open: function () { return window.elecCompareOpenAddModal(view); }, feed: window._epProcessFile };
        }
        return null;
    }

    /**
     * 파일 하나를 지금 구분의 AI 추출 창에 올린다. 처리할 수 있으면 true.
     * js/42 `PAGE_EXCEL_SPECS.elecparts.onForeignFile`이 이 값을 보고 공용 AI 경로로
     * 넘길지 말지 정한다 — false면 js/42가 지금까지처럼 정직하게 "못 읽는다"고 말한다.
     */
    // ⚠️ 엑셀은 AI 추출로 보내지 않는다 — `_pcProcessFile`/`_epProcessFile`이 pdf/html이 아니면
    //    `file.text()`로 읽으므로, 이진 엑셀을 넣으면 **깨진 글자를 AI에 보낸다**(할당량만 날린다).
    //    엑셀은 js/42가 워크북으로 읽어 preParse(js/51 패널 일괄 이식)로 보내는 게 맞는 길이다.
    //    확장자 목록은 js/42 DOC_FILE_KINDS 한 곳만 본다(2026-10-30) — 세 군데에 따로 적어 두면 조용히 어긋난다.
    var WORKBOOK_RE = { test: function (n) { return window._docIsWorkbook ? window._docIsWorkbook(n) : /\.(xlsx|xlsm|xls|csv)$/i.test(n); } };

    window._pcpAiFromFile = function (file) {
        var tgt = _aiTarget();
        if (!tgt || !file) return false;
        if (WORKBOOK_RE.test(file.name || '')) return false;
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
                window.showToast('⚠️ ' + _t('이 구분은 아직 비교표를 쓸 수 없어 AI 추출을 할 수 없습니다.',
                                            'This category has no comparison table yet, so AI extraction is not available.'), 'warning', 6000);
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
                    // 📚 엑셀을 골랐으면 데이터시트가 아니라 **비교표**일 가능성이 높다 —
                    //    AI로 글자를 뽑는 대신 워크북으로 읽어 일괄 이식(js/51)에 넘긴다.
                    if (WORKBOOK_RE.test(name) && window.XLSX && window._pliImportFromWorkbook) {
                        var wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
                        if (window._pliImportFromWorkbook(wb, name)) {
                            var m = document.getElementById('ep-add-modal') || document.getElementById('pc-add-modal');
                            if (m) m.style.display = 'none';
                            return;
                        }
                        if (window.showToast) {
                            window.showToast('⚠️ ' + _t('이 엑셀에서 비교표 꼴(머리행 "Comparison table")을 찾지 못했습니다.',
                                                        'No comparison-table header ("Comparison table") found in this workbook.'), 'warning', 7000);
                        }
                        return;
                    }
                    await tgt.feed(file);
                } catch (e) {
                    if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000);
                }
            }
        });
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// 🔍 [2026-11-24 사용자 요청] PARTS 비교표 검색 — 프로젝트 불러오기·Project list·주소록과 **같은 규칙**
//    (js/04a `_searchTokens`/`_searchMatchAll`/`_searchMatchAny` 한 벌: 띄어 쓴 낱말이 한 행의 서로 다른
//    칸에 있어도 전부 있으면 걸림, 공백·기호 무시). 행 = 스펙 항목(라벨 + 부품별 값 + Note).
//    ⚠️ 행을 지우지 않고 **클래스로만** 숨기고 보인다 — 접힌(2순위) 행의 인라인 display 를 건드리면
//       🔽 펼치기/접기 상태가 망가진다. 검색을 지우면 클래스만 떼서 원래 상태로 돌아간다.
//    ⚠️ 부품 구분이 런타임에 늘어나므로(복제 화면) 지금 보이는 `.elec-spec-view` 의 표를 그때그때 집는다.
//    ⚠️ 검색칸 id 는 `eh-search` — `-btns` 로 끝나면 js/23·js/38 이 화면 전환 때 숨겨 버린다.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    var _en = function () { return window._currentLang === 'en'; };
    window._partsSearchTerm = '';

    function ensureBox() {
        if (document.getElementById('eh-search')) return;
        var anchor = document.getElementById('eh-panel-btns');
        if (!anchor || !anchor.parentNode) return;
        // 🔍 [2026-11-24 "검색 UI 를 헤더로"] 칸 대신 🔍 버튼(js/22b `_hdrFindWidget`) — 누르면 아래 상자에 칸이 뜬다.
        //    바깥 span#eh-search 는 그대로 둔다(BOM 화면에서 숨기고 SPEC 에서 다시 보이는 게 이 id 다).
        if (!window._hdrFindWidget) return;
        var box = document.createElement('span');
        box.id = 'eh-search';
        box.style.cssText = 'display:inline-flex; align-items:center; flex-shrink:0;';
        var w = window._hdrFindWidget({ inputId: 'parts-search-input', countId: 'parts-search-count',
            ko: '🔍 항목·값 검색', en: '🔍 Search items · values',
            inputTitle: _en() ? 'Several words OK — a row matches when all words appear in it' : '여러 낱말 가능 — 한 항목 행에 낱말이 모두 있으면 걸립니다' });
        box.appendChild(w.el);
        anchor.parentNode.insertBefore(box, anchor);
        var inp = w.input;
        var t = null;
        inp.oninput = function () {
            clearTimeout(t);
            t = setTimeout(function () { window._partsSearchTerm = inp.value; window._partsSearchApply(); }, 150);
        };
        inp.onkeydown = function (e) { if (e.key === 'Escape' && inp.value) { inp.value = ''; window._partsSearchTerm = ''; window._partsSearchApply(); } };
    }

    function visibleTbody() {
        var views = document.querySelectorAll('.elec-spec-view');
        for (var i = 0; i < views.length; i++) {
            if (views[i].style.display !== 'none') return views[i].querySelector('table.concept-table tbody');
        }
        return null;
    }
    function cellText(td) {
        var inp = td.querySelector('input, textarea');
        return (td.textContent || '') + (inp ? ' ' + (inp.value || '') : '');
    }
    var isSection = function (tr) { return /(^|\s)(pc|ep)-section-row(\s|$)/.test(tr.className || ''); };

    window._partsSearchApply = function () {
        var tbody = visibleTbody();
        var countEl = document.getElementById('parts-search-count');
        if (!tbody) { if (countEl) countEl.textContent = ''; return; }
        var toks = window._searchTokens ? window._searchTokens(window._partsSearchTerm) : [];
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.forEach(function (tr) {
            tr.classList.remove('parts-search-hide', 'parts-search-show');
            Array.prototype.forEach.call(tr.cells, function (td) { td.classList.remove('search-hit'); });
        });
        if (!toks.length) { if (countEl) countEl.textContent = ''; return; }
        var total = 0, shown = 0, sec = null, secHit = false, secHas = false;
        var closeSection = function () { if (sec) sec.classList.add(secHas ? 'parts-search-show' : 'parts-search-hide'); };
        rows.forEach(function (tr) {
            if (isSection(tr)) {
                closeSection();
                sec = tr; secHas = false;
                secHit = window._searchMatchAll(tr.textContent, toks);   // 구역 이름이 걸리면 그 구역 전부
                return;
            }
            total++;
            var cells = Array.prototype.slice.call(tr.cells);
            var hit = secHit || window._searchMatchAll(cells.map(cellText).join(' \u0001 '), toks);
            tr.classList.add(hit ? 'parts-search-show' : 'parts-search-hide');   // 접힌 2순위 행도 걸리면 보인다
            if (hit) {
                shown++; secHas = true;
                cells.forEach(function (td) { if (window._searchMatchAny(cellText(td), toks)) td.classList.add('search-hit'); });
            }
        });
        closeSection();
        if (countEl) countEl.textContent = shown + ' / ' + total + (_en() ? '' : '항목');
    };

    // 다시 그려지면(구분 전환·추가·펼치기·언어 전환) 검색을 다시 건다 — 그리기는 async 라 끝난 뒤에
    function after(name, fn) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig._partsSearchWrapped) return;
        var w = function () {
            var r = orig.apply(this, arguments);
            try {
                if (r && typeof r.then === 'function') r.then(function () { fn(); }, function () {});
                else fn();
            } catch (e) { /* 검색 재적용 실패가 화면을 막지 않게 */ }
            return r;
        };
        w._partsSearchWrapped = true;
        window[name] = w;
    }
    function boot() {
        ensureBox();
        after('renderPanelCompareTab', window._partsSearchApply);
        after('renderElecCompareTab', window._partsSearchApply);
        after('_switchElecView', function () {
            var b = document.getElementById('eh-search'); if (b) b.style.display = 'inline-flex';
            window._partsSearchApply();
        });
        // BOM 화면에는 비교표가 없다 — 검색칸을 숨긴다(BOM 헤더는 여유가 7px 뿐이다)
        after('_elecBomOpen', function () { var b = document.getElementById('eh-search'); if (b) b.style.display = 'none'; });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
