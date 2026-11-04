/* ============================================================================
   📔 일일 업무보고 — 1단계 (2026-11-04)
   설계: docs/daily-report-design.md  ← 왜 이렇게 만들었는지는 전부 거기에 있다

   1단계 범위
     · 내 하루치 쓰기/고치기 (공용 모달 — 어디서든 열린다)
     · 팀 하루 보기 + 미작성 표시 (사이드바 `daily` 탭)
     · AI 사다리 **1단**: 메일 분석이 이미 써 둔 `[핵심내용]`/`[To do]` 를 꺼내 초안을 채운다
       → **AI 호출 0회.** 비싼 추론은 메일이 들어올 때 이미 했다(실측: 메일 유래 행의
         99.7% 가 그 서식을 갖고 있다). 다시 추론할 게 아니라 꺼내 쓴다.
   1단계가 **안 하는 것**: AI 호출(2단) · 텔레그램 입력(3단) · 기간 조회 · 엑셀 · 주간보고 연동

   ⚠️ 저장은 **사람 × 날짜 = 파일 하나**다. 한 파일에 쓰는 사람이 한 명뿐이라
      "여러 사람이 같은 파일을 읽고-고쳐-통째로 쓰기"가 구조적으로 불가능하다
      (2026-11-04 project_index 유실 사고의 전제를 없앤다).
   ⚠️ 메일 유래 판정은 **표식(`_mailRaw`·`＊AI📧`·`_담당구분`)이 아니라 칸 내용**으로 한다 —
      같은 날 그 표식들이 실제로 전부 날아간 사고를 봤다(칸 내용만 살아남았다).
============================================================================ */
(function () {
    'use strict';

    var T = function (ko, en) { return window._t ? window._t(ko, en) : ko; };
    var esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var toast = function (m, k, ms) { if (window.showToast) window.showToast(m, k || 'info', ms || 4000); };

    // ══════════════════════════════════════════════════════════════════════
    // 1. 데이터(카탈로그) — 코드에 박지 않는 것
    // ══════════════════════════════════════════════════════════════════════

    /** 일 종류. `exempt`=true 면 그날은 보고할 일이 없다(3단계 미작성 알림에서도 면제). */
    window.DAILY_DAY_TYPES = window.DAILY_DAY_TYPES || [
        { key: 'work',     ko: '근무',  en: 'Work',     exempt: false },
        { key: 'leave',    ko: '휴가',  en: 'Leave',    exempt: true  },
        { key: 'half',     ko: '반차',  en: 'Half-day', exempt: false },
        { key: 'trip',     ko: '출장',  en: 'Trip',     exempt: true  },
        { key: 'training', ko: '교육',  en: 'Training', exempt: true  }
    ];

    /** 입력 칸. 늘리려면 여기 한 줄. `src`=auto 는 간트에서 초안이 채워지는 칸. */
    window.DAILY_FIELDS = window.DAILY_FIELDS || [
        { key: 'done',  ko: '오늘 한 일',   en: 'Done today',  src: 'auto',  rows: 3 },
        { key: 'next',  ko: '내일 할 일',   en: 'Tomorrow',    src: 'human', rows: 2 },
        { key: 'issue', ko: '막힌 것·이슈', en: 'Issues',      src: 'human', rows: 2 }
    ];

    window.DAILY_POLICY = window.DAILY_POLICY || {
        dueAt: '17:00',          // 3단계 알림이 쓸 마감 — 지금은 화면 안내에만 쓴다
        autoOpenModal: false,    // ⚠️ 켜면 프로젝트 목록 자동열기(STORAGE_POLICY)와 팝업이 겹친다
        draftKey: 'gantt_daily_draft_v1',
        keepMonths: 24,
        aiPerDay: 1              // 2단계에서 쓸 상한(1단계는 AI 호출이 없다)
    };

    window.DAILY_PATHS = window.DAILY_PATHS || {
        root: 'App_Config/DailyReport',
        roster: 'App_Config/DailyReport/_roster.json',
        // ⚠️⚠️ 월 폴더는 `2026_11` — **밑줄이다, 하이픈이 아니다.** 실측(2026-11-04):
        //    구버전 백엔드의 `nas_dsm.ensure_folder` 가 DSM 에 `name` 을 평문으로 보내서
        //    **숫자로 시작하는 폴더 이름이 거부된다**(`2026`·`202611`·`2026-11` 전부
        //    "파일 작업 인자가 잘못되었습니다", `2026_11`·`testfolder` 는 통과).
        //    게다가 `ensure_folder` 는 **이미 있는 폴더에도 매번 CreateFolder 를 부르고**
        //    DSM 이 414(이미 있음) 대신 인자 오류를 주므로, 한 번 만들어 둬도 계속 막힌다.
        //    → `nas_dsm.py` 는 고쳤지만(`name` 을 JSON 배열로) 그건 **백엔드 재시작 뒤**에 듣는다.
        //      밑줄 이름은 **고치기 전/후 둘 다** 되므로 재시작을 기다리지 않아도 된다.
        month: function (ymd) { return window.DAILY_PATHS.root + '/' + String(ymd).slice(0, 7).replace('-', '_'); },
        file: function (ymd, key) { return window.DAILY_PATHS.month(ymd) + '/' + ymd + '__' + key + '.json'; },
        parse: function (name) {            // `2026-11-04__yhpark.json` → {ymd, key}
            var m = String(name || '').match(/^(\d{4}-\d{2}-\d{2})__(.+)\.json$/);
            return m ? { ymd: m[1], key: m[2] } : null;
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 2. 날짜 / 신원
    // ══════════════════════════════════════════════════════════════════════

    function ymd(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function dayLabel(s) {
        var d = new Date(s + 'T00:00:00');
        return s + ' (' + ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + ')';
    }
    window._dailyYmd = ymd;

    /** 파일 이름에 쓸 내 키 — 사내 계정 id. 파일명에 못 쓰는 글자는 뺀다. */
    function myKey() {
        var raw = String(window.currentUserName || '').trim();
        // "홍길동 (PC)" 처럼 꼬리가 붙는 경로가 있다(js/09 getActiveUserName) — 떼고 쓴다.
        raw = raw.replace(/\s*\(PC\)\s*$/, '').trim();
        var k = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
        return k || 'unknown';
    }
    window._dailyMyKey = myKey;

    // ── 명단(roster) — 계정 id ↔ 실명 ↔ 역할 별칭. **PM 한 명만 쓴다.** ─────────
    // ⚠️ 간트에는 담당자 열이 **아예 없다**(실측 12/12). 그래서 "이게 내 일인가"는
    //    역할(`_담당구분`) → `projectMeta.<역할>담당자` → 이 명단으로 잇는다.
    var _roster = null, _rosterRev = null;
    window.dailyLoadRoster = async function (force) {
        if (_roster && !force) return _roster;
        try {
            var o = await window.nasAppFile.get(window.DAILY_PATHS.roster, { json: true });
            _roster = (o && Array.isArray(o.members)) ? o.members : [];
            _rosterRev = (o && o.rev) || 0;
        } catch (e) {
            console.warn('[일일보고] 명단 조회 실패:', e.message);
            _roster = [];
        }
        return _roster;
    };
    window._dailyRoster = function () { return _roster || []; };

    /** 내 명단 항목(없으면 계정 id 만 든 임시 항목). */
    function me() {
        var k = myKey();
        var hit = (_roster || []).filter(function (m) { return m && String(m.key || '').toLowerCase() === k; })[0];
        return hit || { key: k, name: '', aliases: [], team: '' };
    }

    /** 내 이름으로 볼 수 있는 모든 표기(실명·별칭·계정). 소문자 집합. */
    function myNames() {
        var m = me(), out = {};
        [m.key, m.name].concat(m.aliases || []).forEach(function (n) {
            n = String(n || '').trim().toLowerCase();
            if (n) out[n] = 1;
        });
        return out;
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. 메일 유래 내용 파서 — **칸 내용으로** 판정한다
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ `[문제점]`/`[대책]`/담당자 추출은 js/20(주간보고)이 **이미 하고 있다** —
    //    정규식을 베끼지 않고 그 전역 함수를 그대로 쓴다. 베끼면 메일 프롬프트 서식이
    //    바뀔 때 고친 쪽만 살고 나머지는 조용히 빈칸이 된다.
    window._mailContentParse = function (content) {
        var s = String(content == null ? '' : content);
        var pick = function (tag) {
            var m = s.match(new RegExp('\\[' + tag + '\\]([\\s\\S]*?)(?=\\n\\[|$)'));
            return m ? m[1].trim() : '';
        };
        var head = s.split('\n')[0] || '';
        var arrow = head.match(/\[([^\[\]]*?)\s*(?:→|->)\s*([^\[\]]*?)\]/);
        var iss = (typeof window.wrExtractIssue === 'function') ? window.wrExtractIssue(s) : { issue: '', fix: '' };
        return {
            isMail: s.indexOf('[출처]') !== -1 || s.indexOf('[핵심내용]') !== -1,
            type:   (head.match(/^\[([^\[\]]+)\]/) || [])[1] || '',
            from:   arrow ? arrow[1].trim() : '',
            to:     arrow ? arrow[2].trim() : '',
            core:   pick('핵심내용'),
            todo:   pick('To do'),
            source: pick('출처'),
            issue:  iss.issue || '',
            fix:    iss.fix || ''
        };
    };

    /** 보고 한 줄로 쓸 만큼만 — 첫 문장(또는 n자). */
    function oneLine(s, n) {
        s = String(s || '').replace(/\s+/g, ' ').trim();
        if (!s) return '';
        var cut = s.search(/[.。]\s|다\.\s|함\.\s/);
        if (cut > 12 && cut < (n || 120)) s = s.slice(0, cut + 1);
        return s.length > (n || 120) ? s.slice(0, n || 120) + '…' : s;
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. 자동 초안 (AI 사다리 1단 — 호출 0회)
    // ══════════════════════════════════════════════════════════════════════

    function rowName(row) {
        if (!row) return '';
        if (typeof window.wrTaskName === 'function') {
            var n = window.wrTaskName(row);
            if (n) return String(n).replace(/\s*＊AI📧?\s*$/, '').replace(/\s*＊AI\s*$/, '').trim();
        }
        var ci = window.colIdx || {};
        return (ci.wbs != null && ci.wbs !== -1 && row[ci.wbs]) ? String(row[ci.wbs]).trim() : '';
    }

    /** `_담당구분` 으로 "이게 내 일인가"를 본다. 못 가리면 **제외하지 않고** false 만 돌려준다. */
    function isMine(row) {
        var names = myNames();
        if (!Object.keys(names).length) return false;
        var disc = row && row._담당구분;
        if (!disc) return false;
        // ⚠️ `SAL` 과 `영업` 이 같이 있다(실측 362/26) — 정규화 전 비교는 조용히 빗나간다.
        var norm = (typeof window._normalizeWbsDiscipline === 'function')
            ? window._normalizeWbsDiscipline(disc) : disc;
        var cats = String(norm || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        for (var i = 0; i < cats.length; i++) {
            var who = (typeof window._msResolveCategoryAssignee === 'function')
                ? window._msResolveCategoryAssignee(cats[i]) : null;
            if (!who || !who.name) continue;
            // ⚠️ 담당자 칸은 `조익현,조재준` 처럼 **쉼표 다중**이다 — 쪼개서 비교한다.
            var list = (typeof window._addrSplitNames === 'function')
                ? window._addrSplitNames(who.name) : String(who.name).split(',');
            for (var j = 0; j < list.length; j++) {
                if (names[String(list[j] || '').trim().toLowerCase()]) return true;
            }
        }
        return false;
    }

    /** 오늘 날짜가 걸린 리프 행 → 초안 후보. */
    window.dailyBuildDraft = function (dateStr) {
        var out = { mine: [], others: [], touched: [] };
        var gd = window.globalData;
        var ci = window.colIdx || {};
        if (!Array.isArray(gd) || gd.length < 2) return out;
        var day = new Date((dateStr || ymd()) + 'T00:00:00').getTime();
        var dayEnd = day + 86400000 - 1;
        var proj = window.currentDriveFileName || (window.projectMeta && window.projectMeta.프로젝트명) || '';

        for (var i = 1; i < gd.length; i++) {
            var row = gd[i];
            if (!row) continue;
            var lvl = (typeof row._level === 'number') ? row._level : 4;
            var nx = gd[i + 1];
            var nlvl = (nx && typeof nx._level === 'number') ? nx._level : -1;
            if (nx && nlvl > lvl) continue;                       // 리프만
            var s = row._calcStartTs, e = row._calcPlanTs;
            if (!s && !e) continue;
            if (!((s || e) <= dayEnd && (e || s) >= day)) continue;
            var nm = rowName(row);
            if (!nm) continue;
            var content = (ci.content != null && ci.content !== -1) ? String(row[ci.content] || '') : '';
            var p = window._mailContentParse(content);
            var item = {
                idx: i, name: nm, project: proj,
                status: (ci.status != null && ci.status !== -1) ? String(row[ci.status] || '') : '',
                core: oneLine(p.core, 140),
                todo: oneLine(p.todo, 120),
                issue: p.issue ? oneLine(p.issue, 120) : '',
                isMail: p.isMail,
                late: !!(e && e < day && String((ci.status !== -1 && row[ci.status]) || '') !== '완료')
            };
            (isMine(row) ? out.mine : out.others).push(item);
        }

        // 오늘 내가 손댄 업무 — changeLogs 는 `toLocaleString('ko-KR')` 문자열이다.
        var logs = window.changeLogs || [];
        var names = myNames();
        var seen = {};
        var dd = new Date((dateStr || ymd()) + 'T00:00:00');
        var stamp = dd.getFullYear() + '. ' + (dd.getMonth() + 1) + '. ' + dd.getDate() + '.';
        for (var k = logs.length - 1; k >= 0 && out.touched.length < 40; k--) {
            var L = logs[k];
            if (!L || String(L.time || '').indexOf(stamp) !== 0) continue;
            if (!names[String(L.userName || '').trim().toLowerCase()]) continue;
            var rn = String(L.rowName || '').replace(/\s*＊AI📧?\s*$/, '').trim();
            if (!rn || seen[rn]) continue;
            seen[rn] = 1;
            out.touched.push({ name: rn, project: proj, col: String(L.colName || '') });
        }
        return out;
    };

    // ══════════════════════════════════════════════════════════════════════
    // 5. 저장소 — 사람 × 날짜 파일 하나. 쓰는 사람은 **나 하나**.
    // ══════════════════════════════════════════════════════════════════════

    function emptyDoc(dateStr) {
        return { date: dateStr, key: myKey(), name: me().name || '', team: me().team || '',
                 dayType: 'work', items: [], next: '', issue: '', rev: 0, savedAt: '' };
    }

    window.dailyLoad = async function (dateStr, key) {
        var rel = window.DAILY_PATHS.file(dateStr, key || myKey());
        try {
            var o = await window.nasAppFile.get(rel, { json: true });
            if (!o) return null;
            if (!Array.isArray(o.items)) o.items = [];
            return o;
        } catch (e) {
            console.warn('[일일보고] 읽기 실패:', rel, e.message);
            throw e;
        }
    };

    /**
     * 내 하루치를 쓴다.
     * ⚠️ 가드 둘 — ① `rev` 가 내가 본 값과 다르면 덮지 않는다(두 창/두 PC)
     *             ② 지금 내용이 있는데 **빈 것으로** 덮으려 하면 거부한다
     *   (project_index 를 0건으로 덮어 날린 그 사고와 같은 모양을 미리 막는다)
     */
    window.dailySave = async function (doc) {
        var rel = window.DAILY_PATHS.file(doc.date, doc.key || myKey());
        var cur = null;
        try { cur = await window.nasAppFile.get(rel, { json: true }); } catch (e) { cur = undefined; }
        if (cur === undefined) {
            throw new Error(T('지금 저장본을 읽지 못해 저장을 멈췄습니다 — 덮어쓰면 남은 내용이 사라질 수 있습니다.',
                              'Stopped: could not read the current file, so writing could lose content.'));
        }
        if (cur && (cur.rev || 0) !== (doc.rev || 0)) {
            var err = new Error(T('다른 창에서 먼저 저장했습니다 — 덮어쓰지 않고 최신본을 불러왔습니다.',
                                  'Another window saved first — reloaded instead of overwriting.'));
            err.conflict = cur;
            throw err;
        }
        var hadContent = !!(cur && ((cur.items || []).length || cur.next || cur.issue));
        var hasContent = !!((doc.items || []).length || doc.next || doc.issue);
        var exempt = (window.DAILY_DAY_TYPES.filter(function (t) { return t.key === doc.dayType; })[0] || {}).exempt;
        if (hadContent && !hasContent && !exempt) {
            throw new Error(T('내용이 비어 있어 저장을 막았습니다 — 지우려면 항목을 하나씩 지워주세요.',
                              'Blocked an empty overwrite — remove items individually instead.'));
        }
        doc.rev = (doc.rev || 0) + 1;
        doc.savedAt = new Date().toISOString();
        doc.name = doc.name || me().name || '';
        doc.team = doc.team || me().team || '';
        var r = await window.nasAppFile.put(rel, doc);
        if (r && r.ok === false) throw new Error(r.message || 'NAS 쓰기 실패');
        try { localStorage.removeItem(window.DAILY_POLICY.draftKey); } catch (e) { /* 용량 문제는 무시 */ }
        return doc;
    };

    /** 그 날짜의 팀 전체 — 목록 1콜 + 필요한 파일만. */
    window.dailyLoadDay = async function (dateStr) {
        var items = await window.nasAppFile.list(window.DAILY_PATHS.month(dateStr));
        var mine = items.filter(function (it) {
            var p = window.DAILY_PATHS.parse(it && it.name);
            return p && p.ymd === dateStr;
        });
        var out = [];
        for (var i = 0; i < mine.length; i++) {
            var p = window.DAILY_PATHS.parse(mine[i].name);
            try {
                var doc = await window.dailyLoad(dateStr, p.key);
                if (doc) out.push(doc);
            } catch (e) { /* 한 사람 파일이 깨져도 나머지는 보여준다 */ }
        }
        return out;
    };

    // ══════════════════════════════════════════════════════════════════════
    // 6. 입력 모달
    // ══════════════════════════════════════════════════════════════════════

    var _doc = null, _date = null;

    function saveDraftLocal() {
        if (!_doc) return;
        try {
            localStorage.setItem(window.DAILY_POLICY.draftKey, JSON.stringify({ at: Date.now(), doc: _doc }));
        } catch (e) { /* 저장소가 꽉 찬 건 js/34 🧹 가 다룬다 */ }
    }

    window.dailyOpenModal = async function (dateStr) {
        if (window._storageMode && window._storageMode() !== 'nas') {
            toast(T('일일보고는 사내 NAS 저장소에서만 동작합니다.', 'Daily report requires the NAS storage backend.'), 'warning', 7000);
            return;
        }
        _date = dateStr || ymd();
        await window.dailyLoadRoster();
        try {
            _doc = await window.dailyLoad(_date) || emptyDoc(_date);
        } catch (e) {
            toast('⚠️ ' + e.message, 'error', 8000);
            return;
        }
        // 로컬 초안이 더 최근이면 그걸 되살린다(창이 닫혀도 글이 안 날아가게)
        try {
            var d = JSON.parse(localStorage.getItem(window.DAILY_POLICY.draftKey) || 'null');
            if (d && d.doc && d.doc.date === _date && (!_doc.savedAt || Date.parse(_doc.savedAt) < d.at)) {
                _doc = d.doc;
                toast(T('저장 전 초안을 되살렸습니다.', 'Restored your unsaved draft.'), 'info');
            }
        } catch (e) { /* 초안이 깨졌으면 무시 */ }
        render();
    };

    function render() {
        var wrap = document.getElementById('daily-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'daily-modal';
            wrap.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            document.body.appendChild(wrap);
        }
        var draft = window.dailyBuildDraft(_date);
        var types = window.DAILY_DAY_TYPES.map(function (t) {
            var on = _doc.dayType === t.key;
            return '<button onclick="window._dailySetType(\'' + t.key + '\')" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12.5px; border:1px solid ' +
                   (on ? '#a5c8f0' : '#ddd') + '; background:' + (on ? '#e7f3ff' : '#fff') + '; color:' + (on ? '#1971c2' : '#555') + '; font-weight:' + (on ? 'bold' : 'normal') + ';">' +
                   esc(window._currentLang === 'en' ? t.en : t.ko) + '</button>';
        }).join('');

        var exempt = (window.DAILY_DAY_TYPES.filter(function (t) { return t.key === _doc.dayType; })[0] || {}).exempt;

        var chk = _doc.items.map(function (it, i) {
            return '<div style="display:flex; gap:7px; align-items:flex-start; padding:5px 0; border-bottom:1px solid #f2f2f2;">' +
                   '<button onclick="window._dailyDropItem(' + i + ')" title="' + esc(T('빼기', 'Remove')) + '" style="flex-shrink:0; width:20px; height:20px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:4px; cursor:pointer; font-size:11px; line-height:1;">✕</button>' +
                   '<div style="flex:1; min-width:0;">' +
                     '<div style="font-size:12.5px; font-weight:bold; color:#222;">' + esc(it.name) +
                       (it.project ? ' <span style="font-weight:normal; color:#888; font-size:11px;">(' + esc(it.project) + ')</span>' : '') + '</div>' +
                     '<input value="' + esc(it.note || '') + '" oninput="window._dailyNote(' + i + ', this.value)" placeholder="' + esc(T('한 줄 덧붙이기(선택)', 'Add a line (optional)')) + '" ' +
                       'style="width:100%; box-sizing:border-box; margin-top:3px; padding:4px 7px; border:1px solid #e0e0e0; border-radius:5px; font-size:12px;">' +
                   '</div></div>';
        }).join('') || '<div style="color:#aaa; font-size:12px; padding:6px 0;">' + esc(T('아래에서 골라 담거나 직접 추가하세요.', 'Pick below or add manually.')) + '</div>';

        var cand = [].concat(draft.mine, draft.others).filter(function (c) {
            return !_doc.items.some(function (it) { return it.name === c.name; });
        });
        var candHtml = cand.length ? cand.slice(0, 25).map(function (c, i) {
            return '<div onclick="window._dailyAdd(' + i + ')" style="cursor:pointer; padding:5px 7px; border:1px solid #eee; border-radius:5px; margin-bottom:4px; background:#fafbfc;" ' +
                   'onmouseover="this.style.background=\'#eef6f7\';" onmouseout="this.style.background=\'#fafbfc\';">' +
                   '<div style="font-size:12px; font-weight:bold; color:#2c5f8a;">+ ' + esc(c.name) +
                     (c.isMail ? ' <span title="' + esc(T('메일 분석에서 온 업무', 'From mail analysis')) + '">📧</span>' : '') +
                     (c.late ? ' <span style="color:#b1432f; font-size:10.5px;">' + esc(T('지연', 'late')) + '</span>' : '') + '</div>' +
                   (c.core ? '<div style="font-size:11px; color:#666; margin-top:2px;">' + esc(c.core) + '</div>' : '') +
                   '</div>';
        }).join('') : '<div style="color:#aaa; font-size:11.5px;">' + esc(T('오늘 날짜가 걸린 업무가 없습니다.', 'No tasks dated today.')) + '</div>';
        window._dailyCand = cand;

        wrap.innerHTML =
'<div id="daily-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(720px,94vw); max-height:90vh; display:flex; flex-direction:column; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.22); overflow:hidden;">' +
  '<div id="daily-drag" style="flex-shrink:0; padding:12px 17px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:14px; display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none;">' +
    '<span>📔 ' + esc(T('일일 업무보고', 'Daily Report')) + ' — ' + esc(dayLabel(_date)) +
      (me().name ? ' <span style="font-weight:normal; font-size:11.5px; color:#5a8ab5;">' + esc(me().name) + '</span>' : '') + '</span>' +
    '<button onclick="window.dailyCloseModal()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); width:28px; height:28px; cursor:pointer; font-size:15px; line-height:1; flex-shrink:0;">✕</button>' +
  '</div>' +
  '<div style="flex:1; min-height:0; overflow-y:auto; padding:14px 17px;">' +
    '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">' +
      '<span style="font-size:12px; color:#555; margin-right:4px;">' + esc(T('일 종류', 'Day type')) + '</span>' + types + '</div>' +
    (exempt
      ? '<div style="padding:14px; background:#f4f8fb; border:1px solid #d6e6f2; border-radius:7px; font-size:12.5px; color:#2c5f8a;">' +
        esc(T('이 날은 보고할 업무가 없습니다 — 저장만 누르면 됩니다.', 'Nothing to report for this day — just save.')) + '</div>'
      : '<div style="font-size:12.5px; font-weight:bold; color:#333; margin-bottom:4px;">' + esc(T('오늘 한 일', 'Done today')) + '</div>' +
        '<div style="border:1px solid #e8e8e8; border-radius:7px; padding:7px 10px; margin-bottom:6px;">' + chk + '</div>' +
        '<div style="display:flex; gap:6px; margin-bottom:12px;">' +
          '<input id="daily-manual" placeholder="' + esc(T('직접 추가 — 업무명', 'Add manually — task name')) + '" style="flex:1; padding:5px 8px; border:1px solid #ddd; border-radius:5px; font-size:12px;" onkeydown="if(event.key===\'Enter\'){window._dailyAddManual();}">' +
          '<button onclick="window._dailyAddManual()" style="padding:5px 12px; border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-size:12px; font-weight:bold; cursor:pointer;">+ ' + esc(T('추가', 'Add')) + '</button>' +
        '</div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:4px;">' + esc(T('간트에서 불러오기', 'From Gantt')) + ' <span style="color:#bbb;">' + esc(T('(AI 호출 없음 — 메일 분석 결과를 그대로 씁니다)', '(no AI call — reuses mail analysis)')) + '</span></div>' +
        '<div style="max-height:150px; overflow-y:auto; margin-bottom:14px;">' + candHtml + '</div>' +
        (_doc.aiDone
          ? '<div style="margin-bottom:10px;">' +
              '<div style="font-size:12.5px; font-weight:bold; color:#1971c2; margin-bottom:3px;">🤖 ' + esc(T('오늘 한 일 (AI 정리본 — 고쳐도 됩니다)', 'Done today (AI draft — editable)')) + '</div>' +
              '<textarea rows="4" oninput="window._dailyField(\'aiDone\', this.value)" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #a5c8f0; background:#f7fbff; border-radius:6px; font-size:12px; font-family:inherit; resize:vertical;">' + esc(_doc.aiDone) + '</textarea>' +
            '</div>'
          : '') +
        window.DAILY_FIELDS.filter(function (f) { return f.src === 'human'; }).map(function (f) {
            return '<div style="margin-bottom:10px;">' +
              '<div style="font-size:12.5px; font-weight:bold; color:#333; margin-bottom:3px;">' + esc(window._currentLang === 'en' ? f.en : f.ko) + '</div>' +
              '<textarea rows="' + f.rows + '" oninput="window._dailyField(\'' + f.key + '\', this.value)" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ddd; border-radius:6px; font-size:12px; font-family:inherit; resize:vertical;">' + esc(_doc[f.key] || '') + '</textarea>' +
              (f.key === 'issue'
                ? '<button onclick="window.dailyPromoteIssue()" title="' + esc(T('이 이슈를 업무의 [문제점] 줄로 넣습니다 — 주간보고 문제점 표에 자동으로 올라옵니다', 'Writes this issue into the task as a [문제점] line — it then shows up in the Weekly Report')) + '" style="margin-top:4px; padding:4px 10px; border:1px solid #cfe3e5; background:#eef6f7; color:#2c5f8a; border-radius:5px; font-size:11.5px; cursor:pointer;">↗️ ' + esc(T('이 이슈를 업무에 반영', 'Attach issue to task')) + '</button>'
                : '') +
            '</div>';
        }).join('')
    ) +
  '</div>' +
  '<div style="flex-shrink:0; padding:10px 17px; border-top:1px solid #eee; display:flex; align-items:center; gap:8px;">' +
    '<span style="flex:1; font-size:11px; color:#999;">' + esc(_doc.savedAt ? T('마지막 저장 ', 'Saved ') + new Date(_doc.savedAt).toLocaleString('ko-KR') : T('아직 저장 안 됨', 'Not saved yet')) + '</span>' +
    (exempt ? '' : '<button id="daily-ai-btn" onclick="window.dailyAiTidy()" title="' + esc(T('담은 업무를 보고 문장으로 묶어 줍니다 (하루 1회)', 'Groups the picked tasks into report sentences (once a day)')) + '" style="padding:6px 13px; border:1px solid #a5c8f0; background:#e7f3ff; color:#1971c2; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">🤖 ' + esc(T('AI로 정리', 'Tidy with AI')) + '</button>') +
    '<button onclick="window.dailyCloseModal()" style="padding:6px 14px; border:1px solid #ccc; background:#fff; color:#555; border-radius:6px; font-size:12.5px; cursor:pointer;">' + esc(T('닫기', 'Close')) + '</button>' +
    '<button id="daily-save-btn" onclick="window._dailySave()" style="padding:6px 20px; border:none; background:#19c3d6; color:#fff; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">✅ ' + esc(T('저장', 'Save')) + '</button>' +
  '</div>' +
'</div>';

        if (window._makeDraggable) window._makeDraggable('daily-box', 'daily-drag');
        if (window._bindClickToFront) window._bindClickToFront('daily-modal');
        if (window.bringModalToFront) window.bringModalToFront('daily-modal');
    }

    window.dailyCloseModal = function () {
        saveDraftLocal();
        var m = document.getElementById('daily-modal');
        if (m) m.style.display = 'none';
    };
    window._dailySetType = function (k) { _doc.dayType = k; saveDraftLocal(); render(); };
    window._dailyNote = function (i, v) { if (_doc.items[i]) { _doc.items[i].note = v; saveDraftLocal(); } };
    window._dailyField = function (k, v) { _doc[k] = v; saveDraftLocal(); };
    window._dailyDropItem = function (i) { _doc.items.splice(i, 1); saveDraftLocal(); render(); };
    window._dailyAdd = function (i) {
        var c = (window._dailyCand || [])[i];
        if (!c) return;
        _doc.items.push({ name: c.name, project: c.project, note: c.todo || '', fromMail: !!c.isMail, rowIdx: c.idx });
        saveDraftLocal(); render();
    };
    window._dailyAddManual = function () {
        var el = document.getElementById('daily-manual');
        var v = el ? el.value.trim() : '';
        if (!v) return;
        _doc.items.push({ name: v, project: window.currentDriveFileName || '', note: '' });
        if (el) el.value = '';
        saveDraftLocal(); render();
    };
    window._dailySave = async function () {
        var btn = document.getElementById('daily-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        try {
            _doc = await window.dailySave(_doc);
            toast('✅ ' + T('일일보고를 저장했습니다.', 'Daily report saved.'), 'success');
            render();
            if (document.getElementById('tab-daily') && document.getElementById('tab-daily').classList.contains('active')) {
                window.dailyRenderTab();
            }
        } catch (e) {
            if (e.conflict) { _doc = e.conflict; render(); }
            toast('⚠️ ' + e.message, 'warning', 9000);
            if (window._issueLog) {
                try { window._issueLog({ domain: 'daily-report', kind: 'save_failed', result: { errorRaw: e.message } }); }
                catch (e2) { /* 기록 실패가 저장을 막지는 않는다 */ }
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✅ ' + T('저장', 'Save'); }
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 7. 팀 하루 보기 탭
    // ══════════════════════════════════════════════════════════════════════

    window._dailyTabDate = null;
    window._dailyView = 'day';       // 'day' | 'month'

    /** 하루 보기 ↔ 월 보기 */
    window.dailyToggleView = function () {
        window._dailyView = (window._dailyView === 'day') ? 'month' : 'day';
        window.dailyRenderTab();
    };

    /** 그 달 전체를 **목록 1콜**로 — 칸을 누를 때만 그 날 파일을 읽는다. */
    window.dailyLoadMonth = async function (dateStr) {
        var items = await window.nasAppFile.list(window.DAILY_PATHS.month(dateStr));
        var by = {};                                 // key → { ymd: true }
        items.forEach(function (it) {
            var p = window.DAILY_PATHS.parse(it && it.name);
            if (!p) return;
            (by[p.key] = by[p.key] || {})[p.ymd] = it.mtime || 1;
        });
        return by;
    };

    function monthDays(dateStr) {
        var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7);
        var n = new Date(y, m, 0).getDate(), out = [];
        for (var i = 1; i <= n; i++) {
            out.push(dateStr.slice(0, 8) + String(i).padStart(2, '0'));
        }
        return out;
    }
    /** 쉬는 날이면 칸을 비워 둔다 — 주말·공휴일을 "미작성"으로 칠하면 표가 빨갛기만 하다. */
    function offDay(s) {
        var w = new Date(s + 'T00:00:00').getDay();
        if (w === 0 || w === 6) return true;
        return !!(window.isHoliday && window.isHoliday(s));
    }
    window._dailyOffDay = offDay;

    // ── 📊 엑셀 출력 (1·2단계는 **출력만** — 되돌려 넣지 않는다) ─────────────
    // ⚠️ 되돌려 넣기를 만들면 **남의 하루 파일을 내 브라우저가 쓰게** 되어
    //    "한 파일에 쓰는 사람은 한 명" 불변식이 깨진다. 그래서 일부러 단방향이다.
    window.dailyExportExcel = async function () {
        if (typeof XLSX === 'undefined') { toast(T('엑셀 라이브러리를 불러오지 못했습니다.', 'Excel library not loaded.'), 'error'); return; }
        var date = window._dailyTabDate || ymd();
        var en = window._currentLang === 'en';
        var wb = XLSX.utils.book_new();
        try {
            if (window._dailyView === 'month') {
                var by = await window.dailyLoadMonth(date);
                var roster = await window.dailyLoadRoster();
                var people = (roster && roster.length) ? roster.filter(function (m) { return m.active !== false; })
                                                      : Object.keys(by).map(function (k) { return { key: k, name: k }; });
                var days = monthDays(date);
                var head = [en ? 'Name' : '이름'].concat(days.map(function (d) { return +d.slice(8); }));
                var aoa = [head].concat(people.map(function (p) {
                    return [p.name || p.key].concat(days.map(function (d) {
                        if (offDay(d)) return '';
                        return (by[p.key] && by[p.key][d]) ? 'O' : 'X';
                    }));
                }));
                var ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = [{ wch: 12 }].concat(days.map(function () { return { wch: 3 }; }));
                XLSX.utils.book_append_sheet(wb, ws, en ? 'Monthly' : '월간');
            } else {
                var docs = await window.dailyLoadDay(date);
                var rows = [[en ? 'Name' : '이름', en ? 'Type' : '종류', en ? 'Done' : '오늘 한 일',
                             en ? 'Tomorrow' : '내일 할 일', en ? 'Issues' : '막힌 것', en ? 'Saved' : '작성시각']];
                docs.forEach(function (d) {
                    var t = window.DAILY_DAY_TYPES.filter(function (x) { return x.key === d.dayType; })[0] || {};
                    rows.push([d.name || d.key, (en ? t.en : t.ko) || '',
                        String(d.aiDone || '').trim() || (d.items || []).map(function (i) { return '• ' + i.name + (i.note ? ' — ' + i.note : ''); }).join('\n'),
                        d.next || '', d.issue || '', d.savedAt ? new Date(d.savedAt).toLocaleString('ko-KR') : '']);
                });
                var ws2 = XLSX.utils.aoa_to_sheet(rows);
                ws2['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 52 }, { wch: 28 }, { wch: 28 }, { wch: 20 }];
                XLSX.utils.book_append_sheet(wb, ws2, en ? 'Daily' : '일일보고');
            }
            var fn = (en ? 'DailyReport_' : '일일업무보고_') + (window._dailyView === 'month' ? date.slice(0, 7) : date) + '.xlsx';
            XLSX.writeFile(wb, fn);
            toast('📊 ' + T(fn + ' 로 저장했습니다.', 'Saved as ' + fn), 'success');
        } catch (e) {
            toast('⚠️ ' + T('엑셀 출력 실패: ', 'Excel export failed: ') + e.message, 'error', 8000);
        }
    };

    window.dailyShiftDay = function (n) {
        var d = new Date((window._dailyTabDate || ymd()) + 'T00:00:00');
        if (n === 0) window._dailyTabDate = ymd();
        else { d.setDate(d.getDate() + n); window._dailyTabDate = ymd(d); }
        window.dailyRenderTab();
    };

    // ══════════════════════════════════════════════════════════════════════
    // 7-D. [3단계] 비근무일 파일 — **앱이 써 주고 백엔드가 읽는다**
    // ══════════════════════════════════════════════════════════════════════
    // 백엔드는 `KOR_HOLIDAYS`(js/04d 안)를 모른다. 백엔드에 공휴일을 복사하면
    // ① 하드코딩이고 ② 두 벌이 갈라진다. 그래서 판정 **결과**만 내보낸다.
    // ⚠️ 백엔드는 이 파일이 없거나 `until` 이 지났으면 **알림을 안 보낸다**(안전쪽).
    var NONWORK_REL = 'App_Config/DailyReport/_nonworkdays.json';
    var NONWORK_AHEAD = 120;        // 넉넉히 넉 달

    window.dailyPublishNonWorkdays = async function (force) {
        if (window._storageMode && window._storageMode() !== 'nas') return null;
        if (!window.isHoliday) return null;
        var d = new Date(), days = [], until = '';
        for (var i = 0; i < NONWORK_AHEAD; i++) {
            var s = ymd(d);
            if (window.isHoliday(s)) days.push(s);     // 주말은 백엔드가 직접 판단한다
            until = s;
            d.setDate(d.getDate() + 1);
        }
        var doc = { days: days, until: until, savedAt: new Date().toISOString(), by: myKey() };
        try {
            var cur = await window.nasAppFile.get(NONWORK_REL, { json: true });
            // 내용이 같으면 안 쓴다 — 사람마다 앱을 열 때마다 NAS 에 쓸 이유가 없다.
            if (!force && cur && cur.until === doc.until &&
                JSON.stringify(cur.days || []) === JSON.stringify(days)) return cur;
            await window.nasAppFile.put(NONWORK_REL, doc);
            return doc;
        } catch (e) {
            console.warn('[일일보고] 비근무일 파일 발행 실패:', e.message);
            return null;
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 7-E. [3단계] 명단(roster) 편집 — 알림·텔레그램 입력이 여기 매여 있다
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ 팀 공용 파일이라 **쓰는 사람이 여럿이 될 수 있는 유일한 자리**다.
    //    그래서 `rev` 로 막고, 빈 명단 덮어쓰기를 거부한다. 보통은 PM 혼자 만진다.
    window.dailyOpenRoster = async function () {
        if (window._storageMode && window._storageMode() !== 'nas') {
            toast(T('NAS 저장소에서만 쓸 수 있습니다.', 'NAS storage only.'), 'warning'); return;
        }
        await window.dailyLoadRoster(true);
        var list = (_roster || []).slice();
        if (!list.length) list = [{ key: myKey(), name: '', aliases: [], team: '', tgChatId: '', active: true, notifier: true }];
        window._dailyRosterDraft = JSON.parse(JSON.stringify(list));
        renderRoster();
    };

    function renderRoster() {
        var wrap = document.getElementById('daily-roster-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'daily-roster-modal';
            wrap.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9450; pointer-events:none; background:none;';
            document.body.appendChild(wrap);
        }
        var L = window._dailyRosterDraft || [];
        var rows = L.map(function (m, i) {
            var inp = function (k, ph, w) {
                return '<input value="' + esc(m[k] == null ? '' : m[k]) + '" placeholder="' + esc(ph) + '" oninput="window._dailyRosterSet(' + i + ',\'' + k + '\',this.value)" style="width:' + w + '; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:11.5px;">';
            };
            return '<tr>' +
              '<td style="padding:3px;">' + inp('key', '계정id', '90px') + '</td>' +
              '<td style="padding:3px;">' + inp('name', '실명', '80px') + '</td>' +
              '<td style="padding:3px;"><input value="' + esc((m.aliases || []).join(', ')) + '" placeholder="별칭,별칭" oninput="window._dailyRosterSet(' + i + ',\'aliases\',this.value)" style="width:110px; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:11.5px;"></td>' +
              '<td style="padding:3px;">' + inp('team', '팀', '72px') + '</td>' +
              '<td style="padding:3px;">' + inp('tgChatId', '텔레그램 ID', '100px') + '</td>' +
              '<td style="padding:3px; text-align:center;"><input type="checkbox" ' + (m.active !== false ? 'checked' : '') + ' onchange="window._dailyRosterSet(' + i + ',\'active\',this.checked)"></td>' +
              '<td style="padding:3px; text-align:center;"><input type="radio" name="dr-notifier" ' + (m.notifier ? 'checked' : '') + ' onchange="window._dailyRosterNotifier(' + i + ')"></td>' +
              '<td style="padding:3px;"><button onclick="window._dailyRosterDrop(' + i + ')" style="width:22px; height:22px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:4px; cursor:pointer; font-size:11px;">✕</button></td>' +
            '</tr>';
        }).join('');
        wrap.innerHTML =
'<div id="daily-roster-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(860px,95vw); max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.22); overflow:hidden;">' +
 '<div id="daily-roster-drag" style="flex-shrink:0; padding:12px 17px; background:#eef6f7; border-bottom:1px solid #cfe3e5; color:#2c5f8a; font-weight:bold; font-size:14px; display:flex; justify-content:space-between; cursor:grab; user-select:none;">' +
   '<span>👥 ' + esc(T('일일보고 명단 (팀 공용)', 'Daily report roster (team-shared)')) + '</span>' +
   '<button onclick="document.getElementById(\'daily-roster-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); width:28px; height:28px; cursor:pointer;">✕</button></div>' +
 '<div style="flex:1; min-height:0; overflow:auto; padding:13px 17px;">' +
   '<div style="font-size:11.5px; color:#777; margin-bottom:8px; line-height:1.6;">' +
     esc(T('· 계정id = NAS 로그인 계정(파일 이름에 쓰입니다) · 별칭은 간트 담당자 이름과 맞추는 데 씁니다',
           '· key = NAS login account (used in file names) · aliases match Gantt owner names')) + '<br>' +
     esc(T('· 📣 = 알림·텔레그램 수신을 담당할 PC 한 대. 반드시 한 명만 — 여러 대가 동시에 받으면 보고가 흩어집니다.',
           '· 📣 = the one PC that polls Telegram and sends reminders. Exactly one.')) + '</div>' +
   '<table style="border-collapse:collapse; font-size:11.5px;"><thead><tr style="background:#f4f6f8;">' +
     ['계정id|key', '실명|Name', '별칭|Aliases', '팀|Team', '텔레그램 ID|Telegram ID', '사용|On', '📣', ''].map(function (h) {
        var p = h.split('|');
        return '<th style="padding:5px 6px; border:1px solid #e3e6ea; color:#2c5f8a;">' + esc(window._currentLang === 'en' ? (p[1] || p[0]) : p[0]) + '</th>';
     }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' +
   '<button onclick="window._dailyRosterAdd()" style="margin-top:8px; padding:5px 12px; border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-size:12px; font-weight:bold; cursor:pointer;">+ ' + esc(T('사람 추가', 'Add person')) + '</button>' +
 '</div>' +
 '<div style="flex-shrink:0; padding:10px 17px; border-top:1px solid #eee; display:flex; gap:8px; justify-content:flex-end;">' +
   '<button onclick="document.getElementById(\'daily-roster-modal\').style.display=\'none\'" style="padding:6px 14px; border:1px solid #ccc; background:#fff; color:#555; border-radius:6px; font-size:12.5px; cursor:pointer;">' + esc(T('닫기', 'Close')) + '</button>' +
   '<button onclick="window.dailySaveRoster()" style="padding:6px 20px; border:none; background:#19c3d6; color:#fff; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">✅ ' + esc(T('저장', 'Save')) + '</button>' +
 '</div></div>';
        wrap.style.display = 'flex';
        if (window._makeDraggable) window._makeDraggable('daily-roster-box', 'daily-roster-drag');
        if (window.bringModalToFront) window.bringModalToFront('daily-roster-modal');
    }

    window._dailyRosterSet = function (i, k, v) {
        var m = window._dailyRosterDraft[i]; if (!m) return;
        m[k] = (k === 'aliases') ? String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : v;
    };
    window._dailyRosterNotifier = function (i) {
        window._dailyRosterDraft.forEach(function (m, j) { m.notifier = (i === j); });
    };
    window._dailyRosterAdd = function () {
        window._dailyRosterDraft.push({ key: '', name: '', aliases: [], team: '', tgChatId: '', active: true });
        renderRoster();
    };
    window._dailyRosterDrop = function (i) { window._dailyRosterDraft.splice(i, 1); renderRoster(); };

    window.dailySaveRoster = async function () {
        var list = (window._dailyRosterDraft || []).filter(function (m) { return String(m.key || '').trim(); });
        if (!list.length) { toast(T('계정id가 있는 사람이 한 명도 없습니다.', 'No one has a key.'), 'warning'); return; }
        if (list.filter(function (m) { return m.notifier; }).length > 1) {
            toast(T('📣 담당은 한 명만 고를 수 있습니다.', 'Only one 📣 notifier allowed.'), 'warning'); return;
        }
        try {
            var cur = await window.nasAppFile.get(window.DAILY_PATHS.roster, { json: true });
            // ⚠️ 빈 명단으로 덮어쓰기 금지 + rev 충돌 거부(이 파일만 여럿이 쓸 수 있다)
            if (cur && (cur.members || []).length && !list.length) throw new Error(T('빈 명단으로 덮을 수 없습니다.', 'Refusing to overwrite with an empty roster.'));
            if (cur && _rosterRev != null && (cur.rev || 0) !== _rosterRev) {
                _roster = cur.members || []; _rosterRev = cur.rev || 0;
                window._dailyRosterDraft = JSON.parse(JSON.stringify(_roster));
                renderRoster();
                throw new Error(T('다른 사람이 먼저 저장했습니다 — 최신본을 불러왔습니다. 다시 확인해주세요.',
                                  'Someone saved first — reloaded the latest. Please re-check.'));
            }
            var doc = { members: list, rev: ((cur && cur.rev) || 0) + 1, savedAt: new Date().toISOString(), by: myKey() };
            await window.nasAppFile.put(window.DAILY_PATHS.roster, doc);
            _roster = list; _rosterRev = doc.rev;
            document.getElementById('daily-roster-modal').style.display = 'none';
            toast('✅ ' + T('명단을 저장했습니다.', 'Roster saved.'), 'success');
            window.dailyRenderTab();
        } catch (e) {
            toast('⚠️ ' + e.message, 'warning', 8000);
        }
    };

    window._dailyGoDay = function (d) {
        window._dailyTabDate = d;
        window._dailyView = 'day';
        window.dailyRenderTab();
    };

    window.dailyOnTabShown = function () {
        if (!window._dailyTabDate) window._dailyTabDate = ymd();
        window.dailyRenderTab();
    };

    /** 알림·수신 담당 PC 에서 1회 확인(사람이 누를 때). 백엔드가 구버전이면 404 로 구분된다. */
    window.dailyNotifyTest = async function () {
        try {
            var r = await fetch('http://127.0.0.1:5000/daily/tick',
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ force: true }) });
            if (r.status === 404) {
                toast(T('백엔드가 구버전입니다 — kortek_backend 를 재시작해주세요.',
                        'Backend is outdated — please restart kortek_backend.'), 'warning', 9000);
                return;
            }
            var j = await r.json();
            var n = (j.notify && j.notify.sent || []).length, h = (j.inbound && j.inbound.handled) || 0;
            toast('📔 ' + T('알림 ' + n + '건 발송 · 수신 ' + h + '건 처리' +
                            ((j.notify && j.notify.message) ? ' — ' + j.notify.message : ''),
                            'Sent ' + n + ' reminder(s), handled ' + h + ' inbound'), 'info', 9000);
        } catch (e) {
            toast(T('백엔드에 연결하지 못했습니다 — kortek_backend 가 떠 있는지 확인해주세요.',
                    'Could not reach the backend.'), 'warning', 8000);
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 8. [4단계] AI 사다리 3단 — 주간보고 합류
    // ══════════════════════════════════════════════════════════════════════
    // 주간보고(js/20)는 지금 **간트 일정만** 보고 PPT 초안을 만든다. 그 주에 사람이
    // 실제로 적은 글(일일보고)을 같이 주면 훨씬 정확하다.
    // ⚠️ js/20 의 함수 시그니처를 **바꾸지 않는다** — `_wrFmtTasksForAi` 가 만든 글 뒤에
    //    덧붙이기만 한다(감싸기). 주간보고는 자기 계약을 그대로 유지한다.
    // ⚠️ 네트워크를 타므로 **미리 받아 둔 것만** 쓴다(동기 함수를 async 로 바꾸지 않는다).
    window._dailyWeekCache = { key: '', text: '' };

    /** 그 주(월~금) 일일보고를 한 덩어리 글로. 주간보고 모달을 열기 전에 받아 둔다. */
    window.dailyWeekDigest = async function (baseDate) {
        if (window._storageMode && window._storageMode() !== 'nas') return '';
        var d = new Date(baseDate || new Date());
        var day = d.getDay(), diff = (day === 0) ? -6 : (1 - day);
        var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
        var dates = [];
        for (var i = 0; i < 5; i++) {
            var x = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
            dates.push(ymd(x));
        }
        var ck = dates[0] + '~' + dates[4];
        if (window._dailyWeekCache.key === ck) return window._dailyWeekCache.text;
        var out = [];
        try {
            // 월 폴더가 걸칠 수 있다(월말 주) — 두 달 다 본다.
            var months = {}; dates.forEach(function (s) { months[window.DAILY_PATHS.month(s)] = 1; });
            var files = [];
            for (var mk in months) {
                if (!Object.prototype.hasOwnProperty.call(months, mk)) continue;
                var items = await window.nasAppFile.list(mk);
                items.forEach(function (it) {
                    var p = window.DAILY_PATHS.parse(it && it.name);
                    if (p && dates.indexOf(p.ymd) !== -1) files.push(p);
                });
            }
            for (var f = 0; f < files.length; f++) {
                var doc = await window.dailyLoad(files[f].ymd, files[f].key);
                if (!doc) continue;
                var body = String(doc.aiDone || '').trim() ||
                    (doc.items || []).map(function (it) { return '• ' + it.name + (it.note ? ' — ' + it.note : ''); }).join('\n');
                if (!body && !doc.issue) continue;
                out.push('[' + files[f].ymd + ' ' + (doc.name || files[f].key) + ']\n' + body +
                         (doc.issue ? '\n  (이슈) ' + doc.issue : ''));
            }
        } catch (e) {
            console.warn('[일일보고] 주간 묶기 실패:', e.message);
            return '';
        }
        var text = out.join('\n');
        window._dailyWeekCache = { key: ck, text: text };
        return text;
    };

    (function hookWeekly() {
        // 주간보고 PPT 미리보기를 열기 **직전에** 그 주 일일보고를 받아 두고,
        // AI 프롬프트에 들어갈 "이번 주 업무 목록" 뒤에 덧붙인다.
        var origPreview = window._wrShowAiPreviewModal;
        if (typeof origPreview !== 'function') return;     // js/20 이 없으면 아무것도 안 한다
        window._wrShowAiPreviewModal = async function (data, issueRows) {
            try {
                var digest = await window.dailyWeekDigest(window.wrBaseDate || new Date());
                if (digest) {
                    // `_wrFmtTasksForAi` 는 js/20 안의 지역 함수라 못 건드린다 —
                    // 대신 **데이터에 한 줄 더 실어** 그 함수가 그대로 받아 가게 한다.
                    data = Object.assign({}, data, {
                        thisList: (data.thisList || []).concat([{
                            idx: -1, row: {},
                            text: '— 이번 주 일일보고에 적힌 내용 —\n' + digest
                        }])
                    });
                    toast('📔 ' + T('이번 주 일일보고를 주간보고 초안에 같이 넣었습니다.',
                                    'Added this week\'s daily reports to the weekly draft.'), 'info', 5000);
                }
            } catch (e) { /* 합류 실패가 주간보고를 막으면 안 된다 */ }
            return origPreview.call(this, data, issueRows);
        };
    })();

    // ── 부팅 1회: 비근무일 목록을 올려 둔다(없으면 백엔드가 알림을 안 보낸다) ──
    setTimeout(function () {
        try { window.dailyPublishNonWorkdays(); } catch (e) { /* 부팅을 막지 않는다 */ }
    }, 8000);

    // ══════════════════════════════════════════════════════════════════════
    // 7-A. [2단계] AI 사다리 2단 — 다듬기. **사람이 누를 때만, 하루 1회.**
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ 모달을 여는 것만으로는 절대 호출하지 않는다 — Phase 9 가 "모달 열 때마다"
    //    AI 를 내보내 하루 한도를 태운 적이 있다(2026-10-21).
    // ⚠️ 원문 전문을 싣지 않는다 — 이미 요약된 글([핵심내용])을 또 요약하는 건 한도만 먹는다.
    var AI_USED_KEY = 'gantt_daily_ai_used_v1';

    function aiUsedToday(date) {
        try {
            var o = JSON.parse(localStorage.getItem(AI_USED_KEY) || '{}');
            return (o && o[date]) || 0;
        } catch (e) { return 0; }
    }
    function aiMarkUsed(date) {
        try {
            var o = JSON.parse(localStorage.getItem(AI_USED_KEY) || '{}');
            o[date] = (o[date] || 0) + 1;
            // 오래된 날짜는 버린다(이 키가 무한히 자라지 않게)
            Object.keys(o).forEach(function (k) { if (k < date.slice(0, 8) + '01') delete o[k]; });
            localStorage.setItem(AI_USED_KEY, JSON.stringify(o));
        } catch (e) { /* 저장소가 꽉 찬 건 js/34 가 다룬다 */ }
    }

    /** 1단 초안 → 보고 문장. 실패·키없음·쿨다운이면 **1단 결과를 그대로 둔다.** */
    window.dailyAiTidy = async function () {
        var btn = document.getElementById('daily-ai-btn');
        var date = _date;
        if (aiUsedToday(date) >= (window.DAILY_POLICY.aiPerDay || 1)) {
            toast(T('오늘은 이미 AI로 정리했습니다 — 그대로 고쳐 쓰세요.',
                    'Already tidied with AI today — edit the text instead.'), 'info', 6000);
            return;
        }
        var key = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!key) {
            toast(T('AI 키가 없습니다 — 간트에서 불러온 내용을 그대로 쓰세요.',
                    'No AI key — use the drafted items as they are.'), 'warning', 6000);
            return;
        }
        if (!(_doc.items || []).length && !_doc.next && !_doc.issue) {
            toast(T('정리할 내용이 없습니다 — 먼저 업무를 담아주세요.', 'Nothing to tidy yet.'), 'info');
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + T('정리 중…', 'Tidying…'); }

        var lines = (_doc.items || []).map(function (it, i) {
            return (i + 1) + '. ' + it.name + (it.project ? ' (' + it.project + ')' : '')
                 + (it.note ? '\n   조치: ' + String(it.note).slice(0, 160) : '');
        }).join('\n') || '(없음)';

        var prompt = '당신은 일일 업무보고 작성 어시스턴트입니다.\n'
            + '아래는 오늘 처리한 업무 목록입니다(메일 분석으로 자동 등록된 것 포함).\n\n'
            + '[오늘 한 일 후보]\n' + lines + '\n\n'
            + '[내일 할 일(사람이 적은 것)]\n' + (_doc.next || '(없음)') + '\n\n'
            + '[이슈(사람이 적은 것)]\n' + (_doc.issue || '(없음)') + '\n\n'
            + '규칙:\n'
            + '- 위 목록에 없는 업무/수치/날짜/사람 이름을 절대 만들지 마세요. 쓸 내용이 없으면 "해당 없음"이라고만 쓰세요.\n'
            + '- 비슷한 업무는 한 줄로 묶고, 보고 가치가 낮은 것은 생략하세요.\n'
            + '- 각 줄은 "• " 로 시작하고 한 줄에 한 문장. 프로젝트명이 있으면 괄호로 끝에 붙이세요.\n'
            + '- 수치·모델코드는 위 목록에 적힌 것만 그대로 인용하세요.\n'
            + '- 응답은 아래 구분자를 그대로 사용해 3개 구역으로만 구성하세요.\n\n'
            + '===오늘한일===\n===내일할일===\n===이슈===\n===끝===';
        if (window._currentLang === 'en') {
            prompt += '\n\n[Output language] Write the content in English. Keep the delimiters exactly as shown.';
        }

        try {
            var res = await window.callAiBackend(key, prompt, { feature: 'daily-report' });
            if (!res || !res.ok) throw (res && res.error) || new Error(T('AI 응답 오류', 'AI error'));
            var text = (window._extractGanttQaAiText ? window._extractGanttQaAiText(res) : '') ||
                       (res.data && res.data.result && res.data.result.candidates &&
                        res.data.result.candidates[0].content.parts[0].text) || '';
            var seg = function (a, b) {
                var m = text.match(new RegExp('===' + a + '===\\s*([\\s\\S]*?)(?====' + b + '===|===끝===)'));
                return m ? m[1].trim() : '';
            };
            var done = seg('오늘한일', '내일할일'), next = seg('내일할일', '이슈'), iss = seg('이슈', '끝');
            if (!done && !next && !iss) throw new Error(T('AI 응답을 알아볼 수 없습니다', 'Could not parse the AI response'));
            // ⚠️ 사람이 고칠 수 있게 **칸에 넣어 줄 뿐** 저장하지 않는다. 저장은 사람이 [저장] 을 누를 때.
            _doc.aiDone = done;
            if (next) _doc.next = next;
            if (iss) _doc.issue = iss;
            aiMarkUsed(date);
            saveDraftLocal();
            render();
            toast('🤖 ' + T('AI가 정리했습니다 — 확인하고 고친 뒤 저장하세요.',
                            'AI tidied it — review, edit, then save.'), 'success', 6000);
        } catch (e) {
            // 1단 결과를 그대로 둔다 — 사다리의 아래 단은 항상 살아 있어야 한다.
            toast('⚠️ ' + T('AI 정리 실패 — 불러온 내용 그대로 쓰시면 됩니다. ', 'AI tidy failed — use the drafted items. ')
                  + (e && e.message ? e.message : ''), 'warning', 8000);
            if (window._issueLog) {
                try { window._issueLog({ domain: 'daily-report', kind: 'ai_tidy_failed', result: { errorRaw: String(e && e.message) } }); }
                catch (e2) { /* 기록 실패는 무시 */ }
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🤖 ' + T('AI로 정리', 'Tidy with AI'); }
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 7-B. [2단계] 이슈 → 업무 행에 반영 → **주간보고에 자동으로 뜬다**
    // ══════════════════════════════════════════════════════════════════════
    // 주간보고(js/20)는 content 의 `[문제점]`/`[대책]` 줄만 읽는다. 그러니 그 줄을 심으면
    // js/20 은 **한 줄도 안 고치고** 일일 이슈가 주간보고 문제점 표에 올라온다.
    window.dailyPromoteIssue = function () {
        var txt = String(_doc.issue || '').trim();
        if (!txt) { toast(T('반영할 이슈가 없습니다.', 'No issue to promote.'), 'info'); return; }
        var gd = window.globalData, ci = window.colIdx || {};
        if (!Array.isArray(gd) || gd.length < 2 || ci.content == null || ci.content === -1) {
            toast(T('이 프로젝트를 먼저 열어주세요 — 이슈를 적을 업무 행이 필요합니다.',
                    'Open the project first — the issue needs a task row.'), 'warning', 7000);
            return;
        }
        // 담긴 업무 중 **지금 열린 프로젝트의 행**만 대상으로 한다(행 번호가 아니라 이름으로 다시 찾는다 —
        // 행은 정렬·추가로 움직인다. 2026-11-04 에 _rowUid 가 통째로 바뀐 걸 봤으니 인덱스는 더더욱 못 믿는다)
        var cands = (_doc.items || []).filter(function (it) {
            return !it.promoted && it.project && it.project === (window.currentDriveFileName || '');
        });
        var target = null, label = '';
        for (var c = 0; c < cands.length && !target; c++) {
            for (var i = 1; i < gd.length; i++) {
                if (gd[i] && rowName(gd[i]) === cands[c].name) { target = gd[i]; label = cands[c].name; cands[c].promoted = true; break; }
            }
        }
        if (!target) {
            toast(T('이슈를 붙일 업무를 찾지 못했습니다 — 이 프로젝트의 업무를 하나 담아주세요.',
                    'Could not find a task in this project to attach the issue to.'), 'warning', 8000);
            return;
        }
        var cur = String(target[ci.content] || '');
        if (cur.indexOf('[문제점]') !== -1) {
            toast(T('그 업무엔 이미 [문제점]이 적혀 있습니다 — 간트에서 직접 고쳐주세요.',
                    'That task already has an issue line — edit it in the Gantt.'), 'warning', 8000);
            return;
        }
        target[ci.content] = (cur ? cur.replace(/\s*$/, '') + '\n' : '') + '[문제점]' + txt.replace(/\n/g, ' ');
        if (window.changeLogs) {
            window.changeLogs.push({ time: new Date().toLocaleString('ko-KR'),
                userName: window.currentUserName || '', rowName: label, colName: '업무 상세내용',
                oldVal: '(없음)', newVal: '[문제점] 일일보고에서 반영' });
        }
        if (window.recalculateSchedules) window.recalculateSchedules();
        if (window.renderTable) window.renderTable();
        saveDraftLocal();
        toast('✅ ' + T('이슈를 「' + label + '」에 반영했습니다 — 주간보고 문제점 표에 올라옵니다. 프로젝트를 저장해주세요.',
                        'Issue attached to "' + label + '" — it will appear in the Weekly Report. Please save the project.'), 'success', 9000);
    };

    // ══════════════════════════════════════════════════════════════════════
    // 7-C. [2단계] 프로젝트를 저장할 때 **오늘 내가 손댄 업무**를 자동 적립
    // ══════════════════════════════════════════════════════════════════════
    // 사람이 이미 하는 동작(저장)에 올라타므로, 프로젝트를 다시 열지 않아도
    // 크로스 프로젝트가 채워진다.
    // ⚠️ 저장을 **기다리게 하지 않고**, 실패를 **저장 실패로 올리지 않는다**(미러 모드 불변식과 같다).
    var _accrueAt = 0;
    var ACCRUE_GAP = 5 * 60 * 1000;      // 자동저장이 3분마다 돈다 — 매번 NAS 에 쓰지 않는다

    window.dailyAccrueTouched = async function (force) {
        if (!force && Date.now() - _accrueAt < ACCRUE_GAP) return;
        if (window._storageMode && window._storageMode() !== 'nas') return;
        _accrueAt = Date.now();
        var date = ymd();
        try {
            await window.dailyLoadRoster();
            var d = window.dailyBuildDraft(date);
            if (!d.touched.length) return;
            var doc = await window.dailyLoad(date) || emptyDoc(date);
            var have = {};
            (doc.items || []).forEach(function (it) { have[it.name] = 1; });
            var added = 0;
            d.touched.forEach(function (t) {
                if (have[t.name]) return;
                doc.items.push({ name: t.name, project: t.project, note: '', auto: true });
                have[t.name] = 1; added++;
            });
            if (!added) return;
            await window.dailySave(doc);
            if (_doc && _doc.date === date) _doc = doc;
            toast('📔 ' + T('오늘 손댄 업무 ' + added + '건을 일일보고에 담았습니다.',
                            'Added ' + added + ' task(s) you touched today to your daily report.'), 'info', 5000);
        } catch (e) {
            // 조용히 접는다 — 프로젝트 저장을 방해하지 않는 게 더 중요하다.
            console.warn('[일일보고] 자동 적립 건너뜀:', e.message);
        }
    };

    (function hookSave() {
        var orig = window.saveToGoogleDrive;
        if (typeof orig !== 'function') return;          // 아직 없으면 그냥 안 건다
        window.saveToGoogleDrive = function () {
            var out = orig.apply(this, arguments);
            try {
                Promise.resolve(out).then(function (ok) {
                    if (ok !== false) setTimeout(function () { window.dailyAccrueTouched(); }, 1200);
                }).catch(function () { /* 저장 실패는 저장 쪽 문제다 */ });
            } catch (e) { /* 적립 때문에 저장이 깨지면 안 된다 */ }
            return out;
        };
    })();

    window.dailyRenderTab = async function () {
        var box = document.getElementById('daily-report-page');
        if (!box) return;
        var date = window._dailyTabDate || ymd();
        var lbl = document.getElementById('daily-day-label');
        if (lbl) lbl.textContent = dayLabel(date);
        if (window._storageMode && window._storageMode() !== 'nas') {
            box.innerHTML = '<div style="padding:18px; color:#b1432f; font-size:13px;">' +
                esc(T('일일보고는 사내 NAS 저장소에서만 동작합니다.', 'Daily report requires the NAS storage backend.')) + '</div>';
            return;
        }
        box.innerHTML = '<div style="padding:18px; color:#888; font-size:12.5px;">⏳ ' + esc(T('불러오는 중…', 'Loading…')) + '</div>';

        // ── 월 보기 — 목록 1콜로 격자만 그리고, 칸을 누를 때 그 날로 간다 ──────────
        if (window._dailyView === 'month') {
            var byKeyM, rosterM;
            try {
                rosterM = await window.dailyLoadRoster(true);
                byKeyM = await window.dailyLoadMonth(date);
            } catch (e2) {
                box.innerHTML = '<div style="padding:18px; color:#b1432f; font-size:13px;">⚠️ ' + esc(e2.message) + '</div>';
                return;
            }
            var peopleM = (rosterM && rosterM.length) ? rosterM.filter(function (m) { return m && m.active !== false; })
                : Object.keys(byKeyM).map(function (k) { return { key: k, name: k }; });
            var daysM = monthDays(date);
            var th = '<th style="padding:5px 7px; border:1px solid #cfe3e5; font-size:11.5px; color:#2c5f8a; white-space:nowrap;">' + esc(T('이름', 'Name')) + '</th>'
                + daysM.map(function (d) {
                    var off = offDay(d);
                    return '<th style="padding:4px 2px; border:1px solid #cfe3e5; font-size:10.5px; color:' + (off ? '#c0c0c0' : '#2c5f8a') + ';">' + (+d.slice(8)) + '</th>';
                }).join('');
            var trs = peopleM.map(function (p) {
                return '<tr><td style="padding:5px 7px; border:1px solid #e3e6ea; font-size:12px; font-weight:bold; white-space:nowrap;">' + esc(p.name || p.key) + '</td>'
                    + daysM.map(function (d) {
                        var off = offDay(d), has = !!(byKeyM[p.key] && byKeyM[p.key][d]);
                        var bg = off ? '#f6f7f8' : (has ? '#eaf6ec' : '#fdf0ee');
                        var mk = off ? '' : (has ? '✓' : '·');
                        return '<td onclick="window._dailyGoDay(\'' + d + '\')" title="' + d + '" style="cursor:pointer; text-align:center; padding:3px 0; border:1px solid #e3e6ea; background:' + bg + '; font-size:11px; color:' + (has ? '#2f7d3a' : '#b1432f') + ';">' + mk + '</td>';
                    }).join('') + '</tr>';
            }).join('');
            box.innerHTML =
                '<div style="margin-bottom:9px; font-size:12.5px; color:#555;">' + esc(T('월 보기 — 칸을 누르면 그 날로 갑니다. 회색은 주말·공휴일입니다.',
                    'Month view — click a cell to open that day. Grey = weekend/holiday.')) + '</div>' +
                '<div style="overflow-x:auto;"><table style="border-collapse:collapse;"><thead><tr style="background:#eef6f7;">' + th + '</tr></thead>' +
                '<tbody>' + (trs || '<tr><td style="padding:16px; color:#aaa;">' + esc(T('이 달에 작성된 보고가 없습니다.', 'No reports this month.')) + '</td></tr>') + '</tbody></table></div>';
            return;
        }

        var roster, docs;
        try {
            roster = await window.dailyLoadRoster(true);
            docs = await window.dailyLoadDay(date);
        } catch (e) {
            box.innerHTML = '<div style="padding:18px; color:#b1432f; font-size:13px;">⚠️ ' + esc(e.message) + '</div>';
            return;
        }
        var byKey = {};
        docs.forEach(function (d) { byKey[String(d.key || '').toLowerCase()] = d; });
        // 명단이 비어 있으면 **쓴 사람만** 보여준다 — 없는 명단을 "전원 미작성"으로 말하면 안 된다.
        var people = (roster && roster.length)
            ? roster.filter(function (m) { return m && m.active !== false; })
            : docs.map(function (d) { return { key: d.key, name: d.name || d.key, team: d.team || '' }; });

        var rows = people.map(function (p) {
            var d = byKey[String(p.key || '').toLowerCase()];
            var typ = d ? (window.DAILY_DAY_TYPES.filter(function (t) { return t.key === d.dayType; })[0] || {}) : null;
            var typeTxt = typ ? (window._currentLang === 'en' ? typ.en : typ.ko) : '';
            // ⚠️ AI 정리본이 있으면 그걸 보여준다 — 사람이 마지막으로 고친 글이 곧 보고 내용이다.
            var done = d ? (String(d.aiDone || '').trim() || (d.items || []).map(function (it) {
                return '• ' + it.name + (it.note ? ' — ' + it.note : '');
            }).join('\n')) : '';
            var td = 'padding:7px 9px; border:1px solid #e3e6ea; vertical-align:top; font-size:12px;';
            if (!d) {
                return '<tr style="background:#fff8f8;"><td style="' + td + ' white-space:nowrap; font-weight:bold;">' + esc(p.name || p.key) + '</td>' +
                       '<td style="' + td + '" colspan="4"><span style="color:#b1432f; font-weight:bold;">' + esc(T('미작성', 'Not written')) + '</span></td></tr>';
            }
            return '<tr><td style="' + td + ' white-space:nowrap; font-weight:bold;">' + esc(p.name || p.key) + '</td>' +
                   '<td style="' + td + ' white-space:nowrap;">' + esc(typeTxt) + '</td>' +
                   '<td style="' + td + ' white-space:pre-line;">' + esc(done || '-') + '</td>' +
                   '<td style="' + td + ' white-space:pre-line;">' + esc(d.next || '-') + '</td>' +
                   '<td style="' + td + ' white-space:pre-line;' + (d.issue ? ' background:#fffaf0;' : '') + '">' + esc(d.issue || '-') + '</td></tr>';
        }).join('');

        var written = people.filter(function (p) { return byKey[String(p.key || '').toLowerCase()]; }).length;
        box.innerHTML =
          '<div style="margin-bottom:9px; font-size:12.5px; color:#555;">' +
            esc(T('작성 ', 'Written ')) + '<b>' + written + '</b> / ' + people.length +
            (roster && roster.length ? '' : ' <span style="color:#b1432f;">' + esc(T('(명단 파일이 없어 쓴 사람만 보입니다)', '(no roster file — showing authors only)')) + '</span>') +
          '</div>' +
          '<table style="width:100%; border-collapse:collapse; table-layout:fixed;">' +
            '<colgroup><col style="width:90px;"><col style="width:62px;"><col><col style="width:22%;"><col style="width:22%;"></colgroup>' +
            '<thead><tr style="background:#eef6f7;">' +
              ['이름|Name', '종류|Type', '오늘 한 일|Done', '내일 할 일|Tomorrow', '막힌 것|Issues'].map(function (h) {
                  var p = h.split('|');
                  return '<th style="padding:7px 9px; border:1px solid #cfe3e5; font-size:12px; color:#2c5f8a;">' + esc(window._currentLang === 'en' ? p[1] : p[0]) + '</th>';
              }).join('') +
            '</tr></thead><tbody>' + (rows || '<tr><td colspan="5" style="padding:16px; text-align:center; color:#aaa; font-size:12.5px;">' + esc(T('이 날짜에 작성된 보고가 없습니다.', 'No reports for this date.')) + '</td></tr>') + '</tbody></table>';
    };
})();
