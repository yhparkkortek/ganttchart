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
    // 🏷 [2026-10-21 사용자 확정] Model A/B/C 라는 이름은 **없앤다** — 열 순서대로 MVD/TVD/TPR 이다.
    //    사람이 열 이름을 따로 바꿔 뒀으면(bsColLabels) 그 이름이 우선이고, 안 바꿨으면 이 기본값을 쓴다.
    var DEFAULT_LABEL = { modelA: 'MVD', modelB: 'TVD', modelC: 'TPR' };

    window.bsMigrateFromModelCols = function () {
        var td = _td();
        if (td.briefSpecByUnit) return false;              // 이미 이전됨
        var rows = td.briefSpec;
        if (!Array.isArray(rows) || !rows.length) return false;

        var labels = td.bsColLabels || {};
        var OLD_DEFAULT = { modelA: 'Model A', modelB: 'Model B', modelC: 'Model C' };
        var custom = function (k) {
            var v = String(labels[k] || '').trim();
            // 옛 기본값('Model A' 등)은 사람이 지은 이름이 아니다 — 새 기본값(MVD/TVD/TPR)으로 보낸다.
            if (!v || v === OLD_DEFAULT[k] || v === DEFAULT_LABEL[k]) return '';
            return v;
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

        // 세 열이 전부 비어 있으면 붙일 이름이 없다 — 지금 보고 있는 제품구분자 밑에 그대로 넣는다.
        if (!used.length) {
            byUnit[window.bsActiveUnit()] = mk('modelA');
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
        bar.innerHTML = '<button class="unit-cycle-btn" onclick="window.bsCycleUnit()" title="'
            + esc(_t('클릭할 때마다 다음 모델로 전환', 'Click to switch to the next model')) + '"'
            + ' style="padding:6px 10px; min-width:auto; border:1px solid #00707d; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold; background:#00707d; color:#fff;">'
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
            function () {
                window.bsMigrateFromModelCols();
                window.bsSyncAlias(_switching);
                window._bsEnsureExtraItems();
            },
            function () { window.bsRenderUnitBar(); });
    };

    var _bsRepaint = function () {
        if (window.populateTabData) { try { window.populateTabData(); } catch (e) { console.warn('[bs repaint]', e); } }
    };


    // ══════════════════════════════════════════════════════════════════
    // 📋 [2026-10-22 신규] Customer SPEC 표준 서식(TYPE/TYPE2)만 가져오기
    //
    //   왜: Customer SPEC [불러오기]의 AI 매핑은 mode:'fill' — **있는 항목의 빈칸만** 채운다.
    //   표준 서식이 없으면 AI에게 줄 항목 목록이 없어 그냥 실패한다(사용자 제보 2026-10-21).
    //   그 서식은 참조 엑셀(REFERENCE_SHEET_ID)에서 오는데, 새 프로젝트가 그 단계를 못 거치면
    //   영영 비어 있게 된다.
    //
    //   ⚠️ autoImportReferenceExcel()을 쓰면 안 된다 — 그건 handleFiles()로 **워크북 전체**를
    //   불러와서 Gantt·Summary·M.C까지 덮어쓴다. 이미 내용이 있는 프로젝트에 쓰면 사고다.
    //   그래서 여기서는 같은 파일을 받아 **Customer SPEC 시트 하나만** 읽는다.
    // ══════════════════════════════════════════════════════════════════

    /** 참조 엑셀에서 표준 서식 행만 뽑아온다 → [{type, sub}] (실패 시 null) */
    window._bsFetchTemplateRows = async function () {
        if (typeof XLSX === 'undefined') return null;

        // 📗 [2026-11-04] 참조 엑셀을 받는 일은 _refExcelBlob()(js/04c) 하나가 한다 —
        //    NAS 모드면 NAS 에서(Reference/Reference.xlsx), 드라이브 모드면 예전처럼 드라이브에서.
        //    예전엔 여기서 드라이브를 직접 불러, 저장소가 NAS 로 넘어간 뒤 **이 경로가 통째로
        //    조용히 실패**했다(Customer SPEC 표준 서식이 영영 비어 있게 된다).
        //    ⚠️ 여기서는 **실패해도 조용히 null** 이다 — 사람이 요청한 적 없는 자동 보완이라,
        //       못 채웠다고 창을 띄우면 방해만 된다. 대신 왜 비었는지 콘솔에 한 줄 남긴다.
        if (typeof window._refExcelBlob !== 'function') return null;
        var blob = null;
        try {
            blob = await window._refExcelBlob();
        } catch (e) {
            console.info('[Customer SPEC] 표준 서식 자동 채우기를 건너뜁니다 —', (e && e.message) || e);
            return null;
        }
        if (!blob) return null;

        var wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
        var name = wb.SheetNames.find(function (n) {
            var t = String(n).trim();
            // 시트명이 "Brief SPEC"이던 시절 파일도 계속 읽는다(_parseBriefSpecSheetFromWorkbook과 동일 기준)
            return t === 'Customer SPEC' || t.indexOf('Customer SPEC') !== -1
                || t === 'Brief SPEC' || t.indexOf('Brief SPEC') !== -1;
        });
        if (!name) return null;
        var json = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        var out = [];
        for (var i = 1; i < json.length; i++) {
            var r = json[i] || [];
            var type = String(r[1] || '').trim(), sub = String(r[2] || '').trim();
            if (!type && !sub) continue;        // 값 칸은 가져오지 않는다 — 서식만 필요하다
            out.push({ type: type, sub: sub });
        }
        if (!out.length) return null;
        // 📌 [2026-11-09] 참조 엑셀엔 아직 없지만 **문서가 요구하는** 항목을 보탠다.
        //    근거(실측): Sample Report·시제품 제작의뢰서엔 `FW Ver`·`EDID CHECK SUM` 칸이 있는데
        //    Customer SPEC 표준 28항목엔 **둘 다 없다**. 사용자 결정(2026-11-09):
        //    "펌웨어·EDID 는 없으니 만들어야 함 / 고객 SPEC 에 추가하면 될 것 같음".
        //    ⚠️ 팀 공용 **참조 엑셀(바이너리)은 건드리지 않는다** — 거기에 추가되면 이 목록에서
        //       빼면 되고, 그전까지는 둘 다 있어도 아래 중복 검사로 한 번만 들어간다.
        window._bsPlaceExtraItems(out);
        return out;
    };

    // 참조 엑셀에 없는 **보탬 항목** (데이터) — 문서가 쓰는 칸이다.
    //  📍 자리(데이터) — `before:[…]` 는 그 말로 **시작하는** 첫 행 **바로 앞**, `at:'top'` 은 표 맨 위.
    //     사용자 확정(2026-11-09): **Power estimation 바로 위**("Power 위로" · "26~27 번 사이").
    //     ⚠️⚠️ 자리를 **행 번호로 박지 않는다** — 프로젝트마다 행 수가 다르다. 사람이 말한 "26~27 번"
    //        은 그 프로젝트에서 Power 가 27번이라는 뜻이고, 기준은 **번호가 아니라 그 행**이다.
    //     ⚠️ 자리를 다시 옮기려면 이 **한 줄**만 고친다(옛 프로젝트도 다음에 열 때 따라온다).
    window.BS_EXTRA_ITEMS = window.BS_EXTRA_ITEMS || [
        { type: 'F/W Version', sub: '', before: ['Power estimation', 'Power'] },
        { type: 'EDID Check Sum', sub: '', before: ['Power estimation', 'Power'] }
    ];

    /**
     * 보탬 항목을 행 배열 `rows` 의 제자리에 놓는다 — 없으면 끼워 넣고, 있으면 **그 자리로 옮긴다**.
     * 반환: 자리가 바뀐 항목 수. **멱등** — 이미 제자리면 0.
     *
     * ⚠️ 옮길 때는 **행 객체 그대로** 옮긴다 — 값(`modelA`/`note`)이 같이 따라와야 한다.
     * ⚠️⚠️ 같은 자리를 가리키는 항목은 **한 덩어리로** 꺼냈다가 한꺼번에 넣는다.
     *    하나씩 옮기면 서로를 밀어내서 부를 때마다 순서가 뒤바뀐다(멱등이 깨진다).
     *    F/W·EDID 를 한 번 맨 위로 올렸다가 Power 위로 되돌리면서 실제로 겪은 일이다.
     * ⚠️ "앞에 있으면 그대로 둔다" 가 아니라 **제자리로 옮긴다** — 그래야 자리를 바꿨을 때
     *    이미 다른 데로 간 프로젝트도 다음에 열 때 따라온다.
     */
    window._bsPlaceExtraItems = function (rows) {
        if (!Array.isArray(rows)) return 0;
        var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
        var key = function (t, s) { return norm(t) + '\u0000' + norm(s); };
        // `before` 에 적힌 말로 시작하는 첫 행의 자리 (없으면 -1)
        var anchorOf = function (before) {
            var pats = before ? (Array.isArray(before) ? before : [before]) : [];
            for (var p = 0; p < pats.length; p++) {
                var pat = norm(pats[p]);
                if (!pat) continue;
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i] && norm(rows[i].type).indexOf(pat) === 0) return i;
                }
            }
            return -1;
        };
        // 같은 자리를 가리키는 항목끼리 묶는다(적어 둔 순서를 지킨다)
        var groups = [], gmap = {};
        (window.BS_EXTRA_ITEMS || []).forEach(function (x) {
            var gk = (x.at || '') + '\u0001' + [].concat(x.before || []).join('\u0002');
            if (!gmap[gk]) { gmap[gk] = { at: x.at, before: x.before, list: [] }; groups.push(gmap[gk]); }
            gmap[gk].list.push(x);
        });

        var changed = 0;
        groups.forEach(function (g) {
            var snapshot = rows.slice();                  // 진짜 바뀌었는지 보려고
            // ① 덩어리 항목을 꺼낸다 (없으면 빈 행을 만든다 — 값 칸은 비운다)
            var picked = g.list.map(function (x) {
                var k = key(x.type, x.sub);
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i] && key(rows[i].type, rows[i].sub) === k) return rows.splice(i, 1)[0];
                }
                return { type: x.type, sub: x.sub || '', modelA: '', note: '' };
            });
            // ② 자리를 찾는다 (꺼낸 **뒤**에 세야 자기 자신에 밀리지 않는다)
            var dest = (g.at === 'top') ? 0 : anchorOf(g.before);
            if (dest < 0) dest = rows.length;             // 기준 행이 없으면 맨 뒤
            // ③ 한꺼번에 넣는다
            picked.forEach(function (r, i) { rows.splice(dest + i, 0, r); });
            for (var i = 0; i < rows.length; i++) {
                if (rows[i] !== snapshot[i]) { changed += g.list.length; break; }
            }
        });
        return changed;
    };

    /**
     * 보탬 항목을 지금 Customer SPEC 의 **제자리**(`before`)에 놓는다.
     *
     * ⚠️⚠️ 왜 따로 필요한가 (2026-11-09 사용자 신고: "FW EDID 작성하는 곳은 어디야?")
     *   `_bsEnsureStandardTemplate` 은 **Customer SPEC 이 비어 있을 때만** 돈다
     *   (`hasTpl && !force` 에서 바로 return). 그래서 이미 쓰던 프로젝트에는 보탬 항목이
     *   **영영 안 들어가고**, 문서 페이지는 "항목이 없음" 만 띄운다 — 적을 자리가 없다.
     *   이 함수는 그 조건과 **무관하게** 돌아 빠진 것만 끼워 넣는다.
     * ⚠️ 다른 행은 건드리지 않는다(값 보존). 이미 제자리면 아무 일도 안 한다(멱등).
     * ⚠️ 보탬 항목이 `before` 보다 **뒤**에 있으면 앞으로 옮긴다 — 예전엔 맨 뒤에 붙여서
     *    Power 아래로 떨어졌다(사용자 지시로 Power 위로 올린다, 2026-11-09).
     */
    window._bsEnsureExtraItems = function () {
        var td = _td();
        if (!Array.isArray(td.briefSpec)) return 0;
        var changed = window._bsPlaceExtraItems(td.briefSpec);
        if (changed && window.bsSyncAlias) { try { window.bsSyncAlias(); } catch (e) { /* 별칭 실패가 흐름을 막지 않게 */ } }
        return changed;
    };

    /**
     * 지금 Customer SPEC에 표준 서식이 없으면 참조 엑셀에서 가져와 채운다.
     * 기존 내용은 **버리지 않는다** — 항목이 일치하면 값을 옮겨 담고, 짝이 없는 행은 뒤에 남긴다.
     * 반환: { ok, added, reason }
     */
    window._bsEnsureStandardTemplate = async function (force) {
        var td = _td();
        var cur = Array.isArray(td.briefSpec) ? td.briefSpec : [];
        var hasTpl = cur.some(function (r) {
            return r && (String(r.type || '').trim() || String(r.sub || '').trim());
        });
        if (hasTpl && !force) return { ok: true, added: 0, reason: 'already' };

        var tpl = await window._bsFetchTemplateRows();
        if (!tpl) return { ok: false, added: 0, reason: 'fetch_failed' };

        // 항목(type+sub)으로 기존 값을 물려준다 — 대소문자/공백 차이는 무시
        var key = function (r) {
            return (String(r.type || '').trim() + '\u0000' + String(r.sub || '').trim()).toUpperCase();
        };
        var byKey = {}, orphans = [];
        cur.forEach(function (r) {
            if (!r) return;
            var k = key(r);
            if (k === '\u0000') { // 항목 없이 값만 있던 행 — 버리지 않고 뒤에 남긴다
                if (String(r.modelA || '').trim() || String(r.note || '').trim()) orphans.push(r);
                return;
            }
            byKey[k] = r;
        });
        var merged = tpl.map(function (t) {
            var old = byKey[key(t)];
            return {
                type: t.type, sub: t.sub,
                modelA: (old && old.modelA) || '',
                note:   (old && old.note)   || ''
            };
        });
        // 표준 서식에 없는 기존 항목도 살려 둔다(그 프로젝트에서만 쓰는 사양일 수 있다)
        Object.keys(byKey).forEach(function (k) {
            if (merged.some(function (m) { return key(m) === k; })) return;
            merged.push(byKey[k]);
        });
        merged = merged.concat(orphans);

        td.briefSpec = merged;
        if (window.bsSyncAlias) window.bsSyncAlias();   // 제품구분자 저장소(briefSpecByUnit)와 다시 묶는다
        if (window.populateTabData) window.populateTabData();
        if (window._markDirty) window._markDirty();
        return { ok: true, added: tpl.length, reason: hasTpl ? 'refreshed' : 'filled' };
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _install);
    else _install();
})();
