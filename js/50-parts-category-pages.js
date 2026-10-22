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
            icon: icon || '📄',
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
                    await tgt.feed(file);
                } catch (e) {
                    if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000);
                }
            }
        });
    };
})();
