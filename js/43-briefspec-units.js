// 🧩 [2026-10-20 신규] Customer SPEC을 **제품구분자(모델)별**로 나눠 보관한다.
//
//  왜: 처음엔 제품군을 한 페이지에 다 적으려고 Model A/B/C 세 열로 만들었는데, 모델이
//      MVD/TVD/TPR/BTN… 으로 늘어나면서 세 칸으로는 모자라고 열도 좁아졌다. M.C Table·BOM이
//      이미 쓰고 있는 **제품구분자 전환**과 같은 방식으로 바꾼다(사용자 요청).
//
//  어떻게: `tabData.briefSpecByUnit[제품구분자] = 행배열` 로 두고, `tabData.briefSpec` 은
//      **지금 보고 있는 제품구분자의 배열을 가리키는 별칭**으로 유지한다.
//      M.C Table의 `mcTable` ↔ `mcRevisions.R1` 과 똑같은 방식이다.
//      → 기존 코드(주간보고·AI 문답 컨텍스트·엑셀 출력 등 8개 파일)가 `tabData.briefSpec`을
//        그대로 읽으므로 **손댈 필요가 없다.** 행의 값 칸 이름도 `modelA`를 그대로 쓴다.
//
//  ⚠️ 제품구분자는 M.C/BOM과 **같은 것을 공유한다**(`window.mcActiveUnit`, `getMcUnits()`).
//     따로 두면 "M.C는 TPR을 보는데 Customer SPEC은 MVD" 같은 어긋남이 생긴다.
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _td = function () { window.tabData = window.tabData || {}; return window.tabData; };

    window.bsActiveUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        var cur = window.mcActiveUnit || '';
        if (cur) return cur;
        return units.length ? units[0] : '';
    };

    var _store = function () {
        var td = _td();
        td.briefSpecByUnit = td.briefSpecByUnit || {};
        return td.briefSpecByUnit;
    };

    // ── 🔄 자동 이전 (Model A/B/C → 제품구분자별) ──────────────────────
    //   옛 파일을 열 때 **딱 한 번** 돈다. `briefSpecByUnit`이 생기면 다시 돌지 않는다.
    //   Drive에 저장된 옛 프로젝트가 계속 들어오므로 "한 번 돌리고 끝"이 아니라
    //   **프로젝트를 읽을 때마다** 확인해야 한다(populateTabData 앞에서 부른다).
    var COLS = ['modelA', 'modelB', 'modelC'];
    var DEFAULT_LABEL = { modelA: 'Model A', modelB: 'Model B', modelC: 'Model C' };

    window.bsMigrateFromModelCols = function () {
        var td = _td();
        if (td.briefSpecByUnit) return false;              // 이미 이전됨
        var rows = td.briefSpec;
        if (!Array.isArray(rows) || !rows.length) return false;

        var labels = td.bsColLabels || {};
        var custom = function (k) {
            var v = String(labels[k] || '').trim();
            return (v && v !== DEFAULT_LABEL[k]) ? v : '';
        };
        var hasData = function (k) {
            return rows.some(function (r) { return String((r && r[k]) || '').trim(); });
        };
        // 값이 있거나 이름을 바꿔 둔 열만 "쓰이고 있던 열"로 본다.
        var used = COLS.filter(function (k) { return hasData(k) || custom(k); });

        var byUnit = {};
        var pick = function (r, k) {
            // 구버전은 값이 `desc`에 있었다(js/22g의 호환 코드와 같은 규칙).
            var v = (r && r[k] !== undefined) ? r[k] : (k === 'modelA' ? (r && r.desc) : '');
            return (v == null) ? '' : String(v);
        };
        var mk = function (k) {
            return rows.map(function (r) {
                return { type: (r && r.type) || '', sub: (r && r.sub) || '',
                         modelA: pick(r, k), note: (r && r.note) || '' };
            });
        };

        // 열 하나만 쓰였고 이름도 기본값이면 — 굳이 "Model A"라는 제품구분자를 만들지 않는다.
        // 지금 보고 있는 제품구분자(없으면 빈 이름) 밑에 그대로 넣는다.
        if (used.length <= 1 && !custom(used[0] || 'modelA')) {
            byUnit[window.bsActiveUnit()] = mk(used[0] || 'modelA');
        } else {
            used.forEach(function (k) {
                var name = custom(k) || DEFAULT_LABEL[k];
                byUnit[name] = mk(k);
                // 제품구분자 목록에 없으면 추가 — 이래야 전환 버튼에 뜬다.
                var units = window.getMcUnits ? window.getMcUnits() : null;
                if (units && units.indexOf(name) === -1) units.push(name);
            });
            // 첫 열을 기본으로 보여 준다(사람이 Model A부터 채웠을 테니).
            var first = custom(used[0]) || DEFAULT_LABEL[used[0]];
            if (!window.mcActiveUnit) window.mcActiveUnit = first;
        }

        td.briefSpecByUnit = byUnit;
        delete td.bsColLabels;                              // 더 이상 쓰지 않는다(열이 하나뿐)
        window.bsSyncAlias();
        try {
            console.info('[Customer SPEC 이전] Model A/B/C → 제품구분자별 보관:',
                         Object.keys(byUnit).map(function (u) { return (u || '(이름없음)') + ' ' + byUnit[u].length + '행'; }).join(', '));
        } catch (e) { /* 로그 실패가 이전을 막지 않게 */ }
        return true;
    };

    // `briefSpec` 별칭을 지금 제품구분자의 배열로 맞춘다(없으면 빈 배열을 만들어 연결).
    //
    // ⚠️⚠️ 두 방향을 구분해야 한다 — 안 그러면 데이터가 조용히 사라진다(2026-10-21 실측에서 겪음).
    //   ① 다른 코드가 `tabData.briefSpec` 에 **새 배열을 꽂은** 경우(엑셀 불러오기·AI 채우기·
    //      시트 파서…). 그게 최신이므로 **덮지 말고 저장소에 받아 적는다.**
    //      안 그러면 바로 뒤따라 도는 populateTabData 가 옛 배열로 되돌려 버린다.
    //   ② 제품구분자를 **전환한** 경우. 이때 별칭은 아직 옛 모델을 가리키므로 ①처럼 굴면
    //      옛 모델 내용을 새 모델에 복사해 버린다. 그래서 전환 경로는 force=true 로 부른다.
    window.bsSyncAlias = function (force) {
        var td = _td(), st = _store(), u = window.bsActiveUnit();
        if (!force && Array.isArray(td.briefSpec) && td.briefSpec !== st[u]) {
            st[u] = td.briefSpec;            // ① 바깥에서 갈아 끼운 내용을 채택
            return td.briefSpec;
        }
        if (!Array.isArray(st[u])) st[u] = [];
        td.briefSpec = st[u];                // ②
        return td.briefSpec;
    };

    // 화면에 떠 있는 내용을 지금 제품구분자에 담아 둔다(전환·저장 직전에 부른다).
    window.bsCommitCurrent = function () {
        var tb = document.getElementById('briefspec-body');
        if (!tb) return;
        var rows = (typeof _readRowsFromTbody === 'function') ? _readRowsFromTbody('briefspec-body') : null;
        if (!rows) return;
        _store()[window.bsActiveUnit()] = rows;
        _td().briefSpec = rows;
    };

    // ── 🏷 제품구분자 전환 바 ──────────────────────────────────────────
    //   M.C Table(#mc-unit-bar)·BOM(#bom-unit-bar)과 **같은 모양·같은 동작**이다.
    //   새로 디자인하지 않는다 — 탭마다 다르게 생기면 같은 기능으로 안 보인다(사용자 지적).
    //   보라색 버튼 하나를 누를 때마다 다음 모델로 돌아가고, 모델이 없으면 바를 숨긴다.
    window.bsRenderUnitBar = function () {
        var bar = document.getElementById('bs-unit-bar');
        if (!bar) return;
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (!units.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        var cur = window.bsActiveUnit() || units[0];
        var esc = window.escapeHtml || function (v) { return String(v == null ? '' : v); };
        bar.style.display = 'flex';
        bar.innerHTML = '<button onclick="window.bsCycleUnit()" title="'
            + esc(_t('클릭할 때마다 다음 모델로 전환', 'Click to switch to the next model')) + '"'
            + ' style="padding:6px 10px; min-width:auto; border:1px solid #c9b8f0; border-radius:5px;'
            + ' cursor:pointer; font-size:12px; font-weight:bold; background:#ede9fb; color:#6741d9;">'
            + esc(cur) + '</button>';
    };

    window.bsCycleUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (units.length < 2) return;
        var i = units.indexOf(window.bsActiveUnit());
        if (window.mcSwitchUnit) window.mcSwitchUnit(units[(i + 1) % units.length]);
    };

    // ── 🔗 기존 함수에 끼워 넣기 ────────────────────────────────────────
    //   js/22g·22i를 직접 고치는 대신 **감싼다** — 이 파일만 빼면 예전 동작으로 돌아간다.
    //   (전역 스코프 공유 구조라 나중에 로드되는 이 파일이 덮어쓸 수 있다.)
    var _wrap = function (name, before, after) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__bsWrapped) return;
        var fn = function () {
            if (before) { try { before.apply(null, arguments); } catch (e) { console.warn('[bs ' + name + ' before]', e); } }
            var r = orig.apply(this, arguments);
            if (after) { try { after.apply(null, arguments); } catch (e) { console.warn('[bs ' + name + ' after]', e); } }
            return r;
        };
        fn.__bsWrapped = true;
        window[name] = fn;
    };

    var _switching = false;   // 제품구분자 전환 중? (아래 주석 참고)

    var _install = function () {
        // 제품구분자 전환 — M.C가 자기 표를 보관하듯, 우리도 전환 **전에** 담고 **후에** 갈아끼운다.
        // ⚠️ 원래 `mcSwitchUnit`은 **자기 안에서** populateTabData()를 부른다. 그 시점엔 이미
        //    mcActiveUnit이 새 모델인데 별칭은 아직 옛 모델을 가리키므로, 아래 populateTabData
        //    훅의 ①(바깥 변경 채택)이 돌면 **옛 모델 내용을 새 모델에 덮어쓴다.**
        //    (실측에서 MVD 내용이 TVD로 번졌다.) 전환 중에는 깃발을 세워 ②로만 돌게 한다.
        _wrap('mcSwitchUnit',
            function () { window.bsCommitCurrent(); _switching = true; },
            function () { _switching = false; window.bsSyncAlias(true); _bsRepaint(); });

        // 화면 → 데이터 수집. 원래 함수가 briefSpec에 통째로 넣으므로, 그 값을 제품구분자 칸에도 넣는다.
        _wrap('collectTabData', null, function () {
            var td = _td();
            if (Array.isArray(td.briefSpec)) _store()[window.bsActiveUnit()] = td.briefSpec;
        });

        // 데이터 → 화면. 그리기 **전에** 이전·별칭을 맞춰야 옛 파일도 바로 보인다.
        _wrap('populateTabData',
            function () { window.bsMigrateFromModelCols(); window.bsSyncAlias(_switching); },
            function () { window.bsRenderUnitBar(); });
    };

    var _bsRepaint = function () {
        if (window.populateTabData) { try { window.populateTabData(); } catch (e) { console.warn('[bs repaint]', e); } }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _install);
    else _install();
})();
