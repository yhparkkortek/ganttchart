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
    var _roster = null;
    window.dailyLoadRoster = async function (force) {
        if (_roster && !force) return _roster;
        try {
            var o = await window.nasAppFile.get(window.DAILY_PATHS.roster, { json: true });
            _roster = (o && Array.isArray(o.members)) ? o.members : [];
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
        window.DAILY_FIELDS.filter(function (f) { return f.src === 'human'; }).map(function (f) {
            return '<div style="margin-bottom:10px;">' +
              '<div style="font-size:12.5px; font-weight:bold; color:#333; margin-bottom:3px;">' + esc(window._currentLang === 'en' ? f.en : f.ko) + '</div>' +
              '<textarea rows="' + f.rows + '" oninput="window._dailyField(\'' + f.key + '\', this.value)" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ddd; border-radius:6px; font-size:12px; font-family:inherit; resize:vertical;">' + esc(_doc[f.key] || '') + '</textarea>' +
            '</div>';
        }).join('')
    ) +
  '</div>' +
  '<div style="flex-shrink:0; padding:10px 17px; border-top:1px solid #eee; display:flex; align-items:center; gap:8px;">' +
    '<span style="flex:1; font-size:11px; color:#999;">' + esc(_doc.savedAt ? T('마지막 저장 ', 'Saved ') + new Date(_doc.savedAt).toLocaleString('ko-KR') : T('아직 저장 안 됨', 'Not saved yet')) + '</span>' +
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

    window.dailyShiftDay = function (n) {
        var d = new Date((window._dailyTabDate || ymd()) + 'T00:00:00');
        if (n === 0) window._dailyTabDate = ymd();
        else { d.setDate(d.getDate() + n); window._dailyTabDate = ymd(d); }
        window.dailyRenderTab();
    };

    window.dailyOnTabShown = function () {
        if (!window._dailyTabDate) window._dailyTabDate = ymd();
        window.dailyRenderTab();
    };

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
            var done = d ? (d.items || []).map(function (it) {
                return '• ' + it.name + (it.note ? ' — ' + it.note : '');
            }).join('\n') : '';
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
