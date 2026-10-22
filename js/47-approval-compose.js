// 📝 [2026-10-22 신규] 기안 작성 — 기존 기안을 **틀**로 삼고 값은 **지금 열린 프로젝트**에서 채운다
//
//   기존 기안(틀)  ─┐
//                  ├─→ 칸마다 값 결정 ─→ 사람 확인(출처 표시) ─→ 임시저장
//   현재 프로젝트  ─┘
//
// 백엔드는 이미 다 있다(`/gw/approval/read` → `/gw/approval/copy`의 fields 덮어쓰기).
// 여기는 **가운데 "어느 칸에 어느 값을 넣을지"** 만 담당한다.
//
// 설계 원칙(CLAUDE.md):
//  · 매핑 규칙은 **코드가 아니라 카탈로그**(APPROVAL_FIELD_SOURCES) — 양식이 늘면 항목만 추가
//  · **결정론 먼저** — 사전으로 찾고, 못 찾은 칸만 사람에게 묻는다(AI는 다음 단계)
//  · **사람 승인 후 적용** — 칸마다 출처를 보여주고, 고친 건 사전에 적립해 다음엔 자동
//  · 상신은 어느 경로에서도 하지 않는다
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };
    var _norm = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); };

    // ── 📚 매핑 카탈로그 (데이터) ───────────────────────────────────────
    //   from: 'meta'   projectMeta[key]
    //         'spec'   Customer SPEC(briefSpec)에서 label 과 맞는 행의 값
    //         'summary' tabData.summary[key]
    //         'user'   지금 사용자 이름
    //         'blank'  일부러 비운다(신규 채번처럼 사람이 정할 것)
    //         (없음)   원본 기안 값을 그대로 쓴다
    //   label 은 **별칭 목록** — 양식·프로젝트마다 말이 달라서 한 개로는 못 맞춘다.
    window.APPROVAL_FIELD_SOURCES = window.APPROVAL_FIELD_SOURCES || {
        '제품코드 등록 신청서': {
            '프로젝트 코드': { from: 'meta', key: '프로젝트코드' },
            '프로젝트 명칭': { from: 'meta', key: '프로젝트명' },
            'Buyer':        { from: 'meta', key: '고객사' },
            '등록요청자':     { from: 'user' },
            '패널인치':       { from: 'spec', label: ['패널인치', 'Size', 'Panel Size', '화면크기', 'Active Screen Size'] },
            '패널타입':       { from: 'spec', label: ['패널타입', 'Panel Type', 'LCD Type', 'Driving mode'] },
            '터치타입':       { from: 'spec', label: ['터치타입', 'Touch Type', 'TSP', 'Touch'] },
            'AD Board.':     { from: 'spec', label: ['AD Board', 'AD BD', 'ADBD', 'A/D Board'] },
            'Type&Optical':  { from: 'spec', label: ['Type&Optical', 'Optical', 'Optical Type'] },
            // 👇 신규 채번 대상이라 **원본 값을 물려받으면 안 된다** — 비워서 사람이 넣게 한다
            '자재코드':       { from: 'blank', why: '새로 채번할 코드라 비웁니다' },
            'Description':   { from: 'blank', why: '새 모델 내역이라 비웁니다' }
            // 그 밖(자재그룹넘버·자재상태·생산지·오리진그룹 등)은 적지 않았다 =
            // **원본 기안 값을 그대로** 쓴다. 앱에 대응하는 데이터가 없는 칸들이다.
        }
    };

    // 사람이 미리보기에서 고친 값을 양식·칸 단위로 적립 → 다음엔 그 값이 먼저 제안된다.
    var LEARN_KEY = 'gantt_approval_field_learn_v1';
    var _learnAll = function () {
        try { return JSON.parse(localStorage.getItem(LEARN_KEY) || '{}'); } catch (e) { return {}; }
    };
    var _learnGet = function (form, label) { return ((_learnAll()[form] || {})[label]); };
    var _learnPut = function (form, label, value) {
        try {
            var all = _learnAll();
            all[form] = all[form] || {};
            all[form][label] = value;
            localStorage.setItem(LEARN_KEY, JSON.stringify(all));
        } catch (e) { /* 저장 실패가 기안 작성을 막지는 않는다 */ }
    };
    window._apvLearned = _learnAll;

    // ── 현재 프로젝트에서 값 찾기 ───────────────────────────────────────
    // Customer SPEC 은 {type, sub, modelA/B/C, note} 행들이다. 지금 보는 제품구분자의
    // 열(modelA)을 먼저 보고, 라벨은 별칭·부분일치까지 허용한다.
    var _specFind = function (labels) {
        var rows = (window.tabData && window.tabData.briefSpec) || [];
        var want = (labels || []).map(_norm);
        for (var i = 0; i < rows.length; i++) {
            var sub = _norm(rows[i].sub), typ = _norm(rows[i].type);
            var hit = want.some(function (w) { return w && (sub === w || typ === w); })
                   || want.some(function (w) { return w && sub && sub.indexOf(w) >= 0; });
            if (!hit) continue;
            var v = rows[i].modelA || rows[i].modelB || rows[i].modelC || '';
            if (String(v).trim()) return String(v).trim();
        }
        return '';
    };

    // 칸 하나의 값을 정한다 → {value, from, note}
    //   from 은 **사람에게 보여줄 출처**다. 비워 두지 말 것 — 출처가 안 보이면 다 맞다고 믿고 넘긴다.
    var _resolveOne = function (form, label, srcValue) {
        var learned = _learnGet(form, label);
        if (learned !== undefined && learned !== null && String(learned).trim()) {
            return { value: String(learned), from: _t('지난번 수정값', 'learned'), kind: 'learn' };
        }
        var rule = (window.APPROVAL_FIELD_SOURCES[form] || {})[label];
        if (!rule) return { value: srcValue || '', from: _t('원본 기안', 'source doc'), kind: 'source' };

        if (rule.from === 'blank') {
            return { value: '', from: _t('비움', 'blank'), kind: 'blank', note: rule.why || '' };
        }
        if (rule.from === 'user') {
            var u = window.currentUserName || '';
            return u ? { value: u, from: _t('현재 사용자', 'current user'), kind: 'app' }
                     : { value: srcValue || '', from: _t('원본 기안(사용자 이름 없음)', 'source doc'), kind: 'source' };
        }
        if (rule.from === 'meta') {
            var v = ((window.projectMeta || {})[rule.key] || '').toString().trim();
            return v ? { value: v, from: _t('프로젝트 > ', 'project > ') + rule.key, kind: 'app' }
                     : { value: '', from: _t('프로젝트에 ', 'project has no ') + rule.key + _t(' 없음', ''), kind: 'miss' };
        }
        if (rule.from === 'summary') {
            var s = (((window.tabData || {}).summary || {})[rule.key] || '').toString().trim();
            return s ? { value: s, from: _t('Summary > ', 'summary > ') + rule.key, kind: 'app' }
                     : { value: '', from: _t('Summary 에 값 없음', 'no value in summary'), kind: 'miss' };
        }
        if (rule.from === 'spec') {
            var sv = _specFind(rule.label);
            return sv ? { value: sv, from: _t('Customer SPEC > ', 'Customer SPEC > ') + (rule.label || [])[0], kind: 'app' }
                      : { value: '', from: _t('Customer SPEC 에서 못 찾음', 'not found in Customer SPEC'), kind: 'miss' };
        }
        return { value: srcValue || '', from: _t('원본 기안', 'source doc'), kind: 'source' };
    };

    // ── 진입점 ─────────────────────────────────────────────────────────
    //  opts.asIs = true 면 **매핑하지 않고 원본 값 그대로** 쓴다(= "그대로 복사").
    //  확인 화면·적용 경로는 똑같이 쓴다 — 복사도 사람이 한 번 보고 넣는 게 맞다.
    window.apvComposeFrom = async function (docNum, opts) {
        opts = opts || {};
        docNum = String(docNum || '').trim();
        if (!docNum) { _toast('⚠️ ' + _t('참고할 문서번호가 필요합니다.', 'A source document number is required.'), 'error'); return; }
        if (window._gwEnsureLogin) {
            var g = await window._gwEnsureLogin();
            if (!g || !g.ok) { _toast('🔒 ' + ((g && g.message) || _t('그룹웨어 로그인이 필요합니다.', 'Groupware login required.')), 'error'); return; }
        }
        if (window.collectTabData) { try { window.collectTabData(); } catch (e) { /* 수집 실패해도 있는 값으로 */ } }

        _toast('📄 ' + _t('원본 기안을 읽는 중입니다…', 'Reading the source document…'), 'info');
        var src;
        try {
            var r = await fetch('http://127.0.0.1:5000/gw/approval/read?docNum=' + encodeURIComponent(docNum));
            src = await r.json();
        } catch (e) { src = { ok: false, message: String(e && e.message || e) }; }
        if (!src || !src.ok) {
            _toast('⚠️ ' + _t('원본을 읽지 못했습니다: ', 'Could not read the source: ') + ((src && src.message) || ''), 'error');
            if (window._issueLog) { try { window._issueLog('approval-compose', { docNum: docNum, err: (src && src.message) || '' }); } catch (e2) { /* 기록 실패가 흐름을 막지 않게 */ } }
            return;
        }
        var form = ((src.meta || {}).formName || '').trim();
        var srcFields = src.fields || {};
        // 새 기안에서 시스템이 채우는 칸은 애초에 다루지 않는다(원본 문서번호가 박힌다).
        var SKIP = ['문서번호', '작성일', '작성부서', '작성자', '제목', '기안부서', '기안자'];
        var rows = Object.keys(srcFields)
            .filter(function (k) { return SKIP.indexOf(k.replace(/\s/g, '')) === -1; })
            .map(function (k) {
                var d = opts.asIs
                    ? { value: srcFields[k] || '', from: _t('원본 기안', 'source doc'), kind: 'source' }
                    : _resolveOne(form, k, srcFields[k]);
                return { label: k, srcValue: srcFields[k], value: d.value, from: d.from, kind: d.kind, note: d.note || '' };
            });
        _apvOpen(docNum, src, form, rows, opts.asIs);
    };

    // ── 미리보기 (칸마다 출처를 보여준다) ───────────────────────────────
    window._apvPending = null;
    var _apvOpen = function (docNum, src, form, rows, asIs) {
        window._apvPending = { docNum: docNum, src: src, form: form, rows: rows, asIs: !!asIs };
        var ov = document.getElementById('apv-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'apv-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="apv-box" style="pointer-events:all; position:fixed; left:50%; top:8%; transform:translateX(-50%);'
                + ' width:min(1020px,94vw); max-height:80vh; display:flex; flex-direction:column; background:#fff; border:1px solid #a5c8f0;'
                + ' border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; resize:both; min-width:580px; min-height:340px;">'
                + '<div id="apv-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px;'
                + ' padding:9px 12px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:13px;'
                + ' cursor:grab; user-select:none;"><span id="apv-title"></span>'
                + '<button onclick="window._apvClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="apv-body" style="flex:1; overflow:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<span id="apv-warn" style="font-size:11px; color:#b1432f;"></span>'
                + '<span><button onclick="window._apvClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6;'
                + ' border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">' + _esc(_t('취소', 'Cancel')) + '</button> '
                + '<button id="apv-apply" onclick="window._apvApply()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';"'
                + ' onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';"'
                + ' style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px;'
                + ' font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _esc(_t('이대로 임시저장', 'Save as draft')) + '</button></span></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('apv-box', 'apv-head'); } catch (e) { /* 드래그 실패가 열기를 막지 않게 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('apv-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('apv-overlay'); } catch (e) { /* 〃 */ } }
        _apvRender();
    };

    var KIND_STYLE = {
        app:    { bg: '#e6f6ea', fg: '#1f7a3d', icon: '📘' },
        learn:  { bg: '#e8f4fd', fg: '#1a4f7a', icon: '🧠' },
        source: { bg: '#f1f3f5', fg: '#495057', icon: '📄' },
        blank:  { bg: '#fff8e6', fg: '#7a5210', icon: '✏️' },
        miss:   { bg: '#fbe4e2', fg: '#b1432f', icon: '⚠️' }
    };

    var _apvRender = function () {
        var p = window._apvPending; if (!p) return;
        var pm = window.projectMeta || {};
        document.getElementById('apv-title').textContent =
            (p.asIs ? '📄 ' + _t('그대로 복사 — ', 'Copy as-is — ') : '📝 ' + _t('기안 작성 — ', 'Compose draft — ')) + p.form
            + _t(' / 참고 ', ' / from ') + p.docNum
            + _t(' / 프로젝트 ', ' / project ') + (pm.프로젝트명 || pm.고객모델명 || _t('(안 열림)', '(none)'));

        var html = '<div style="margin-bottom:8px; font-size:11.5px; color:#868e96;">'
            + _esc(_t('칸마다 값이 어디서 왔는지 함께 표시했습니다. 고치면 그 값이 다음부터 이 양식에 먼저 제안됩니다.',
                      'Each field shows where its value came from. Edits are remembered for this form.'))
            + '</div><table style="border-collapse:collapse; width:100%; font-size:11.5px;"><thead><tr>'
            + [_t('칸', 'Field'), _t('넣을 값', 'Value'), _t('출처', 'Source'), _t('원본 기안 값', 'Source doc')].map(function (h) {
                return '<th style="background:#e7f3ff; border:1px solid #e9ecef; padding:4px 6px; text-align:left; white-space:nowrap;">' + _esc(h) + '</th>';
            }).join('') + '</tr></thead><tbody>';

        p.rows.forEach(function (r, i) {
            var st = KIND_STYLE[r.kind] || KIND_STYLE.source;
            html += '<tr>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; white-space:nowrap; font-weight:bold;">' + _esc(r.label) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:2px 4px;"><input type="text" id="apv-v-' + i + '" value="' + _esc(r.value)
                + '" style="width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px;"></td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; white-space:nowrap; background:' + st.bg + '; color:' + st.fg + ';">'
                + st.icon + ' ' + _esc(r.from) + (r.note ? ' <span style="opacity:.75;">(' + _esc(r.note) + ')</span>' : '') + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; color:#868e96; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"'
                + ' title="' + _esc(r.srcValue) + '">' + _esc(r.srcValue || '-') + '</td></tr>';
        });
        html += '</tbody></table>';

        var miss = p.rows.filter(function (r) { return r.kind === 'miss'; }).length;
        var blank = p.rows.filter(function (r) { return r.kind === 'blank'; }).length;
        var chk = (p.src.checks || []);
        html += '<div style="margin-top:8px; font-size:11px; color:#666;">'
            + _esc(_t('체크 항목은 원본 그대로 들어갑니다: ', 'Checkboxes copied as-is: ')) + (chk.length ? _esc(chk.join(', ')) : '-')
            + '</div>';
        if ((p.src.attachments || []).length) {
            html += '<div style="margin-top:4px; font-size:11px; color:#7a5210;">'
                + _esc(_t('원본 첨부 ' + p.src.attachments.length + '건은 가져오지 않습니다 — 새로 올려주세요.',
                          p.src.attachments.length + ' attachment(s) are not copied.')) + '</div>';
        }
        document.getElementById('apv-body').innerHTML = html;
        document.getElementById('apv-warn').textContent =
            (miss ? _t('프로젝트에서 못 찾은 칸 ' + miss + '개', miss + ' field(s) not found') : '')
            + (miss && blank ? ' · ' : '')
            + (blank ? _t('일부러 비운 칸 ' + blank + '개', blank + ' intentionally blank') : '');
    };

    window._apvClose = function () {
        var ov = document.getElementById('apv-overlay');
        if (ov) ov.style.display = 'none';
        window._apvPending = null;
    };

    window._apvApply = async function () {
        var p = window._apvPending; if (!p) return;
        var fields = {}, edited = 0;
        p.rows.forEach(function (r, i) {
            var el = document.getElementById('apv-v-' + i);
            var v = el ? el.value : r.value;
            fields[r.label] = v;
            // 사람이 고친 값만 적립한다 — 자동으로 나온 값까지 저장하면 사전이 금방 오염된다.
            if (String(v) !== String(r.value)) { _learnPut(p.form, r.label, v); edited++; }
        });

        var btn = document.getElementById('apv-apply');
        if (btn) { btn.disabled = true; btn.textContent = _t('⏳ 임시저장 중…', '⏳ Saving…'); }
        var res;
        try {
            var r = await fetch('http://127.0.0.1:5000/gw/approval/copy', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docNum: p.docNum, fields: fields, dryRun: false })
            });
            res = await r.json();
        } catch (e) { res = { ok: false, message: String(e && e.message || e) }; }
        if (btn) { btn.disabled = false; btn.textContent = '✅ ' + _t('이대로 임시저장', 'Save as draft'); }

        if (!res || !res.ok) {
            _toast('⚠️ ' + _t('임시저장 실패: ', 'Draft save failed: ') + ((res && res.message) || ''), 'error');
            if (window._issueLog) { try { window._issueLog('approval-compose', { docNum: p.docNum, form: p.form, err: (res && res.message) || '' }); } catch (e2) { /* 〃 */ } }
            return;
        }
        // 못 채운 칸은 조용히 넘기지 않는다 — 어느 칸이 비었는지 사람이 알아야 한다.
        var log = ((res.draft || {}).log) || [];
        var failed = log.filter(function (x) { return !x.ok; }).map(function (x) { return x.field; });
        _toast('📝 ' + _t('임시저장했습니다 — ', 'Saved as draft — ') + p.form
            + (edited ? _t(' / 고친 칸 ' + edited + '개는 다음에 먼저 제안됩니다', '') : '')
            + (failed.length ? _t(' / 못 채운 칸: ', ' / not filled: ') + failed.join(', ') : ''), 'success');
        window._apvClose();
    };
})();
