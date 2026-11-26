// 🔗≈ 업무 목록 **중복 묶기·비슷한 업무 알림 공용 모듈** (2026-11-26) — 일일보고 후보(js/59)와 프로젝트 리뷰 근거 사실 표(js/62)가 같이 쓴다.
//    사용자 요청: "일일 업무 리스트에 중복이 많다 → 1단계 같은 메일 묶기, 2단계 비슷한 업무 / 프로젝트 리뷰도 비슷한 기능이 필요".
//
// ■ 1단계 🔗 같은 메일 묶기 — 같은 메일이 여러 프로젝트로 배분돼 내용이 똑같은 줄을 **한 줄**로(대표 줄 + 🔗 ×N, 펼치면 프로젝트별 줄).
//    열쇠 = 원본 메일 열쇠(`mailKeyOf`) + 업무명(한 메일에서 나온 **다른 업무**는 안 합친다). 메일 열쇠가 없으면 업무명 + 내용이 글자 그대로 같을 때만.
//    대표 = `o.prefer(c)`(열린 프로젝트 행 — 간트 조작이 거기서만 된다), 없으면 첫 행.
// ■ 2단계 ≈ 비슷한 업무 — 같은 프로젝트에서 업무명의 **흔한 말을 뺀** 낱말이 `DUP_SIMILAR.minShared` 개 이상 겹치면 칩으로 **알리기만** 한다(자동으로 합치지 않는다).
//    앞사슬(A~B, B~C → A~C)로 번지지 않게 첫 행(앵커)과 직접 겹치는 것만. 펼치면 앵커 아래 자식 행으로 모이고(원래 자리에선 빠진다) `o.addAll` 이 있으면 [＋ 모두 담기].
// ■ 쓰는 법: build(표id, 행들, {name, core, mail, project, prefer, repaint, addAll?}) → {rows: 표에 넣을 행들, …} · 표 cfg.children = c => _fdup.children(id, c)
//    · 업무 칸에 `_fdup.cellHtml(id, c, isChild)` · 칩 줄에 `_fdup.chipsHtml(id)` · 열 필터는 `_fdup.members(c)` 로 묶음 안 모두를 본다.
// ⚠️ 상태(켬/끔·펼침)는 표 id 별로 여기 모인다 — 호출부가 따로 변수를 두지 말 것.
(function () {
    'use strict';
    var T = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    // 수치는 데이터 — 코드에 박지 않는다(흔한 말은 **목록에서 계산**한다)
    window.DUP_SIMILAR = window.DUP_SIMILAR || {
        minShared: 2,          // 업무명에서 흔한 말을 뺀 낱말이 이만큼 겹치면 비슷하다고 알린다
        minTokenLen: 2,        // 한 글자 낱말(및·건…)은 세지 않는다
        genericRatio: 0.12,    // 업무명의 이 비율 넘게 나오는 낱말은 흔한 말(일정·확인·요청…)이라 뺀다 — 실측에서 이 값으로 걸러졌다
        genericMinRows: 12,    // 행이 이보다 적으면 비율이 의미가 없어 흔한 말 거르기를 안 한다
        genericMinProjects: 2  // 목록에 프로젝트가 여럿이면 이만큼의 프로젝트에 나와야 흔한 말(한 프로젝트에만 몰린 말은 비슷함의 신호)
    };
    var ST = {};
    function st(id) { return ST[id] || (ST[id] = { groupOn: true, simOn: true, expanded: {}, simOpen: {}, o: null, all: [], gKeys: [], sims: [], merged: 0, groups: 0 }); }
    function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
    function tokOf(s, SIM) {
        return (String(s || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.\-_]*/gu) || []).map(function (t) { return t.replace(/[.\-_]+$/, ''); })
            .filter(function (t) { return t.length >= SIM.minTokenLen && !/^\d+$/.test(t); });
    }
    var pill = function (on) { return window._uiPillStyle ? window._uiPillStyle(on) : ''; };
    var btnSt = function (kind) { return window._uiBtnStyle ? window._uiBtnStyle(kind) : ''; };
    var members = function (c) { return c && c._g ? c._g.members : [c]; };

    function build(id, rows, o) {
        var S = st(id), SIM = window.DUP_SIMILAR;
        S.o = o; S.all = rows; S.gKeys = []; S.sims = []; S.merged = 0; S.groups = 0;
        rows.forEach(function (c, ci) { c._cid = ci; delete c._g; delete c._sim; delete c._simOf; delete c._ck; });
        // ── 1단계 ──
        var gIdx = {}, gList = [];
        rows.forEach(function (c) {
            var mr = o.mail ? o.mail(c) : null, mk = (mr && typeof window.mailKeyOf === 'function') ? window.mailKeyOf(mr) : '';
            var core = o.core ? o.core(c) : '';
            var k = mk ? 'm:' + mk + '|' + norm(o.name(c)) : (core ? 't:' + norm(o.name(c)) + '|' + norm(core) : '');
            if (!k) { gList.push({ members: [c] }); return; }
            var g = gIdx[k]; if (!g) { g = gIdx[k] = { key: k, members: [] }; gList.push(g); }
            g.members.push(c);
        });
        var reps = gList.map(function (g) {
            if (g.members.length < 2) return g.members[0];
            var rep = g.members.filter(function (m) { return o.prefer && o.prefer(m); })[0] || g.members[0];
            var projs = []; g.members.forEach(function (m) { var p = String(o.project(m) || '').trim(); if (p && projs.indexOf(p) < 0) projs.push(p); });
            rep._g = { key: g.key, n: S.gKeys.push(g.key) - 1, members: g.members, projects: projs };
            S.groups++; S.merged += g.members.length - 1;
            return rep;
        });
        var eng = S.groupOn ? reps : rows;
        // ── 2단계 ──
        if (S.simOn && eng.length >= 2) {
            var df = {}, dp = {}, projAll = {};
            eng.forEach(function (c) {
                var p = String(o.project(c) || '');
                projAll[p] = 1;
                c._st = new Set(tokOf(o.name(c), SIM));
                c._st.forEach(function (t) { df[t] = (df[t] || 0) + 1; (dp[t] = dp[t] || {})[p] = 1; });
            });
            // 🩹 [2026-11-26 실측 — 회의 브리핑 18줄에서 "이동용 계측 선반 …" 4줄이 안 걸렸다] 한 프로젝트 안에서 여러 번 나오는 말(이동용·계측·선반)은
            //    흔한 말이 아니라 **바로 그 비슷함의 신호**다. 목록에 프로젝트가 둘 이상이면 **여러 프로젝트에 퍼진 말**만 흔한 말로 뺀다
            //    (확인·요청·일정 같은 말은 여러 프로젝트에 나온다). 프로젝트가 하나뿐인 목록은 예전 규칙 그대로.
            var multiProj = Object.keys(projAll).length >= 2;
            if (eng.length >= SIM.genericMinRows) eng.forEach(function (c) { c._st.forEach(function (t) {
                if (df[t] / eng.length > SIM.genericRatio && (!multiProj || Object.keys(dp[t]).length >= (SIM.genericMinProjects || 2))) c._st.delete(t);
            }); });
            var taken = {};
            eng.forEach(function (a, ai) {
                if (taken[ai] || !a._st.size) return;
                var mem = [];
                eng.forEach(function (b, bi) {
                    if (bi <= ai || taken[bi] || String(o.project(a) || '') !== String(o.project(b) || '')) return;
                    var sh = 0; a._st.forEach(function (t) { if (b._st.has(t)) sh++; });
                    if (sh >= SIM.minShared) mem.push(bi);
                });
                if (!mem.length) return;
                taken[ai] = 1; mem.forEach(function (bi) { taken[bi] = 1; });
                var key = 's:' + String(o.project(a) || '') + '|' + norm(o.name(a));
                var cl = { key: key, n: S.sims.length, anchor: a, members: mem.map(function (bi) { return eng[bi]; }), open: !!S.simOpen[key] };
                S.sims.push(cl); a._sim = cl; cl.members.forEach(function (m) { m._simOf = cl; });
            });
            eng = eng.filter(function (c) { return !(c._simOf && c._simOf.open); });   // 펼친 묶음의 나머지는 원래 자리에서 빠진다
        }
        return { rows: eng, merged: S.merged, groups: S.groups, sims: S.sims.length };
    }

    function children(id, c) {
        var S = st(id), kids = [];
        if (S.groupOn && c._g && S.expanded[c._g.key]) c._g.members.forEach(function (m) { if (m !== c) { m._ck = 'grp'; kids.push(m); } });
        if (c._sim && c._sim.open) c._sim.members.forEach(function (m) { m._ck = 'sim'; kids.push(m); });
        return kids;
    }
    function childMark(c) { return '<span style="color:#aaa;">' + (c._ck === 'sim' ? '≈ ' : '└ ') + '</span>'; }
    var small = ' height:18px; line-height:16px; padding:0 6px; font-size:10.5px;';
    /** 업무 이름 뒤에 붙는 칩들(🔗 ×N · ≈ 비슷 N · ＋ 모두 담기). 자식 줄에는 안 붙는다. */
    function cellHtml(id, c, isChild) {
        if (isChild) return '';
        var S = st(id), q = "window._fdup%S('" + id + "', ", h = '';
        if (c._g) {
            h += ' <button onclick="event.stopPropagation(); ' + q.replace('%S', 'Grp') + c._g.n + ')" title="' + esc(T('같은 메일이 ' + c._g.projects.length + '개 프로젝트에 — 눌러서 프로젝트별로 펼치기/접기', 'Same mail in ' + c._g.projects.length + ' projects — expand/collapse')) + '" style="' + btnSt() + small + '">🔗 ×' + c._g.members.length + (S.expanded[c._g.key] ? ' ▴' : ' ▾') + '</button>';
        }
        var cl = c._sim || c._simOf;
        if (cl) {
            h += ' <button onclick="event.stopPropagation(); ' + q.replace('%S', 'Sim') + cl.n + ')" title="' + esc(T('같은 프로젝트에 업무명이 비슷한 항목이 ' + (cl.members.length + 1) + '건 — 눌러서 모아 보기(합치지는 않습니다)', 'Similar tasks in this project — click to gather them (not merged)')) + '" style="' + btnSt() + small + '">≈ ' + esc(T('비슷 ' + cl.members.length, 'similar ' + cl.members.length)) + ((c._sim && c._sim.open) ? ' ▴' : ' ▾') + '</button>';
        }
        if (c._sim && c._sim.open && S.o && S.o.addAll) {
            h += ' <button onclick="event.stopPropagation(); ' + q.replace('%S', 'AddAll') + c._sim.n + ')" title="' + esc(T('앵커와 비슷한 업무를 각각 한 건씩 한꺼번에 담습니다', 'Add the anchor and its similar tasks, one item each')) + '" style="' + btnSt('accent') + small + '">＋ ' + esc(T('모두 담기 ' + (c._sim.members.length + 1), 'Add all ' + (c._sim.members.length + 1))) + '</button>';
        }
        return h;
    }
    /** 위쪽 칩 줄 — 같은 메일 묶음 켜기/끄기 · 비슷한 업무 알림 켜기/끄기. build() 뒤에 부른다. */
    function chipsHtml(id) {
        var S = st(id), sim, grp = '';
        if (S.groups) {
            grp = '<button onclick="window._fdupMode(\'' + id + '\', \'group\')" title="' + esc(T('같은 메일이 여러 프로젝트로 배분돼 내용이 똑같은 항목을 한 줄로 — 줄 안의 🔗 로 펼칩니다 · 이 단추를 누르면 묶기를 켜고/끕니다', 'Same mail distributed to several projects shown as one row — click to toggle')) + '" style="' + pill(S.groupOn) + '">🔗 ' +
                esc(S.groupOn ? T('같은 메일 ' + S.merged + '건 묶음', S.merged + ' grouped') : T('같은 메일 묶기 (묶을 중복 ' + S.merged + '건)', 'Group same-mail duplicates (' + S.merged + ')')) + '</button>';
        }
        sim = S.simOn
            ? (S.sims.length ? '<button onclick="window._fdupMode(\'' + id + '\', \'sim\')" title="' + esc(T('같은 프로젝트에서 업무명이 비슷한 항목을 알립니다(자동으로 합치지는 않습니다) — 줄 안의 ≈ 로 펼칩니다 · 이 단추를 누르면 알림을 끕니다', 'Flags similar task names in the same project (never merged automatically)')) + '" style="' + pill(true) + '">≈ ' + esc(T('비슷 ' + S.sims.length + '묶음', S.sims.length + ' similar')) + '</button>' : '')
            : '<button onclick="window._fdupMode(\'' + id + '\', \'sim\')" style="' + pill(false) + '">≈ ' + esc(T('비슷한 업무 알림 켜기', 'Flag similar tasks')) + '</button>';
        return grp + sim;
    }
    function repaint(id) { var S = st(id); if (S.o && typeof S.o.repaint === 'function') S.o.repaint(); }
    function keyAt(S, n, kind) {
        var f = null;
        S.all.forEach(function (x) { var g = kind === 'grp' ? x._g : (x._sim || x._simOf); if (g && g.n === n) f = g; });
        return f;
    }
    window._fdupGrp = function (id, n) { var S = st(id), g = keyAt(S, n, 'grp'); if (g) { S.expanded[g.key] = !S.expanded[g.key]; repaint(id); } };
    window._fdupSim = function (id, n) { var S = st(id), g = keyAt(S, n, 'sim'); if (g) { S.simOpen[g.key] = !S.simOpen[g.key]; repaint(id); } };
    window._fdupMode = function (id, which) { var S = st(id); if (which === 'group') S.groupOn = !S.groupOn; else S.simOn = !S.simOn; repaint(id); };
    window._fdupAddAll = function (id, n) {
        var S = st(id), cl = null; S.all.forEach(function (x) { if (x._sim && x._sim.n === n) cl = x._sim; });
        if (cl && S.o && S.o.addAll) S.o.addAll([cl.anchor].concat(cl.members));
    };
    /** 접혀 안 보이는 행(pred 가 가리키는)을 보이게 펼친다 — 근거 링크가 묶음 안 행으로 가야 할 때. 펼쳤으면 true(다시 그린다). */
    function reveal(id, pred) {
        var S = st(id), hit = S.all.filter(pred)[0], found = false;
        if (!hit) return false;
        S.all.forEach(function (c) {
            if (c !== hit && c._g && c._g.members.indexOf(hit) >= 0) { S.expanded[c._g.key] = true; found = true; }
            if (c._sim && c._sim.members.indexOf(hit) >= 0) { S.simOpen[c._sim.key] = true; found = true; }
        });
        if (found) repaint(id);
        return found;
    }
    /** 모달을 새로 열 때 — 펼침은 닫고 켬/끔은 그대로. */
    function reset(id) { var S = st(id); S.expanded = {}; S.simOpen = {}; }

    window._fdup = { build: build, children: children, childMark: childMark, cellHtml: cellHtml, chipsHtml: chipsHtml, members: members, reveal: reveal, reset: reset, state: st,
                     byCid: function (id, cid) { return st(id).all[cid]; } };
})();
