// ═══════════════════════════════════════════════════════════════════
// 🧱 [2026-10-15 신규] BOM 탭 — Customer SPEC과 M.C Table 사이.
//    SAP ZPP033(단일)/ZPP038(복수) "BOM 전개"를 조회해 모델(제품구분자)별로 보관한다.
//
//  설계 근거(실측 2026-10-15, 자재 502572 / 플랜트 1000):
//   · `/sap-bom`은 이미 있던 엔드포인트 — 새로 만들지 않고 그대로 쓴다(sap_bridge_32.fetch_bom).
//   · 결과는 `source:'grid'`일 때 **탭 구분 텍스트 표**로 온다(메타헤더 → 빈 줄 → 헤더행 → 데이터행).
//     컬럼: STUFE IDNRK OJTXP MMSTA MENGE MMEIN WGBEZ60 MTSTB (레이아웃 /STD_MC 기준)
//   · STUFE 포맷이 `[ 1     ]` / `[   2   ]` — **대괄호 안 숫자 위치가 레벨**이라 숫자만 뽑으면 된다.
//   · 다단계(explosion=multi)는 정상 동작 확인: single 68행 → multi 239행(레벨2가 170행).
//     깊이 우선 순서라 `[1]` 뒤에 붙는 `[2]`들이 그 자식 — 접기/펴기로 재구성 가능.
//   · STUFE가 빈 행이 두 종류 섞여 온다: **맨 앞 1행 = 모체 자재 자신**, **맨 끝 몇 행 = 단위별 합계**.
//     둘 다 일반 구성품이 아니므로 분리해서 다룬다.
//   · `_sap_dump_grid`는 500행 상한이라 초과 시 `... (총 N행 중 500행만 표시)` 한 줄이 붙는다 →
//     파싱에서 걸러내고 사용자에게 "잘렸음"을 공개한다(조용히 삼키지 말 것 — CLAUDE.md).
//   · 간헐적으로 `source:'fields'`(선택화면을 읽음)가 나온다 — 고정 sleep 기반 네비게이션의 한계.
//     그래서 grid가 아니면 1회 자동 재시도한다.
//
//  컬럼 라벨은 `window._SAP_FIELD_LABEL_MAP`(js/04h), 순서는 `window.SAP_RESULT_LAYOUT.bom`(js/32)
//  — 둘 다 데이터라 레이아웃이 바뀌어도 이 파일은 손대지 않는다(CLAUDE.md "규칙은 데이터로").
//
//  모델(제품구분자)은 M.C Table과 **같은 체계**를 그대로 쓴다(getMcUnits/mcActiveUnit/mcSwitchUnit)
//  — BOM 전용 모델 목록을 따로 만들지 않는다. 저장은 tabData.bomByUnit[unit].
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    var _t = function (ko, en) { return window._currentLang === 'en' ? en : ko; };
    var _esc = function (v) { return window.escapeHtml ? window.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v); };

    // 🧱 표 컬럼 정의(데이터) — 순서/헤더/폭을 여기서만 고친다.
    //    ZPP033이 주는 컬럼: IDNRK OJTXP MMSTA MENGE MMEIN WGBEZ60 (MTSTB는 MMSTA와 중복이라 제외)
    //    ZMM009 보강으로 붙는 컬럼: ZTEXT(자재내역2) STPRS1·PEINH1(→단가) MFRPN(제조사) FERTH(담당자)
    //    `_UNITPRICE`는 STPRS1÷PEINH1로 계산하는 가상 컬럼.
    //  폭은 "글자수가 고정인 열"(구성부품 6자리·담당자·수량·단위·상태)을 최대한 좁혀서,
    //  40자가 반드시 다 보여야 하는 구성부품내역(310px)과 맨 끝 비고가 같이 들어가게 맞췄다.
    //  비고는 폭을 지정하지 않아 남는 공간을 그대로 가져간다(가로 스크롤 없이 항상 보이게).
    var BOM_COLUMNS = [
        { key: 'IDNRK',      ko: '구성부품',     en: 'Component',     w: '60px',  mono: true },
        { key: 'OJTXP',      ko: '구성부품내역', en: 'Description',   w: '220px', nowrap: true },
        { key: 'ZTEXT',      ko: '자재내역2',    en: 'Description 2', w: '100px', nowrap: true },
        { key: '_LOC',       ko: 'Loc.',         en: 'Loc.',          w: '90px',  loc: true },
        { key: 'MENGE',      ko: '수량',         en: 'Qty',           w: '48px',  align: 'right' },
        { key: 'MMEIN',      ko: '단위',         en: 'Unit',          w: '36px',  align: 'center' },
        { key: '_UNITPRICE', ko: '단가(KRW)',    en: 'Unit Price',    w: '74px',  align: 'right' },
        { key: 'MMSTA',      ko: '상태',         en: 'Status',        w: '40px',  align: 'center' },
        { key: 'WGBEZ60',    ko: 'Group2',       en: 'Group2',        w: '118px', nowrap: true },
        { key: 'MFRPN',      ko: '제조사',       en: 'Manufacturer',  w: '92px',  nowrap: true },
        { key: 'FERTH',      ko: '담당자',       en: 'Person',        w: '72px',  nowrap: true }
    ];

    var _matKey = function (v) { return String(v || '').trim().replace(/^0+/, ''); };

    // 단가 = 표준가격 ÷ 가격단위 (ZMM009 패턴 조회 표와 같은 규칙)
    var _unitPrice = function (stprs, peinh) {
        var s = String(stprs == null ? '' : stprs).trim();
        if (!s) return '';
        var p = parseFloat(s.replace(/,/g, ''));
        if (!isFinite(p)) return '';
        var u = parseInt(peinh || '1', 10) || 1;
        var val = p / u;
        return val % 1 === 0 ? val.toLocaleString('ko-KR') : val.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    };

    // 모델 키 — 제품구분자를 안 쓰는 프로젝트는 빈 문자열('') 하나로 동작한다(M.C Table과 동일 규칙)
    window._bomActiveUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (!units.length) return '';
        return window.mcActiveUnit || units[0];
    };

    window._bomStore = function (unit) {
        window.tabData = window.tabData || {};
        window.tabData.bomByUnit = window.tabData.bomByUnit || {};
        var k = unit === undefined ? window._bomActiveUnit() : unit;
        return window.tabData.bomByUnit[k] || null;
    };

    // 이 모델(제품구분자)에 대응하는 Summary 모델 카드의 KTK PN(=SAP 자재번호)을 기본 자재번호로 제안.
    // ⚠️ [2026-10-15] tabData.projectModels는 collectTabData() 시점(저장할 때)에만 갱신된다 —
    //    Summary에서 PN을 고치고 바로 BOM 탭으로 오면 저장 전이라 옛 값이 잡혔다.
    //    그래서 화면에 모델 카드가 있으면 **지금 입력돼 있는 값**을 먼저 읽는다(숨은 탭이어도 DOM엔 있음).
    var _ktkToMatnr = function (raw) {
        raw = String(raw || '').trim();
        var us = raw.indexOf('_');            // "502574_MVD>KTS320DPS01" → 앞부분이 자재번호
        return us === -1 ? raw : raw.slice(0, us);
    };
    window._bomDefaultMaterial = function (unit) {
        var cards = document.querySelectorAll('.sum-model-card');
        var card = null;
        for (var i = 0; i < cards.length; i++) {
            if ((cards[i].dataset.unitId || '') === (unit || '')) { card = cards[i]; break; }
        }
        if (!card && cards.length) card = cards[0];
        if (card) {
            var el = card.querySelector('[data-model-field="KTK"]');
            if (el && el.value.trim()) return _ktkToMatnr(el.value);
        }
        var models = (window.tabData && window.tabData.projectModels) || [];
        var m = models.find(function (x) { return (x.unitId || '') === (unit || ''); }) || models[0];
        return (m && m.KTKPN ? String(m.KTKPN).trim() : '');
    };

    // 사람이 자재번호 칸을 직접 고쳤는지(= Summary 기본값을 덮어썼는지) 모델별로 기억한다.
    // 런타임 전용 — 저장하지 않는다(프로젝트를 다시 열면 again Summary 기준으로 시작).
    window._bomManualMaterial = window._bomManualMaterial || {};
    window.bomMarkManualMaterial = function () {
        window._bomManualMaterial[window._bomActiveUnit()] = true;
    };

    // ─── SAP 응답(탭 구분 텍스트) 파싱 ─────────────────────────────────
    // 반환: { cols, parent, rows, totals, truncated, totalRows }  (표가 아니면 null)
    window._bomParseSapText = function (text) {
        var t = String(text || '').replace(/\r/g, '').trim();
        if (!t) return null;
        // 메타헤더(탭 없는 첫 덩어리) 분리 — _ganttQaFormatSapRecord와 같은 규칙
        var body = t, sp = t.indexOf('\n\n');
        if (sp !== -1 && t.slice(0, sp).indexOf('\t') === -1) body = t.slice(sp + 2);

        var truncated = false, totalRows = 0;
        var lines = body.split('\n').filter(function (l) {
            var m = l.match(/총\s*([0-9]+)\s*행\s*중\s*([0-9]+)\s*행만\s*표시/);
            if (m) { truncated = true; totalRows = Number(m[1]) || 0; return false; }
            return l.trim().length > 0;
        });
        if (lines.length < 2 || lines[0].indexOf('\t') === -1) return null;

        var cols = lines[0].split('\t').map(function (c) { return c.trim(); });
        var iStufe = cols.indexOf('STUFE');
        var raw = lines.slice(1).map(function (l) {
            var cells = l.split('\t');
            var o = {};
            cols.forEach(function (c, i) { o[c] = (cells[i] || '').trim(); });
            return o;
        });

        var parent = null, rows = [], totals = [];
        var firstDataLevel = 0, hierarchyOk = true, prevLevel = 0;
        raw.forEach(function (o) {
            var stufe = iStufe === -1 ? '' : (o.STUFE || '');
            var lv = (stufe.match(/(\d+)/) || [])[1];
            if (lv) {
                o._level = Number(lv);
                // 계층 성립 여부 검증 — ALV에 정렬이 걸려 있으면 순서가 섞여 모자 관계를 못 쓴다.
                // 정상(깊이 우선)이면 ① 첫 데이터가 레벨1, ② 레벨이 한 번에 2 이상 깊어지지 않는다.
                if (!firstDataLevel) { firstDataLevel = o._level; if (o._level !== 1) hierarchyOk = false; }
                else if (o._level > prevLevel + 1) hierarchyOk = false;
                prevLevel = o._level;
                rows.push(o);
                return;
            }
            // 레벨 없는 행: 구성품번호가 있으면 모체 자재(맨 앞 1행), 없으면 단위별 합계(맨 끝)
            if (o.IDNRK) { if (!parent) parent = o; }
            else if (o.MENGE || o.MMEIN) totals.push(o);
        });
        return { cols: cols, parent: parent, rows: rows, totals: totals, truncated: truncated,
                 totalRows: totalRows, hierarchyOk: hierarchyOk };
    };

    // ─── ZMM009 보강 ───────────────────────────────────────────────────
    // ZPP033 BOM엔 자재내역2·단가·제조사·담당자가 없다. 구성부품 번호를 모아
    // `/sap-material-rows`(ZMM009 복수선택 조회, 포크 세션 2026-10-15 신규)로 한 번에 받아 합친다.
    // 한 번에 200건까지라 나눠서 호출하고, 실패해도 BOM 자체는 그대로 보여준다(보강만 생략).
    window._bomEnrichFromZmm009 = async function (rows, onProgress) {
        var codes = [];
        var seen = {};
        rows.forEach(function (r) {
            var k = _matKey(r.IDNRK);
            if (k && !seen[k]) { seen[k] = 1; codes.push(String(r.IDNRK).trim()); }
        });
        if (!codes.length) return { ok: true, matched: 0, total: 0 };

        var CHUNK = 200;
        var byMat = {}, failed = 0;
        for (var i = 0; i < codes.length; i += CHUNK) {
            var part = codes.slice(i, i + CHUNK);
            if (onProgress) onProgress(Math.min(i + part.length, codes.length), codes.length);
            try {
                var res = await fetch('http://127.0.0.1:5000/sap-material-rows?materials=' + encodeURIComponent(part.join(',')));
                var d = await res.json();
                if (d && d.ok && d.materials) {
                    d.materials.forEach(function (m) { if (m && m.MATNR) byMat[_matKey(m.MATNR)] = m; });
                } else { failed++; }
            } catch (e) { failed++; }
        }

        var matched = 0;
        rows.forEach(function (r) {
            var m = byMat[_matKey(r.IDNRK)];
            if (!m) return;
            matched++;
            r.ZTEXT = m.ZTEXT || '';
            r.STPRS1 = m.STPRS1 || '';
            r.PEINH1 = m.PEINH1 || '';
            r.MFRPN = m.MFRPN || '';
            r.FERTH = m.FERTH || '';
        });
        return { ok: failed === 0, matched: matched, total: codes.length, failedChunks: failed };
    };

    // ─── SAP 조회 ──────────────────────────────────────────────────────
    window.bomFetchFromSap = async function () {
        var unit = window._bomActiveUnit();
        var matEl = document.getElementById('bom-material');
        var material = (matEl ? matEl.value : '').trim();
        if (!material) {
            if (window.showToast) window.showToast(_t('자재번호를 입력해주세요.', 'Enter a material number.'), 'warning');
            if (matEl) matEl.focus();
            return;
        }
        var explosion = (document.getElementById('bom-explosion') || {}).value || 'multi';
        var layout = (document.getElementById('bom-layout') || {}).value || '';
        var btn = document.getElementById('bom-fetch-btn');
        var setBusy = function (on) {
            if (!btn) return;
            btn.disabled = on;
            btn.textContent = on ? _t('⏳ 조회 중…', '⏳ Loading…') : _t('🔄 SAP 조회', '🔄 Fetch from SAP');
        };
        // 백엔드 주소는 앱 전체가 로컬 고정(127.0.0.1:5000)을 그대로 쓴다 — js/04h의 다른 /sap-* 호출과 동일
        var url = 'http://127.0.0.1:5000/sap-bom?material=' + encodeURIComponent(material)
            + '&plant=1000&explosion=' + encodeURIComponent(explosion)
            + (layout ? '&layout=' + encodeURIComponent(layout) : '');

        setBusy(true);
        window._bomSetStatus(_t('SAP에서 BOM을 전개하는 중입니다…', 'Exploding BOM in SAP…'), 'busy');
        try {
            var data = null, parsed = null, attempt = 0;
            // 간헐적으로 결과화면 대신 선택화면(source:'fields')을 읽어오므로 1회 재시도한다
            while (attempt < 2) {
                attempt++;
                var res = await fetch(url);
                data = await res.json();
                if (!data || !data.ok) throw new Error((data && data.error) || _t('조회 실패', 'Lookup failed'));
                if (data.source === 'grid') { parsed = window._bomParseSapText(data.text); if (parsed) break; }
                if (attempt < 2) window._bomSetStatus(_t('결과 화면을 못 읽어 재시도합니다…', 'Could not read result screen — retrying…'), 'busy');
            }
            if (!parsed) {
                throw new Error(_t('SAP가 BOM 결과 표 대신 다른 화면을 돌려줬습니다(source: ' + (data && data.source) + '). 자재번호를 확인하거나 잠시 뒤 다시 시도해주세요.',
                    'SAP returned a non-table screen (source: ' + (data && data.source) + '). Check the material number or retry.'));
            }

            // 자재내역2·단가·제조사·담당자는 BOM 화면에 없으므로 ZMM009로 보강한다(실패해도 BOM은 유지)
            window._bomSetStatus(_t('구성품 정보를 ZMM009로 보강하는 중입니다…', 'Enriching components via ZMM009…'), 'busy');
            var enrich = await window._bomEnrichFromZmm009(parsed.rows, function (done, total) {
                window._bomSetStatus(_t('구성품 정보 보강 중… ' + done + '/' + total, 'Enriching components… ' + done + '/' + total), 'busy');
            });

            // 다단계는 기본 접힘 — 레벨1(모체 직속)만 먼저 보이고, 필요한 가지만 펼쳐 본다.
            var initCollapsed = {};
            if (explosion === 'multi') {
                if (parsed.hierarchyOk) {
                    parsed.rows.forEach(function (r, i) {
                        var n = parsed.rows[i + 1];
                        if (n && n._level > r._level) initCollapsed[i] = true;
                    });
                } else {
                    parsed.rows.forEach(function (r) { if (r._level > 1) initCollapsed[r._level] = true; });
                }
            }

            var prev = window._bomStore(unit) || {};
            window.tabData.bomByUnit[unit] = {
                enrich: enrich,
                _collapsed: initCollapsed,
                material: material, plant: '1000', explosion: explosion,
                layout: layout || (data.layoutRequested || ''), layoutApplied: data.layoutApplied,
                tcode: data.tcode || '', fetchedAt: new Date().toISOString(),
                cols: parsed.cols, parent: parsed.parent, rows: parsed.rows, totals: parsed.totals,
                truncated: parsed.truncated, totalRows: parsed.totalRows,
                notes: prev.notes || {},      // 사람이 쓴 비고는 재조회해도 보존(구성부품번호 기준)
                locations: prev.locations || {} // Location 정보도 재조회 후 보존
            };
            window._bomSetStatus('', ''); // 직전 실패 메시지가 성공 후에도 남지 않도록 비운다
            window.bomRender();
            if (window.showToast) window.showToast(_t('BOM ' + parsed.rows.length + '건을 가져왔습니다.', 'Fetched ' + parsed.rows.length + ' BOM rows.'), 'success');
        } catch (e) {
            window._bomSetStatus('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        } finally {
            setBusy(false);
        }
    };

    window._bomSetStatus = function (msg, kind) {
        var el = document.getElementById('bom-status');
        if (!el) return;
        var color = kind === 'error' ? '#b1432f' : (kind === 'busy' ? '#00707d' : '#666');
        el.style.color = color;
        el.innerHTML = msg ? _esc(msg) : '';
    };

    // ─── 비고(메모) — 구성부품번호 기준으로 보관해서 재조회해도 유지 ──────
    window.bomSetNote = function (el) {
        var unit = window._bomActiveUnit();
        var st = window._bomStore(unit);
        el.title = el.value;   // 마우스를 올리면 전체 내용이 말풍선으로 보이게
        if (!st) return;
        st.notes = st.notes || {};
        if (el.value && el.value.trim()) st.notes[el.dataset.bomNote] = el.value;
        else delete st.notes[el.dataset.bomNote];
    };

    window.bomSetLocation = function (el) {
        var unit = window._bomActiveUnit();
        var st = window._bomStore(unit);
        el.title = el.value;
        if (!st) return;
        st.locations = st.locations || {};
        if (el.value && el.value.trim()) st.locations[el.dataset.bomLoc] = el.value;
        else delete st.locations[el.dataset.bomLoc];
    };

    // 비고/Location 칸은 좁아서 긴 메모를 쓰기 어렵다 — 쓰는 동안만 넓은 입력창으로 띄우고(절대배치라
    // 표 레이아웃은 그대로), 다 쓰고 포커스를 떠나면 원래 너비로 되돌린다.
    window._bomNoteFocus = function (el) {
        el.style.position = 'absolute';
        el.style.right = '2px';
        el.style.top = '1px';
        el.style.width = '340px';
        el.style.zIndex = '20';
        el.style.background = '#fff';
        el.style.border = '1px solid #52a5af';
        el.style.borderRadius = '4px';
        el.style.padding = '2px 5px';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,.18)';
    };
    window._bomNoteBlur = function (el) {
        el.style.position = '';
        el.style.right = '';
        el.style.top = '';
        el.style.width = '100%';
        el.style.zIndex = '';
        el.style.background = 'transparent';
        el.style.border = 'none';
        el.style.borderRadius = '';
        el.style.padding = '';
        el.style.boxShadow = '';
    };

    // ─── 행 클릭 → AI 문답 칩 버튼("무엇을 조회할까요?") ─────────────────
    // ZMM009 조회 표(js/33 runPatternLookup)와 완전히 같은 흐름을 쓴다 — 거기선 AI 문답 창이
    // 이미 열려 있는 상태라 `_sapSelectMaterial`만 부르면 됐지만, BOM 탭은 창이 닫혀 있을 수
    // 있으므로 먼저 모달을 연다. `_sapSelectMaterial`이 자재유형(1원자재/3반제품/5완제품)에 따라
    // BOM·사용처·재고·가격·승인원·공급업체·구매정보·담기 버튼을 알아서 걸러준다.
    window.bomSelectComponent = function (matnr) {
        matnr = String(matnr || '').trim();
        if (!matnr) return;
        if (window.openGanttQaModal) window.openGanttQaModal();
        var go = function () {
            if (window._sapSelectMaterial) window._sapSelectMaterial(matnr);
            else if (window.showToast) window.showToast(_t('AI 문답을 불러오지 못했습니다.', 'Could not load AI Q&A.'), 'warning');
        };
        // 모달을 방금 처음 만든 경우 입력칸이 아직 없을 수 있어 한 틱 기다렸다 호출
        if (document.getElementById('gantt-qa-input')) go();
        else setTimeout(go, 60);
    };

    // ─── 레벨 블록 접기/펴기 ────────────────────────────────────────────
    // ⚠️⚠️ [2026-10-15 버그수정] 예전엔 "결과가 깊이 우선 순서라 레벨1 바로 뒤의 레벨2가 그 자식"
    //   이라고 보고 부모-자식 묶음을 그렸는데 **완전히 틀렸다**. ZPP033이 돌려주는 행은
    //   구성부품내역(OJTXP) 역순으로 **정렬된 상태**로 온다 — 실측(자재 502572, 다단계):
    //     idx0~4 = 레벨2, idx5 = 모체, idx6 = 레벨2, idx7~ = 레벨1 …
    //   레이아웃을 바꿔도(/STD_MC·/HC·미적용) 순서가 같아 정렬은 프로그램/사용자 ALV 기본값에
    //   박혀 있고, 그리드 컬럼에도 부모를 가리키는 필드가 없다(STUFE POSNR MMSTA MTSTB MATKL
    //   IDNRK OJTXP MENGE MENGE_Y LABST MMEIN ALPGR ALPRF EWAHR BSTMI EKGRP EKNAM SORTF AENNR PLIFZ).
    //   → 이 출력만으로는 모자 관계를 복원할 수 없다. 틀린 묶음을 보여주느니 **레벨 블록**으로만
    //   묶고, 모자 관계를 알 수 없다는 사실을 화면에 명시한다(조용히 틀리게 두지 말 것).
    //   진짜 계층이 필요하면 단일 레벨 조회를 자재마다 재귀 호출해야 한다(행 클릭 → BOM 조회).
    // 계층이 정상일 때 — 그 행의 하위 가지만 접었다 편다
    window.bomToggleBranch = function (rowIdx) {
        var st = window._bomStore();
        if (!st) return;
        st._collapsed = st._collapsed || {};
        st._collapsed[rowIdx] = !st._collapsed[rowIdx];
        window.bomRender();
    };

    window.bomToggleLevel = function (level) {
        var st = window._bomStore();
        if (!st) return;
        st._collapsed = st._collapsed || {};
        st._collapsed[level] = !st._collapsed[level];
        window.bomRender();
    };

    // 버튼 하나로 "레벨2 이하 모두 접기 ↔ 모두 펼치기"
    window.bomToggleAll = function (collapse) {
        var st = window._bomStore();
        if (!st || !st.rows) return;
        if (collapse === undefined) {
            collapse = !Object.keys(st._collapsed || {}).some(function (k) { return st._collapsed[k]; });
        }
        st._collapsed = {};
        if (collapse) {
            if (st.hierarchyOk !== false) {
                // 계층 모드: 자식을 가진 행(= 그 다음 행이 더 깊은 레벨)을 모두 접는다
                st.rows.forEach(function (r, i) {
                    var next = st.rows[i + 1];
                    if (next && next._level > r._level) st._collapsed[i] = true;
                });
            } else {
                st.rows.forEach(function (r) { if (r._level > 1) st._collapsed[r._level] = true; });
            }
        }
        window.bomRender();
    };

    // 토글 버튼의 글자/툴팁을 현재 상태에 맞춘다(렌더 끝에서 호출)
    window._bomSyncToggleBtn = function () {
        var btn = document.getElementById('bom-toggle-btn');
        if (!btn) return;
        var st = window._bomStore();
        var anyCollapsed = !!(st && st._collapsed && Object.keys(st._collapsed).some(function (k) { return st._collapsed[k]; }));
        btn.textContent = anyCollapsed ? _t('▾ 펼치기', '▾ Expand') : _t('▸ 접기', '▸ Collapse');
        btn.title = anyCollapsed ? _t('하위 레벨 모두 펼치기', 'Expand all levels') : _t('하위 레벨 모두 접기', 'Collapse lower levels');
    };

    // ─── 엑셀 출력 ─────────────────────────────────────────────────────
    // ZMM009 조회 표(js/33 _sapExportMatRows)와 같은 방식 — 화면에 그린 행을 그대로 쓰므로
    // SAP 재조회가 없고, 저장 위치도 같은 C:\SAP_DMS\SAP조회.
    window.bomExportExcel = async function () {
        var st = window._bomStore();
        if (!st || !st.rows || !st.rows.length) {
            if (window.showToast) window.showToast(_t('내보낼 BOM이 없습니다 — 먼저 조회해주세요.', 'No BOM to export — run a lookup first.'), 'warning');
            return;
        }
        try {
            if (typeof XLSX === 'undefined') throw new Error(_t('엑셀 라이브러리를 불러오지 못했습니다.', 'The Excel library is not loaded.'));
            var en = window._currentLang === 'en';
            var head = [_t('레벨', 'Level')].concat(BOM_COLUMNS.map(function (c) { return en ? c.en : c.ko; }));
            head.splice(head.length - 0, 0); // (순서 유지용 noop)
            head.push(_t('비고', 'Note'));
            var aoa = [head];
            if (st.parent) {
                aoa.push([_t('모체', 'Top')].concat(BOM_COLUMNS.map(function (c) {
                    if (c.loc) return '';
                    return c.key === '_UNITPRICE' ? _unitPrice(st.parent.STPRS1, st.parent.PEINH1) : (st.parent[c.key] || '');
                })).concat(['']));
            }
            // 화면과 같은 순서로 — 레벨 블록끼리 묶고(안정 정렬) 레벨 안에서는 SAP 순서 유지
            var ordered = st.rows.map(function (r, i) { return { r: r, i: i }; })
                .sort(function (a, b) { return (a.r._level - b.r._level) || (a.i - b.i); })
                .map(function (x) { return x.r; });
            ordered.forEach(function (r) {
                aoa.push([r._level].concat(BOM_COLUMNS.map(function (c) {
                    if (c.key === '_UNITPRICE') {
                        var p = parseFloat(String(r.STPRS1 || '').replace(/,/g, ''));
                        var u = parseInt(r.PEINH1 || '1', 10) || 1;
                        return isNaN(p) ? '' : Math.round(p / u * 100) / 100;   // 숫자로 넣어 엑셀에서 계산 가능하게
                    }
                    if (c.key === 'MENGE') {
                        var q = parseFloat(String(r.MENGE || '').replace(/,/g, ''));
                        return isNaN(q) ? (r.MENGE || '') : q;
                    }
                    if (c.loc) return (st.locations && st.locations[r.IDNRK]) || '';
                    return r[c.key] || '';
                })).concat([(st.notes && st.notes[r.IDNRK]) || '']));
            });
            (st.totals || []).forEach(function (o) {
                aoa.push(['Σ'].concat(BOM_COLUMNS.map(function (c) { return (c.key === '_UNITPRICE' || c.loc) ? '' : (o[c.key] || ''); })).concat(['']));
            });

            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 36 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 6 },
                           { wch: 12 }, { wch: 7 }, { wch: 18 }, { wch: 16 }, { wch: 13 }, { wch: 24 }];
            XLSX.utils.book_append_sheet(wb, ws, 'BOM');
            if (typeof applyExcelStyles === 'function') applyExcelStyles(wb);
            var fileName = 'SAP_BOM_' + (st.material || '') + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
            var res = await fetch('http://127.0.0.1:5000/sap-save-export', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: fileName, dataBase64: XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) })
            });
            var d = await res.json();
            if (window.showToast) {
                window.showToast(d.ok ? ('📊 ' + (d.message || _t('BOM을 엑셀로 저장했습니다.', 'Saved the BOM to Excel.')))
                                      : ('⚠️ ' + (d.error || _t('엑셀 저장 실패', 'Excel save failed'))), d.ok ? 'success' : 'error');
            }
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        }
    };

    // ─── 렌더 ──────────────────────────────────────────────────────────
    window.bomRender = function () {
        var tbody = document.getElementById('bom-body');
        var thead = document.getElementById('bom-thead');
        if (!tbody || !thead) return;
        var en = window._currentLang === 'en';
        var unit = window._bomActiveUnit();
        var st = window._bomStore(unit);

        // 모델 전환 바 + 조회 조건 칸 동기화
        window.bomRenderUnitBar();
        var matEl = document.getElementById('bom-material');
        // 자재번호 칸은 Summary의 KTK PN을 따라간다 — 사람이 직접 고친 모델만 그 값을 유지한다.
        // 예전엔 st.material(마지막 조회값)이 무조건 이겨서, Summary에서 PN을 바꿔도 BOM은 계속 옛 값이었다.
        var defMat = window._bomDefaultMaterial(unit);
        if (matEl && document.activeElement !== matEl) {
            if (window._bomManualMaterial[unit]) {
                // 직접 고친 모델은 그 값을 그대로 둔다(비어 있을 때만 채워줌)
                if (!matEl.value) matEl.value = (st && st.material) || defMat || '';
            } else {
                matEl.value = defMat || (st && st.material) || '';
            }
        }
        var expEl = document.getElementById('bom-explosion');
        if (expEl && st && st.explosion) expEl.value = st.explosion;
        var layEl = document.getElementById('bom-layout');
        if (layEl && st && st.layout) layEl.value = st.layout;

        // 컴팩트 규격 — 한 화면에 더 많은 행이 들어가도록 패딩/글자를 줄인다
        // 💡 [2026-10-15] 비고 <input>이 있는 행은 24px, 없는 모체·Σ 행은 21px로 높이가 달랐다.
        //    모든 칸에 box-sizing:border-box + height를 줘서(표에서 height는 최소높이로 동작) 통일.
        var ROW_H = '24px';
        // 💡 [2026-10-15] 제브라 색 쌍을 **레벨별로** 따로 둔다. 레벨1을 단색 틴트로 칠했더니
        //    기본 접힘 상태나 단일 레벨 조회처럼 레벨1만 모이면 전부 같은 색이라 제브라가
        //    무용지물이었다(사용자 지적). 레벨1은 청록 계열 두 톤, 레벨2 이하는 흰색 계열 두 톤으로
        //    교대 — 레벨 구분(색 계열)과 행 구분(명암)을 동시에 얻는다.
        //    색은 styles.css의 .bom-row-* 클래스에 있고, 팔레트 변경 시 _cpApplyLive가 덮어쓴다.
        var zebraClass = function (level, pos) {
            return level === 1 ? (pos % 2 ? 'bom-row-l1-alt' : 'bom-row-l1')
                               : (pos % 2 ? 'bom-row-sub-alt' : 'bom-row-sub');
        };
        var TD = 'padding:2px 5px; border:1px solid #cfe3e5; font-size:11.5px; box-sizing:border-box; height:' + ROW_H + ';';
        var thS = 'padding:3px 5px; border:1px solid #cfe3e5; text-align:center; white-space:nowrap; font-size:11.5px;';
        var cellStyle = function (c, extra) {
            return TD
                + (c.align ? ' text-align:' + c.align + ';' : '')
                + (c.mono ? ' font-family:monospace;' : '')
                + (c.nowrap ? ' white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:' + c.w + ';' : '')
                + (extra || '');
        };
        var valueOf = function (row, c) {
            if (c.key === '_UNITPRICE') return _unitPrice(row.STPRS1, row.PEINH1);
            if (c.loc) return (st.locations && st.locations[row.IDNRK]) || '';
            return row[c.key] || '';
        };

        thead.innerHTML = '<tr>'
            + '<th style="' + thS + ' width:46px;">' + _esc(_t('레벨', 'Level')) + '</th>'
            + BOM_COLUMNS.map(function (c) {
                return '<th style="' + thS + ' width:' + c.w + ';">' + _esc(en ? c.en : c.ko) + '</th>';
            }).join('')
            // ⚠️ .concept-table은 table-layout:fixed라 min-width가 무시된다 — 반드시 width로 줄 것
            //    (min-width만 줬더니 비고 열이 0px로 찌그러져 안 보였다, 2026-10-15)
            + '<th style="' + thS + ' width:130px;">' + _esc(_t('비고', 'Note')) + '</th>'
            + '</tr>';

        var colCount = BOM_COLUMNS.length + 2;
        if (!st || !st.rows || !st.rows.length) {
            tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="padding:28px; text-align:center; color:#999; border:1px solid #cfe3e5;">'
                + _esc(_t('아직 조회한 BOM이 없습니다. 위에서 자재번호를 확인하고 "🔄 SAP 조회"를 누르세요.',
                    'No BOM yet. Check the material number above and press "🔄 Fetch from SAP".'))
                + '</td></tr>';
            window._bomRenderMeta(st);
            return;
        }

        st._collapsed = st._collapsed || {};
        var html = '';
        // 단위별 합계(SAP가 표 끝에 붙여주는 행) — 두 렌더 분기가 공용으로 쓴다
        var renderTotals = function () {
            (st.totals || []).forEach(function (o) {
                html += '<tr class="bom-row-sum" style="font-weight:bold; color:#2c5f8a;">'
                    + '<td style="' + TD + ' text-align:center;">Σ</td>'
                    + BOM_COLUMNS.map(function (c) {
                        if (c.loc) return '<td style="' + cellStyle(c) + '"></td>';
                        return '<td style="' + cellStyle(c) + '">' + _esc(valueOf(o, c)) + '</td>';
                    }).join('')
                    + '<td style="' + TD + '"></td>'
                    + '</tr>';
            });
        };

        // 모체 자재 행(레벨 없이 맨 앞에 오는 행) — 표 맨 위에 강조해서 고정
        if (st.parent) {
            var pEsc = String(st.parent.IDNRK || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            // 글자는 다른 행과 같게 두고 배경색(.bom-row-top)만으로 구분한다 — 예전엔 bold+청록이라
            // 혼자 폰트가 다른 것처럼 보였다(2026-10-15 사용자 지적). "모체" 라벨 칸만 강조 유지.
            html += '<tr class="bom-row bom-row-top" style="cursor:pointer;"'
                + ' onclick="window.bomSelectComponent(\'' + pEsc + '\')">'
                + '<td style="' + TD + ' text-align:center; color:#00707d; font-weight:bold;">' + _esc(_t('모체', 'Top')) + '</td>'
                + BOM_COLUMNS.map(function (c) {
                    if (c.loc) return '<td style="' + cellStyle(c) + '"></td>';
                    return '<td style="' + cellStyle(c) + '">' + _esc(valueOf(st.parent, c)) + '</td>';
                }).join('')
                + '<td style="' + TD + '"></td>'
                + '</tr>';
        }

        if (st.hierarchyOk !== false) {
            // ── 계층 정상(깊이 우선) — 진짜 모자 관계를 그린다 ──────────────
            // 💡 [2026-10-15] 레벨1 행은 테마 틴트로 경계 역할을 하고, 그 아래 하위 행들은
            //    제브라로 읽기를 돕는다. 제브라는 **실제로 화면에 그려지는 행** 기준이라
            //    가지를 접었다 펴도 줄무늬가 어긋나지 않는다(행 인덱스 기준이면 숨은 행 때문에 깨짐).
            var hidden = -1, visIdx = 0;
            st.rows.forEach(function (r, i) {
                if (hidden !== -1) {
                    if (r._level > hidden) return;      // 접힌 가지의 자식
                    hidden = -1;
                }
                var next = st.rows[i + 1];
                var hasChild = !!(next && next._level > r._level);
                var collapsed = !!st._collapsed[i];
                if (hasChild && collapsed) hidden = r._level;

                var zcls = zebraClass(r._level, visIdx);
                visIdx++;
                var sp = '';
                var ind = (r._level - 1) * 12;
                var tw = hasChild
                    ? '<span onclick="event.stopPropagation(); window.bomToggleBranch(' + i + ')" title="' + _esc(_t('하위 구성품 접기/펴기', 'Collapse/expand children')) + '" style="cursor:pointer; color:#00707d; user-select:none;">' + (collapsed ? '▸' : '▾') + '</span>'
                    : '<span style="color:#cfe3e5;">·</span>';
                var nt = (st.notes && st.notes[r.IDNRK]) || '';
                var me = String(r.IDNRK || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                html += '<tr class="bom-row ' + zcls + '" style="cursor:pointer;"'
                    + ' onclick="window.bomSelectComponent(\'' + me + '\')">'
                    + '<td style="' + TD + sp + ' white-space:nowrap;">'
                    + '<span style="display:inline-block; width:' + ind + 'px;"></span>' + tw
                    + ' <span style="color:#666;">' + r._level + '</span></td>'
                    + BOM_COLUMNS.map(function (c) {
                        if (c.loc) {
                            var lv = valueOf(r, c);
                            return '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + ';' + sp + ' position:relative;" onclick="event.stopPropagation()">'
                                + '<input type="text" value="' + _esc(lv) + '" data-bom-loc="' + _esc(r.IDNRK) + '" title="' + _esc(lv) + '" '
                                + 'oninput="window.bomSetLocation(this)" onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                                + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" placeholder="-"></td>';
                        }
                        var v = valueOf(r, c);
                        var pad = (c.key === 'OJTXP') ? ' padding-left:' + (5 + ind) + 'px;' : '';
                        return '<td style="' + cellStyle(c, sp + pad) + '" title="' + _esc(v) + '">' + _esc(v) + '</td>';
                    }).join('')
                    + '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + ';' + sp + ' position:relative;" onclick="event.stopPropagation()">'
                    + '<input type="text" value="' + _esc(nt) + '" data-bom-note="' + _esc(r.IDNRK) + '" title="' + _esc(nt) + '" '
                    + 'oninput="window.bomSetNote(this)" onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                    + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" placeholder="-"></td>'
                    + '</tr>';
            });
            renderTotals();
            tbody.innerHTML = html;
            window._bomSyncToggleBtn();
            window._bomRenderMeta(st);
            return;
        }

        // ── 계층이 깨진 경우(ALV 정렬) — 레벨 블록으로만 묶는다 ──────────────
        var byLevel = {};
        st.rows.forEach(function (r) { (byLevel[r._level] = byLevel[r._level] || []).push(r); });
        var levels = Object.keys(byLevel).map(Number).sort(function (a, b) { return a - b; });

        var visIdx2 = 0;
        levels.forEach(function (lv) {
            var list = byLevel[lv];
            var collapsed = !!st._collapsed[lv];

            // 레벨 구분 머리행 — 클릭하면 그 레벨 전체를 접었다 편다
            html += '<tr class="bom-lvhdr" style="cursor:pointer;" onclick="window.bomToggleLevel(' + lv + ')"'
                + ' title="' + _esc(_t('이 레벨 접기/펴기', 'Collapse/expand this level')) + '">'
                + '<td colspan="' + colCount + '" style="padding:3px 8px; border:1px solid #cfe3e5;'
                + ' box-sizing:border-box; height:' + ROW_H + '; font-size:11.5px; font-weight:bold; color:#00707d;">'
                + (collapsed ? '▸' : '▾') + ' ' + _esc(_t('레벨 ', 'Level ') + lv)
                + ' <span style="font-weight:normal; color:#5b8a90;">(' + list.length + (en ? ' rows' : '건') + ')</span>'
                + '</td></tr>';
            if (collapsed) return;

            list.forEach(function (r) {
                var note = (st.notes && st.notes[r.IDNRK]) || '';
                var mnEsc = String(r.IDNRK || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                // 제브라는 화면에 실제로 그려지는 행 기준(레벨 블록을 접어도 줄무늬가 안 깨짐)
                var zcls2 = zebraClass(r._level, visIdx2);
                visIdx2++;
                html += '<tr class="bom-row ' + zcls2 + '" style="cursor:pointer;"'
                    + ' onclick="window.bomSelectComponent(\'' + mnEsc + '\')">'
                    + '<td style="' + TD + ' text-align:center; color:#666;">' + r._level + '</td>'
                    + BOM_COLUMNS.map(function (c) {
                        if (c.loc) {
                            var lv2 = valueOf(r, c);
                            return '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + '; position:relative;" onclick="event.stopPropagation()">'
                                + '<input type="text" value="' + _esc(lv2) + '" data-bom-loc="' + _esc(r.IDNRK) + '" title="' + _esc(lv2) + '" '
                                + 'oninput="window.bomSetLocation(this)" onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                                + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" placeholder="-"></td>';
                        }
                        var v = valueOf(r, c);
                        return '<td style="' + cellStyle(c) + '" title="' + _esc(v) + '">' + _esc(v) + '</td>';
                    }).join('')
                    // 비고 칸은 입력용이라 행 클릭(AI 문답 열기)이 끼어들면 안 된다
                    + '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + '; position:relative;" onclick="event.stopPropagation()">'
                    + '<input type="text" value="' + _esc(note) + '" data-bom-note="' + _esc(r.IDNRK) + '" '
                    + 'title="' + _esc(note) + '" '
                    + 'oninput="window.bomSetNote(this)" '
                    + 'onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                    + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" '
                    + 'placeholder="-"></td>'
                    + '</tr>';
            });
        });

        renderTotals();

        tbody.innerHTML = html;
        window._bomSyncToggleBtn();
        window._bomRenderMeta(st);
    };

    window._bomRenderMeta = function (st) {
        var el = document.getElementById('bom-meta');
        if (!el) return;
        if (!st || !st.rows) { el.innerHTML = ''; return; }
        var en = window._currentLang === 'en';
        var when = '';
        try { when = new Date(st.fetchedAt).toLocaleString(en ? 'en-US' : 'ko-KR'); } catch (e) { when = st.fetchedAt || ''; }
        var lv = {};
        st.rows.forEach(function (r) { lv[r._level] = (lv[r._level] || 0) + 1; });
        var lvTxt = Object.keys(lv).sort().map(function (k) { return (en ? 'L' : '레벨') + k + ' ' + lv[k]; }).join(' · ');

        var parts = [
            '<b>' + _esc(st.material) + '</b>' + (st.parent && st.parent.OJTXP ? ' <span style="color:#555;">' + _esc(st.parent.OJTXP) + '</span>' : ''),
            (st.tcode || '') + ' · ' + (st.explosion === 'multi' ? _t('다단계', 'Multi-level') : _t('단일 레벨', 'Single level')),
            _t('총 ', 'Total ') + st.rows.length + (en ? ' rows' : '건') + (lvTxt ? ' (' + lvTxt + ')' : ''),
            when
        ];
        if (st.layout) {
            parts.push(_t('레이아웃 ', 'Layout ') + _esc(st.layout)
                + (st.layoutApplied === false ? ' ⚠️' + _t('적용 실패 — SAP 기본값 사용', ' not applied — SAP default used') : ''));
        }
        // 자재내역2·단가·제조사·담당자는 ZMM009 보강으로 채워지므로, 몇 건이 붙었는지 함께 보여준다
        if (st.enrich && st.enrich.total) {
            parts.push(_t('ZMM009 보강 ', 'ZMM009 enrich ') + st.enrich.matched + '/' + st.enrich.total
                + (st.enrich.ok ? '' : ' ⚠️' + _t('일부 실패', ' partly failed')));
        }
        var html = '<div style="font-size:11.5px; color:#666; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">'
            + parts.filter(Boolean).map(function (p) { return '<span>' + p + '</span>'; }).join('<span style="color:#cfe3e5;">|</span>')
            + '</div>';
        // 화면에 떠 있는 표가 지금 자재번호 칸의 값과 다르면(= Summary에서 PN을 바꿨거나 직접 고쳤는데
        // 아직 다시 조회를 안 한 상태) 조용히 옛 결과를 보여주지 않고 분명히 알린다.
        var _curMat = (document.getElementById('bom-material') || {}).value;
        if (_curMat && st.material && String(_curMat).trim() !== String(st.material).trim()) {
            html += '<div style="font-size:11px; color:#b1432f; margin-top:2px;">⚠️ '
                + _esc(_t('아래 표는 ' + st.material + ' 조회 결과입니다. 지금 자재번호(' + String(_curMat).trim() + ')로 보려면 "🔄 SAP 조회"를 다시 누르세요.',
                    'The table below is for ' + st.material + '. Press "Fetch from SAP" again to load ' + String(_curMat).trim() + '.'))
                + '</div>';
        }
        // 계층이 깨진 경우에만 경고 — ALV에 정렬이 걸려 있으면 모자 관계를 복원할 수 없다.
        if (st.hierarchyOk === false) {
            html += '<div style="font-size:11px; color:#8a6d1f; margin-top:2px;">⚠️ '
                + _esc(_t('SAP 결과가 정렬된 상태로 와서 상·하위 관계를 복원할 수 없어 레벨별로만 묶었습니다. SAP ALV에서 "레이아웃 관리"로 정렬 없는 레이아웃을 적용한 뒤 다시 조회하면 계층이 그대로 나옵니다.',
                    'The SAP result came back sorted, so parent-child links cannot be restored and rows are grouped by level only. Apply an unsorted layout via "Layout management" in SAP ALV and re-run the lookup to get the real hierarchy.'))
                + '</div>';
        }
        if (st.truncated) {
            // SAP 덤프가 500행에서 잘렸다 — 조용히 넘기지 않고 화면에 공개한다
            html += '<div style="margin-top:4px; font-size:11.5px; color:#b1432f;">⚠️ '
                + _esc(_t('SAP 응답이 500행에서 잘렸습니다(전체 ' + (st.totalRows || '?') + '행). 전개 단계를 "단일 레벨"로 줄이거나 자재를 나눠서 조회하세요.',
                    'SAP response was truncated at 500 rows (total ' + (st.totalRows || '?') + '). Use single-level explosion or split the lookup.'))
                + '</div>';
        }
        el.innerHTML = html;
    };

    // ─── 모델(제품구분자) 전환 바 — M.C Table과 같은 체계를 공유 ─────────
    window.bomRenderUnitBar = function () {
        var bar = document.getElementById('bom-unit-bar');
        if (!bar) return;
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (!units.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        var cur = window._bomActiveUnit();
        bar.style.display = 'flex';
        bar.innerHTML = '<button onclick="window.bomCycleUnit()" title="' + _esc(_t('클릭할 때마다 다음 모델로 전환', 'Click to switch to the next model')) + '"'
            + ' style="padding:6px 10px; min-width:auto; border:1px solid #c9b8f0; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold; background:#ede9fb; color:#6741d9;">'
            + _esc(cur) + '</button>';
    };

    window.bomCycleUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (!units.length) return;
        var cur = window._bomActiveUnit();
        var next = units[(units.indexOf(cur) + 1) % units.length];
        // M.C Table과 같은 전환 함수를 쓴다(그쪽 리비전/견적 포인터까지 같이 맞춰져야 하므로)
        if (window.mcSwitchUnit) window.mcSwitchUnit(next);
        else window.mcActiveUnit = next;
        window.bomRender();
    };

    // ─── 언어 전환 ────────────────────────────────────────────────────
    // ⚠️ docs/ui-conventions.md: "함수 자체가 이중언어여도 toggleLang()이 다시 안 부르면 옛 언어로 남는다".
    //    정적 HTML에 박힌 문구(라벨/셀렉트 옵션/버튼)는 여기서 한 번에 맞추고, toggleLang()에서 호출한다.
    window.bomRefreshLang = function () {
        var en = window._currentLang === 'en';
        var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
        set('bom-lbl-material', _t('자재번호', 'Material'));
        var btn = document.getElementById('bom-fetch-btn');
        if (btn && !btn.disabled) btn.textContent = _t('🔄 SAP 조회', '🔄 Fetch from SAP');
        var exp = document.getElementById('bom-explosion');
        if (exp && exp.options.length >= 2) {
            exp.options[0].textContent = _t('다단계', 'Multi-level');
            exp.options[1].textContent = _t('단일 레벨', 'Single level');
        }
        var lay = document.getElementById('bom-layout');
        if (lay && lay.options.length) lay.options[0].textContent = _t('(SAP 기본 레이아웃)', '(SAP default layout)');
        var mat = document.getElementById('bom-material');
        if (mat) mat.placeholder = en ? 'e.g. 502572' : '예: 502572';
        window._bomSyncToggleBtn();
        if (window.bomRender) window.bomRender();   // 헤더/빈 메시지/메타줄은 렌더에서 이중언어 처리됨
    };

    // ─── Elec Parts 내장 BOM ─────────────────────────────────────────
    // Panel/AD BD/CONV BD/Touch Ctrl 뷰의 "BOM" 버튼 → 해당 타입 BOM 서브뷰로 전환.
    // 저장: tabData.elecBomByType[type]. 재조회 시 locations/notes 보존.
    window._elecBomType = null;

    window._elecBomGetStore = function (type) {
        window.tabData = window.tabData || {};
        window.tabData.elecBomByType = window.tabData.elecBomByType || {};
        return window.tabData.elecBomByType[type] || null;
    };

    window._elecBomOpen = function (type) {
        window._elecBomType = type;
        ['panel', 'adbd', 'convbd', 'touchctrl'].forEach(function (v) {
            var el = document.getElementById('elec-view-' + v);
            if (el) el.style.display = 'none';
        });
        var bomEl = document.getElementById('elec-view-bom');
        if (bomEl) bomEl.style.display = 'flex';
        ['panel', 'adbd', 'convbd', 'touchctrl'].forEach(function (v) {
            var el = document.getElementById('eh-' + v + '-btns');
            if (el) el.style.display = 'none';
        });
        var bomBtns = document.getElementById('eh-bom-btns');
        if (bomBtns) bomBtns.style.display = 'contents';
        var meta = window.ELEC_VIEW_META && window.ELEC_VIEW_META[type];
        var label = document.getElementById('elec-view-trigger-label');
        if (label && meta) label.textContent = meta.icon + ' ' + meta.label + ' BOM';
        var matEl = document.getElementById('ep-bom-material');
        if (matEl) {
            var st = window._elecBomGetStore(type);
            matEl.value = (st && st.material) || window._bomDefaultMaterial() || '';
        }
        window._elecBomRender();
        if (window._elecUpdateModeToggle) window._elecUpdateModeToggle('bom');
    };

    window._elecBomClose = function () {
        var type = window._elecBomType || 'panel';
        window._elecBomType = null;
        if (window._switchElecView) window._switchElecView(type);
    };

    window._elecBomSetStatus = function (msg, kind) {
        var el = document.getElementById('ep-bom-status');
        if (!el) return;
        var color = kind === 'error' ? '#b1432f' : (kind === 'busy' ? '#00707d' : '#666');
        el.style.color = color;
        el.innerHTML = msg ? _esc(msg) : '';
    };

    window._elecBomSetNote = function (el) {
        var type = window._elecBomType;
        if (!type) return;
        var st = window._elecBomGetStore(type);
        el.title = el.value;
        if (!st) return;
        st.notes = st.notes || {};
        if (el.value && el.value.trim()) st.notes[el.dataset.bomNote] = el.value;
        else delete st.notes[el.dataset.bomNote];
    };

    window._elecBomSetLoc = function (el) {
        var type = window._elecBomType;
        if (!type) return;
        var st = window._elecBomGetStore(type);
        el.title = el.value;
        if (!st) return;
        st.locations = st.locations || {};
        if (el.value && el.value.trim()) st.locations[el.dataset.bomLoc] = el.value;
        else delete st.locations[el.dataset.bomLoc];
    };

    window._elecBomExportExcel = async function () {
        var type = window._elecBomType;
        if (!type) return;
        var st = window._elecBomGetStore(type);
        if (!st || !st.rows || !st.rows.length) {
            if (window.showToast) window.showToast(_t('내보낼 BOM이 없습니다 — 먼저 조회해주세요.', 'No BOM to export — run a lookup first.'), 'warning');
            return;
        }
        try {
            if (typeof XLSX === 'undefined') throw new Error(_t('엑셀 라이브러리를 불러오지 못했습니다.', 'Excel library not loaded.'));
            var en = window._currentLang === 'en';
            var head = [_t('레벨', 'Level')].concat(BOM_COLUMNS.map(function (c) { return en ? c.en : c.ko; })).concat([_t('비고', 'Note')]);
            var aoa = [head];
            if (st.parent) {
                aoa.push([_t('모체', 'Top')].concat(BOM_COLUMNS.map(function (c) {
                    if (c.loc) return '';
                    return c.key === '_UNITPRICE' ? _unitPrice(st.parent.STPRS1, st.parent.PEINH1) : (st.parent[c.key] || '');
                })).concat(['']));
            }
            var ordered = st.rows.map(function (r, i) { return { r: r, i: i }; })
                .sort(function (a, b) { return (a.r._level - b.r._level) || (a.i - b.i); })
                .map(function (x) { return x.r; });
            ordered.forEach(function (r) {
                aoa.push([r._level].concat(BOM_COLUMNS.map(function (c) {
                    if (c.key === '_UNITPRICE') { var p = parseFloat(String(r.STPRS1 || '').replace(/,/g, '')); var u = parseInt(r.PEINH1 || '1', 10) || 1; return isNaN(p) ? '' : Math.round(p / u * 100) / 100; }
                    if (c.key === 'MENGE') { var q = parseFloat(String(r.MENGE || '').replace(/,/g, '')); return isNaN(q) ? (r.MENGE || '') : q; }
                    if (c.loc) return (st.locations && st.locations[r.IDNRK]) || '';
                    return r[c.key] || '';
                })).concat([(st.notes && st.notes[r.IDNRK]) || '']));
            });
            (st.totals || []).forEach(function (o) {
                aoa.push(['Σ'].concat(BOM_COLUMNS.map(function (c) { return (c.key === '_UNITPRICE' || c.loc) ? '' : (o[c.key] || ''); })).concat(['']));
            });
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 36 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 6 },
                           { wch: 12 }, { wch: 7 }, { wch: 18 }, { wch: 16 }, { wch: 13 }, { wch: 24 }];
            XLSX.utils.book_append_sheet(wb, ws, 'BOM');
            if (typeof applyExcelStyles === 'function') applyExcelStyles(wb);
            var fileName = 'SAP_BOM_' + type.toUpperCase() + '_' + (st.material || '') + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
            var res = await fetch('http://127.0.0.1:5000/sap-save-export', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: fileName, dataBase64: XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) })
            });
            var d = await res.json();
            if (window.showToast) window.showToast(d.ok ? ('📊 ' + (d.message || _t('BOM을 엑셀로 저장했습니다.', 'Saved BOM to Excel.'))) : ('⚠️ ' + (d.error || _t('엑셀 저장 실패', 'Failed'))), d.ok ? 'success' : 'error');
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        }
    };

    window._elecBomToggle = function (idx) {
        var type = window._elecBomType;
        if (!type) return;
        var st = window._elecBomGetStore(type);
        if (!st) return;
        st._collapsed = st._collapsed || {};
        st._collapsed[idx] = !st._collapsed[idx];
        window._elecBomRender();
    };

    window._elecBomFetch = async function () {
        var type = window._elecBomType;
        if (!type) return;
        var matEl = document.getElementById('ep-bom-material');
        var material = (matEl ? matEl.value : '').trim();
        if (!material) {
            if (window.showToast) window.showToast(_t('자재번호를 입력해주세요.', 'Enter a material number.'), 'warning');
            if (matEl) matEl.focus();
            return;
        }
        var explosion = (document.getElementById('ep-bom-explosion') || {}).value || 'multi';
        var btn = document.getElementById('ep-bom-fetch-btn');
        var setBusy = function (on) {
            if (!btn) return;
            btn.disabled = on;
            btn.textContent = on ? _t('⏳ 조회 중…', '⏳ Loading…') : _t('🔄 SAP 조회', '🔄 Fetch from SAP');
        };
        var url = 'http://127.0.0.1:5000/sap-bom?material=' + encodeURIComponent(material)
            + '&plant=1000&explosion=' + encodeURIComponent(explosion);
        setBusy(true);
        window._elecBomSetStatus(_t('SAP에서 BOM을 전개하는 중입니다…', 'Exploding BOM in SAP…'), 'busy');
        try {
            var data = null, parsed = null, attempt = 0;
            while (attempt < 2) {
                attempt++;
                var res = await fetch(url);
                data = await res.json();
                if (!data || !data.ok) throw new Error((data && data.error) || _t('조회 실패', 'Lookup failed'));
                if (data.source === 'grid') { parsed = window._bomParseSapText(data.text); if (parsed) break; }
                if (attempt < 2) window._elecBomSetStatus(_t('결과 화면을 못 읽어 재시도합니다…', 'Retrying…'), 'busy');
            }
            if (!parsed) {
                throw new Error(_t('SAP가 BOM 결과 표 대신 다른 화면을 돌려줬습니다(source: ' + (data && data.source) + ').', 'SAP returned a non-table screen (source: ' + (data && data.source) + ').'));
            }
            window._elecBomSetStatus(_t('구성품 정보를 ZMM009로 보강하는 중입니다…', 'Enriching via ZMM009…'), 'busy');
            var enrich = await window._bomEnrichFromZmm009(parsed.rows, function (done, total) {
                window._elecBomSetStatus(_t('구성품 정보 보강 중… ' + done + '/' + total, 'Enriching… ' + done + '/' + total), 'busy');
            });
            var initCollapsed = {};
            if (explosion === 'multi' && parsed.hierarchyOk) {
                parsed.rows.forEach(function (r, i) {
                    var n = parsed.rows[i + 1];
                    if (n && n._level > r._level) initCollapsed[i] = true;
                });
            }
            window.tabData = window.tabData || {};
            window.tabData.elecBomByType = window.tabData.elecBomByType || {};
            var prev = window._elecBomGetStore(type) || {};
            window.tabData.elecBomByType[type] = {
                enrich: enrich, _collapsed: initCollapsed,
                material: material, plant: '1000', explosion: explosion,
                tcode: data.tcode || '', fetchedAt: new Date().toISOString(),
                cols: parsed.cols, parent: parsed.parent, rows: parsed.rows, totals: parsed.totals,
                truncated: parsed.truncated, totalRows: parsed.totalRows,
                notes: prev.notes || {},
                locations: prev.locations || {}
            };
            window._elecBomSetStatus('', '');
            window._elecBomRender();
            if (window.showToast) window.showToast(_t('BOM ' + parsed.rows.length + '건을 가져왔습니다.', 'Fetched ' + parsed.rows.length + ' BOM rows.'), 'success');
        } catch (e) {
            window._elecBomSetStatus('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        } finally {
            setBusy(false);
        }
    };

    window._elecBomRender = function () {
        var tbody = document.getElementById('ep-bom-body');
        var thead = document.getElementById('ep-bom-thead');
        if (!tbody || !thead) return;
        var en = window._currentLang === 'en';
        var type = window._elecBomType;
        if (!type) return;
        var st = window._elecBomGetStore(type);

        var ROW_H = '24px';
        var zebraClass = function (level, pos) {
            return level === 1 ? (pos % 2 ? 'bom-row-l1-alt' : 'bom-row-l1') : (pos % 2 ? 'bom-row-sub-alt' : 'bom-row-sub');
        };
        var TD = 'padding:2px 5px; border:1px solid #cfe3e5; font-size:11.5px; box-sizing:border-box; height:' + ROW_H + ';';
        var thS = 'padding:3px 5px; border:1px solid #cfe3e5; text-align:center; white-space:nowrap; font-size:11.5px;';
        var cellStyle = function (c, extra) {
            return TD + (c.align ? ' text-align:' + c.align + ';' : '') + (c.mono ? ' font-family:monospace;' : '')
                + (c.nowrap ? ' white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:' + c.w + ';' : '') + (extra || '');
        };
        var valueOf = function (row, c) {
            if (c.key === '_UNITPRICE') return _unitPrice(row.STPRS1, row.PEINH1);
            if (c.loc) return (st.locations && st.locations[row.IDNRK]) || '';
            return row[c.key] || '';
        };
        var renderLocCell = function (r, extra) {
            var lv = (st.locations && st.locations[r.IDNRK]) || '';
            return '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + ';' + (extra || '') + ' position:relative;" onclick="event.stopPropagation()">'
                + '<input type="text" value="' + _esc(lv) + '" data-bom-loc="' + _esc(r.IDNRK) + '" title="' + _esc(lv) + '" '
                + 'oninput="window._elecBomSetLoc(this)" onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" placeholder="-"></td>';
        };

        var colCount = BOM_COLUMNS.length + 2;
        thead.innerHTML = '<tr>'
            + '<th style="' + thS + ' width:46px;">' + _esc(_t('레벨', 'Level')) + '</th>'
            + BOM_COLUMNS.map(function (c) {
                return '<th style="' + thS + ' width:' + c.w + ';">' + _esc(en ? c.en : c.ko) + '</th>';
            }).join('')
            + '<th style="' + thS + ' width:100px;">' + _esc(_t('비고', 'Note')) + '</th>'
            + '</tr>';

        if (!st || !st.rows || !st.rows.length) {
            tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="padding:28px; text-align:center; color:#999; border:1px solid #cfe3e5;">'
                + _esc(_t('아직 조회한 BOM이 없습니다. 위에서 자재번호를 확인하고 "SAP 조회"를 누르세요.', 'No BOM yet. Enter a material number and press "Fetch from SAP".'))
                + '</td></tr>';
            return;
        }

        st._collapsed = st._collapsed || {};
        var html = '';

        if (st.parent) {
            html += '<tr class="bom-row bom-row-top">'
                + '<td style="' + TD + ' text-align:center; color:#00707d; font-weight:bold;">' + _esc(_t('모체', 'Top')) + '</td>'
                + BOM_COLUMNS.map(function (c) {
                    if (c.loc) return '<td style="' + cellStyle(c) + '"></td>';
                    return '<td style="' + cellStyle(c) + '">' + _esc(valueOf(st.parent, c)) + '</td>';
                }).join('')
                + '<td style="' + TD + '"></td></tr>';
        }

        var hidden = -1, visIdx = 0;
        st.rows.forEach(function (r, i) {
            if (hidden !== -1) { if (r._level > hidden) return; hidden = -1; }
            var next = st.rows[i + 1];
            var hasChild = !!(next && next._level > r._level);
            var collapsed = !!st._collapsed[i];
            if (hasChild && collapsed) hidden = r._level;
            var zcls = zebraClass(r._level, visIdx);
            visIdx++;
            var ind = (r._level - 1) * 12;
            var tw = hasChild
                ? '<span onclick="event.stopPropagation(); window._elecBomToggle(' + i + ')" title="' + _esc(_t('하위 구성품 접기/펴기', 'Collapse/expand')) + '" style="cursor:pointer; color:#00707d; user-select:none;">' + (collapsed ? '&#9658;' : '&#9660;') + '</span>'
                : '<span style="color:#cfe3e5;">&#183;</span>';
            var nt = (st.notes && st.notes[r.IDNRK]) || '';
            html += '<tr class="bom-row ' + zcls + '">'
                + '<td style="' + TD + ' white-space:nowrap;">'
                + '<span style="display:inline-block; width:' + ind + 'px;"></span>' + tw
                + ' <span style="color:#666;">' + r._level + '</span></td>'
                + BOM_COLUMNS.map(function (c) {
                    if (c.loc) return renderLocCell(r, '');
                    var v = valueOf(r, c);
                    var pad = (c.key === 'OJTXP') ? ' padding-left:' + (5 + ind) + 'px;' : '';
                    return '<td style="' + cellStyle(c, pad) + '" title="' + _esc(v) + '">' + _esc(v) + '</td>';
                }).join('')
                + '<td style="padding:1px 3px; border:1px solid #cfe3e5; box-sizing:border-box; height:' + ROW_H + '; position:relative;" onclick="event.stopPropagation()">'
                + '<input type="text" value="' + _esc(nt) + '" data-bom-note="' + _esc(r.IDNRK) + '" title="' + _esc(nt) + '" '
                + 'oninput="window._elecBomSetNote(this)" onfocus="window._bomNoteFocus(this)" onblur="window._bomNoteBlur(this)" '
                + 'style="border:none; width:100%; box-sizing:border-box; background:transparent; font-size:11.5px;" placeholder="-"></td>'
                + '</tr>';
        });

        (st.totals || []).forEach(function (o) {
            html += '<tr class="bom-row-sum" style="font-weight:bold; color:#2c5f8a;">'
                + '<td style="' + TD + ' text-align:center;">&#931;</td>'
                + BOM_COLUMNS.map(function (c) {
                    if (c.loc) return '<td style="' + cellStyle(c) + '"></td>';
                    return '<td style="' + cellStyle(c) + '">' + _esc(valueOf(o, c)) + '</td>';
                }).join('')
                + '<td style="' + TD + '"></td></tr>';
        });

        tbody.innerHTML = html;

        var metaEl = document.getElementById('ep-bom-meta');
        if (metaEl && st.material) {
            var when = '';
            try { when = new Date(st.fetchedAt).toLocaleString(en ? 'en-US' : 'ko-KR'); } catch (e2) { when = ''; }
            metaEl.innerHTML = '<span style="font-size:11.5px; color:#666;"><b>' + _esc(st.material) + '</b>'
                + (st.parent && st.parent.OJTXP ? ' <span style="color:#555;">' + _esc(st.parent.OJTXP) + '</span>' : '')
                + ' &middot; ' + st.rows.length + _t('건', ' rows') + ' &middot; ' + _esc(when) + '</span>';
        }
        if (st.truncated) {
            window._elecBomSetStatus('⚠️ ' + _t('SAP 응답이 500행에서 잘렸습니다. 단일 레벨 조회를 시도하세요.', 'SAP response truncated at 500 rows. Try single-level explosion.'), 'error');
        }
    };

    // 레이아웃 드롭다운 — 04h의 BOM 레이아웃 카탈로그(데이터)를 그대로 재사용
    window.bomFillLayoutOptions = function () {
        var sel = document.getElementById('bom-layout');
        if (!sel || sel.dataset.filled === '1') return;
        var opts = window._SAP_BOM_LAYOUT_OPTIONS || [];
        if (!opts.length) return;
        sel.innerHTML = '<option value="">' + _esc(_t('(SAP 기본 레이아웃)', '(SAP default layout)')) + '</option>'
            + opts.map(function (o) {
                return '<option value="' + _esc(o.value) + '"' + (o.value === '/STD_MC' ? ' selected' : '') + '>' + _esc(o.label) + '</option>';
            }).join('');
        sel.dataset.filled = '1';
    };
})();
