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
        // `itemKey` = **업무 하나**에서 쓰는 칸 이름(2026-11-05: 보고는 업무별로 쪼갰다).
        //  ⚠️ `done` 만 이름이 다르다 — 항목에 이미 `note` 로 들어가 있던 칸이라
        //     이름을 바꾸면 **옛 보고의 글이 통째로 안 보인다.**
        { key: 'done',  itemKey: 'note',  ko: '오늘 한 일',   en: 'Done today',  src: 'auto',  rows: 3 },
        { key: 'next',  itemKey: 'next',  ko: '해야 할 일',   en: 'To do',       src: 'human', rows: 2 },
        { key: 'issue', itemKey: 'issue', ko: '막힌 일',      en: 'Blockers',    src: 'human', rows: 2 }
    ];

    window.DAILY_POLICY = window.DAILY_POLICY || {
        dueAt: '17:00',          // 3단계 알림이 쓸 마감 — 지금은 화면 안내에만 쓴다
        autoOpenModal: false,    // ⚠️ 켜면 프로젝트 목록 자동열기(STORAGE_POLICY)와 팝업이 겹친다
        draftKey: 'gantt_daily_draft_v1',
        keepMonths: 24,
        aiPerDay: 1,             // 2단계에서 쓸 상한(1단계는 AI 호출이 없다)
        // 📎 첨부 — 한계값은 전부 여기(코드에 박지 않는다)
        fileMaxMB: 20,           // 한 파일 상한. 텔레그램 봇 내려받기도 20MB 가 천장이다
        filesMax: 12,            // 한 보고당 개수 상한
        imgMaxPx: 2000           // 사진은 긴 변을 이만큼으로 줄여 올린다(0 = 원본 그대로)
    };

    /**
     * 🗂 여러 프로젝트 훑기 — 한계값은 전부 여기(코드에 박지 않는다).
     *
     * ⚠️ 간트는 **지금 열린 프로젝트 하나**만 메모리에 있다. 그런데 사람은 여러 개를 맡는다
     *    (실측: 개발3팀 12건 중 5건이 한 사람 앞). 열린 것만 보면 나머지 업무가 **오류 없이**
     *    빠진다 — 사람은 "오늘 한 게 없네" 로 읽는다.
     * ⚠️ 싼 일이 아니다(실측 1.26MB·130ms/건, 팀 전체 22MB). 그래서
     *    ① 모달은 **열린 프로젝트로 먼저 그리고** 나머지는 뒤에서 채운다
     *    ② 파일마다 `updated_at` 로 캐시한다(안 바뀌었으면 다시 안 읽는다)
     *    ③ 한 건씩 차례로 읽는다(한꺼번에 던지면 NAS 가 느려진다).
     */
    window.DAILY_SCAN = window.DAILY_SCAN || {
        otherProjects: true,     // 끄면 지금까지처럼 열린 프로젝트만 본다
        maxProjects: 30,         // 한 번에 훑을 프로젝트 수 상한
        myTeamOnly: true,        // 남의 팀 폴더는 어차피 ACL 로 막힌다(407)
        skipCompleted: true,     // 끝난 프로젝트는 오늘 일이 없다
        // 🙋 **내가 들어 있는 프로젝트만** 후보로 쓴다.
        //   ⚠️ 색인의 `assignee`(프로젝트담당자)만 보면 내가 **HW담당자로만** 들어간 프로젝트를
        //      놓친다 — 색인엔 역할별 담당자가 없다. 그래서 파일을 열어 `projectMeta` 로도 본다.
        //      (실측: 개발3팀 12건 중 내가 든 건 5건, 전부 프로젝트담당자였다. 그래도 역할만
        //       맡은 경우를 색인으로는 알 수 없으므로 확인은 파일에서 한다.)
        //   ⚠️ 끄면 팀의 모든 프로젝트 업무가 후보에 뜬다(실측 170건 중 154건이 남의 일이었다).
        onlyMyProjects: true,
        maxCandidates: 80        // 후보 목록에 한 번에 보일 수 상한(여러 프로젝트가 섞인다)
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
        // 📎 첨부 **바이트는 보고 JSON 밖**에 둔다 — 메일 원문을 밖으로 뺀 js/54 와 같은 이유다.
        //    JSON 에 base64 로 넣으면 한 사람 하루 파일이 수 MB 가 되고, 그만큼이
        //    "읽고‑고쳐‑통째로 쓰기" 한 번에 날아갈 양이 된다(2026-11-04 색인 유실의 모양).
        // ⚠️ 폴더 이름은 `files` — **글자로 시작한다.** 날짜로 폴더를 만들면
        //    위 월 폴더 주석의 그 함정(숫자로 시작하는 폴더는 DSM 이 거부)을 다시 밟는다.
        //    그래서 폴더는 한 달에 하나뿐이고, 파일 이름에 날짜·계정을 싣는다.
        filesDir: function (ymd) { return window.DAILY_PATHS.month(ymd) + '/files'; },
        fileRel: function (ymd, key, safeName) {
            return window.DAILY_PATHS.filesDir(ymd) + '/' + ymd + '__' + key + '__' + safeName;
        },
        /** NAS 가 받아들이는 이름으로 눕힌다. 확장자는 지킨다(종류 판정이 이름을 본다). */
        safeName: function (name) {
            var n = String(name || '').replace(/[\\/]+/g, '_').replace(/[\x00-\x1f]/g, '')
                      .replace(/["*:<>?|]/g, '_').replace(/^\.+/, '').trim();
            if (!n) n = 'file';
            if (n.length > 90) {                       // 긴 이름은 확장자를 살려 두고 자른다
                var dot = n.lastIndexOf('.');
                var ext = (dot > 0 && n.length - dot <= 12) ? n.slice(dot) : '';
                n = n.slice(0, 90 - ext.length) + ext;
            }
            return n;
        },
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
    // 요일 이름은 **데이터**로 — 코드에 한글만 박아 두면 영문 모드에서 `2026-11-05 (목)` 이 남는다.
    var DAY_NAMES = { ko: ['일', '월', '화', '수', '목', '금', '토'],
                      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
    function dayLabel(s) {
        var d = new Date(s + 'T00:00:00');
        var names = DAY_NAMES[window._currentLang === 'en' ? 'en' : 'ko'];
        return s + ' (' + names[d.getDay()] + ')';
    }
    window._dailyYmd = ymd;

    // 🪪 NAS 계정 id — 파일 이름의 **유일한** 근거. 한 번 확인하면 들고 있는다.
    var _acct = null;

    /**
     * 파일 이름에 쓸 내 키 — **NAS 계정 id**. 모르면 **빈 문자열**(쓰지 않는다).
     *
     * ⚠️⚠️ [2026-11-05 실측 사고] 전엔 `window.currentUserName` 을 썼다. 그건 **표시용 이름**이라
     *   ① NAS 신원 확보가 늦거나 실패하면 `'비로그인 (로컬)'` 이 그대로 들어오고
     *   ② js/09 로 사람이 넣은 **한글 실명**('박용훈', '로컬 사용자 (PC)')이 들어온다.
     *   둘 다 아래 ascii 치환에서 **전부 깎여** 빈 문자열이 되고, 예전 코드는 그걸
     *   `'unknown'` 으로 떨어뜨렸다 → 파일이 `<날짜>__unknown.json` 하나가 되어
     *   **팀원 전원이 한 파일을 함께 쓴다.** 이 설계의 단 하나뿐인 불변식
     *   ("한 파일에 쓰는 사람은 한 명")이 조용히 깨지는 모양이고,
     *   그게 바로 11-04 에 `project_index.json` 을 날린 그 모양이다.
     *   → 근거는 `window._nasAccount`(js/57 이 `/nas/status` 에서 받아 드러낸다) 하나.
     *     **모르면 'unknown' 으로 떨어지지 않고 빈 값을 주고, 쓰기 쪽이 거부한다.**
     */
    /** 계정id 로 쓸 수 있게 눕힌다. ⚠️ 주소록에서 메일로 추정할 때도 **같은 함수**를 쓴다 —
     *  두 벌이면 `Y.Park` 과 `y-park` 처럼 갈라져 같은 사람이 두 줄로 보인다. */
    function keyClean(raw) {
        return String(raw || '').trim().toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    window._dailyKeyClean = keyClean;

    function myKey() {
        return keyClean(_acct || window._nasAccount || '');
    }
    window._dailyMyKey = myKey;

    /**
     * NAS 계정을 확보한다(1회·캐시). **쓰기·초안·화면 전에 반드시 await.**
     * 어댑터가 부팅 때 못 받았을 수 있다(백엔드가 그 순간 재시작 중이면 실제로 그렇다 — 실측).
     * 그래서 여기서 한 번 더 묻는다. 그래도 모르면 빈 문자열을 돌려준다(막는 건 부르는 쪽).
     */
    window.dailyEnsureIdentity = async function () {
        if (myKey()) return myKey();
        try {
            var r = await fetch('http://127.0.0.1:5000/nas/status?_cb=' + Date.now(), { cache: 'no-store' });
            var s = await r.json();
            if (s && s.ok && s.user) {
                _acct = String(s.user);
                if (!window._nasAccount) window._nasAccount = _acct;
            }
        } catch (e) {
            console.warn('[일일보고] 계정 확인 실패:', e.message);
        }
        return myKey();
    };

    /** 쓰기 직전 관문 — 계정을 모르면 **쓰지 않는다**. */
    function requireKey() {
        var k = myKey();
        if (!k) {
            throw new Error(T('내 계정을 알 수 없어 저장하지 않았습니다 — NAS 에 로그인됐는지 🔑 설정에서 확인하고 새로고침해주세요.',
                              'Not saved: your account is unknown. Check the NAS login (🔑 settings) and reload.'));
        }
        return k;
    }
    window._dailyRequireKey = requireKey;

    // ══ 📒 명단은 **주소록에서 저절로** 만들어진다 (2026-11-05 요청) ═══════════
    //  "팀원이 전부 기본으로 보여줘야 함" · "텔레그램 chat id 는 주소록에 이미 적었다".
    //  맞다 — 같은 값을 두 곳에 적게 하면 **한쪽은 반드시 낡는다.** 주소록이 원본이고
    //  `_roster.json` 은 **거기 없는 것만** 든다(📣 담당·사용 안 함·별칭·계정id 교정).
    //
    //  실측(2026-11-05, 실제 주소록 394명):
    //   ⚠️ 주소록은 **전사**다 — 부서로 거르지 않으면 남의 팀 380명이 전부 '미작성'으로 뜬다.
    //   ⚠️ 이름이 부서와 같은 행은 사람이 아니라 **그룹 메일 주소**다(`개발3팀`).
    //   ⚠️ 계정id 는 **메일 @ 앞부분**으로 본다 — 메일·그룹웨어가 같은 체계라는 건 이미
    //      확인된 전제이고(docs/groupware.md), NAS 계정도 같다(실측: 박용훈 → `yhpark`,
    //      이 PC 의 `window._nasAccount` 와 일치). **한 명으로 확인한 규칙**이므로,
    //      틀렸을 때 조용하지 않도록 하루 보기가 **명단에 없는 작성자도** 같이 보여 준다.
    window.DAILY_ROSTER_SRC = window.DAILY_ROSTER_SRC || {
        teamField: 'dept',          // 주소록의 부서 칸
        mailField: 'email',
        tgField: 'telegramId',      // 사람이 이미 적어 둔 텔레그램 chat id
        /** 사람이 아닌 행(그룹 주소)인가. */
        isGroupRow: function (p) {
            var n = String((p && p.name) || '').trim();
            var d = String((p && p.dept) || '').trim();
            return !n || (!!d && n === d);
        }
    };

    function addrRows() {
        var ab = (window.tabData && window.tabData.addressBook);
        if (!Array.isArray(ab) || !ab.length) {
            try { ab = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : []; }
            catch (e) { ab = []; }
        }
        return Array.isArray(ab) ? ab : [];
    }

    function keyFromMail(mail) {
        return keyClean(String(mail || '').split('@')[0]);
    }

    /** 내 팀 — 주소록에서 내 계정으로 찾는다. 못 찾으면 명단 파일에 적힌 값. */
    function myTeam(filed) {
        var k = myKey();
        if (k) {
            var rows = addrRows();
            for (var i = 0; i < rows.length; i++) {
                if (keyFromMail(rows[i] && rows[i][window.DAILY_ROSTER_SRC.mailField]) === k) {
                    return String(rows[i][window.DAILY_ROSTER_SRC.teamField] || '').trim();
                }
            }
        }
        var mine = (filed || []).filter(function (m) {
            return m && String(m.key || '').toLowerCase() === k;
        })[0];
        return (mine && String(mine.team || '').trim()) || '';
    }

    /** 주소록 → 우리 팀 사람들. 팀을 모르면 **아무도 안 넣는다**(전사 394명을 띄울 순 없다). */
    window.dailyRosterFromAddressBook = function (team) {
        var S = window.DAILY_ROSTER_SRC;
        var t = String(team || '').trim();
        if (!t) return [];
        var out = [];
        addrRows().forEach(function (p) {
            if (!p || S.isGroupRow(p)) return;
            if (String(p[S.teamField] || '').trim() !== t) return;
            var k = keyFromMail(p[S.mailField]);
            if (!k) return;                       // 메일이 없으면 파일 이름을 못 만든다
            out.push({
                key: k, name: String(p.name || '').trim(), team: t,
                aliases: [], tgChatId: String(p[S.tgField] || '').trim(),
                active: true, fromAddr: true
            });
        });
        return out;
    };

    /**
     * 명단 파일 + 주소록을 합친다.
     * ⚠️ **사람이 적은 값이 이긴다** — 파일에 있는 항목은 빈 칸만 주소록으로 채운다
     *    (📣·사용 안 함·별칭·교정한 계정id 를 덮으면 그 설정이 조용히 사라진다).
     */
    function mergeRoster(filed) {
        var out = (filed || []).map(function (m) { return Object.assign({}, m); });
        var byKey = {};
        out.forEach(function (m) { byKey[String(m.key || '').toLowerCase()] = m; });
        window.dailyRosterFromAddressBook(myTeam(filed)).forEach(function (a) {
            var hit = byKey[a.key];
            if (!hit) { out.push(a); byKey[a.key] = a; return; }
            if (!String(hit.name || '').trim()) hit.name = a.name;
            if (!String(hit.team || '').trim()) hit.team = a.team;
            if (!String(hit.tgChatId || '').trim()) hit.tgChatId = a.tgChatId;
        });
        return out;
    }

    // ── 명단(roster) — 계정 id ↔ 실명 ↔ 역할 별칭. **PM 한 명만 쓴다.** ─────────
    // ⚠️ 간트에는 담당자 열이 **아예 없다**(실측 12/12). 그래서 "이게 내 일인가"는
    //    역할(`_담당구분`) → `projectMeta.<역할>담당자` → 이 명단으로 잇는다.
    var _roster = null, _rosterRev = null;
    window.dailyLoadRoster = async function (force) {
        if (_roster && !force) return _roster;
        try {
            var o = await window.nasAppFile.get(window.DAILY_PATHS.roster, { json: true });
            _roster = mergeRoster((o && Array.isArray(o.members)) ? o.members : []);
            _rosterRev = (o && o.rev) || 0;
        } catch (e) {
            // 파일을 못 읽어도 **주소록만으로** 팀원을 보여 준다(화면이 비는 것보다 낫다).
            console.warn('[일일보고] 명단 조회 실패 — 주소록만으로 꾸립니다:', e.message);
            _roster = mergeRoster([]);
        }
        return _roster;
    };
    window._dailyRoster = function () { return _roster || []; };

    /**
     * 📣 담당 PC 에서만, 한 페이지에 한 번 — 주소록에서 새로 들어온 팀원을 **명단 파일에 적는다.**
     *
     * ⚠️ 화면은 합쳐서 바로 보이지만 **백엔드는 파일만 본다** — 안 적으면 그 사람이 텔레그램으로
     *    보낸 보고가 "등록되지 않은 chat_id" 로 버려지고, 미작성 알림도 안 간다.
     * ⚠️ 쓰는 PC 를 한 대로 묶는 이유: 팀 공용 파일에 여러 브라우저가 동시에 쓰는 것이 곧
     *    2026-11-04 색인 유실의 전제였다. 📣 는 정의상 한 대다.
     * ⚠️ **더하기만** 한다. rev 가 안 맞으면(남이 먼저 썼으면) 조용히 넘어간다 — 다음에 또 온다.
     */
    var _rosterSynced = false;
    window.dailyRosterSyncIfNotifier = async function () {
        if (_rosterSynced) return null;
        _rosterSynced = true;
        var list = _roster || [];
        var k = myKey();
        var mine = list.filter(function (m) { return String(m.key || '').toLowerCase() === k; })[0];
        if (!mine || !mine.notifier) return null;              // 📣 담당 PC 가 아니면 안 쓴다
        var added = list.filter(function (m) { return m && m.fromAddr; });
        if (!added.length) return null;                        // 더할 게 없으면 안 쓴다
        try {
            var cur = await window.nasAppFile.get(window.DAILY_PATHS.roster, { json: true });
            if (cur && _rosterRev != null && (cur.rev || 0) !== _rosterRev) return null;
            var members = list.map(function (m) {
                var c = Object.assign({}, m);
                delete c.fromAddr;                             // 파생 표식은 파일에 안 남긴다
                return c;
            });
            if (!members.length) return null;
            var doc = { members: members, rev: ((cur && cur.rev) || 0) + 1,
                        savedAt: new Date().toISOString(), by: k, fromAddressBook: true };
            await window.nasAppFile.put(window.DAILY_PATHS.roster, doc);
            _roster = members;
            _rosterRev = doc.rev;
            toast('👥 ' + T('주소록에서 팀원 ' + added.length + '명을 명단에 담았습니다.',
                            'Added ' + added.length + ' teammate(s) from the Address Book.'), 'info', 6000);
            return doc;
        } catch (e) {
            console.warn('[일일보고] 명단 자동 반영 건너뜀:', e.message);
            return null;
        }
    };



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

    /** 지금 열린 프로젝트 이름. ⚠️ 파일 이름이라 `.json` 이 붙어 있다 — 사람에게 보일 땐 뗀다. */
    function projName() {
        var s = window.currentDriveFileName
             || (window.projectMeta && window.projectMeta.프로젝트명) || '';
        return String(s).replace(/\.json$/i, '').trim();
    }
    window._dailyProjName = projName;

    /** 간트 행의 업무 구분(HW·FW·ME…). ⚠️ `SAL`↔`영업` 처럼 같은 뜻 다른 글자가 섞여 있어
     *  반드시 `_normalizeWbsDiscipline` 을 거친다(js/04k, 별칭표도 거기 데이터). */
    function catOf(row) {
        var raw = (row && row._담당구분) || '';
        if (!raw && typeof window._extractDisciplineFromContent === 'function') {
            try { raw = window._extractDisciplineFromContent(row) || ''; } catch (e) { raw = ''; }
        }
        if (!raw) return '';
        return (typeof window._normalizeWbsDiscipline === 'function')
            ? String(window._normalizeWbsDiscipline(raw) || '').trim()
            : String(raw).trim();
    }

    /** 항목 한 줄 — **화면·엑셀이 같은 모양**을 쓰도록 한 곳에서 만든다. */
    function itemLine(it) {
        var cat = String((it && it.cat) || '').trim();
        var pj = String((it && it.project) || '').replace(/\.json$/i, '').trim();
        var s = '• ' + (cat ? '[' + cat + '] ' : '') + String((it && it.name) || '');
        if (pj) s += ' (' + pj + ')';
        if (it && it.note) s += ' — ' + it.note;
        return s;
    }
    window._dailyItemLine = itemLine;

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

    /**
     * 역할(`HW`·`PM`…) → 그 프로젝트의 담당자 이름.
     *
     * ⚠️ `_msResolveCategoryAssignee`(js/15b)는 **지금 열린 프로젝트**의 `window.projectMeta` 를
     *    읽는다 — 다른 프로젝트 파일을 훑을 땐 그걸 쓰면 **엉뚱한 사람**이 나온다. 그래서 역할→칸
     *    이름 카탈로그(`_MS_CATEGORY_FIELD_MAP`)만 빌려 쓰고 meta 는 인자로 받는다.
     */
    function catAssignee(cat, meta, members3) {
        var raw = String(cat || '').trim();
        if (!raw || raw === '미분류') return '';
        var fixed = (window._MS_CATEGORY_FIELD_MAP || {})[raw];
        if (fixed) {
            var nm = String((meta || {})[fixed.name] || '').trim();
            if (nm) return nm;
        }
        var hit = (members3 || []).filter(function (m) {
            return m && m.role && String(m.role).indexOf(raw) !== -1 && m.name;
        })[0];
        return hit ? String(hit.name).trim() : '';
    }

    /** `_담당구분` 으로 "이게 내 일인가"를 본다. 못 가리면 **제외하지 않고** false 만 돌려준다. */
    function isMine(row, ctx) {
        var names = myNames();
        if (!Object.keys(names).length) return false;
        var disc = row && row._담당구분;
        if (!disc) return false;
        // ⚠️ `SAL` 과 `영업` 이 같이 있다(실측 362/26) — 정규화 전 비교는 조용히 빗나간다.
        var norm = (typeof window._normalizeWbsDiscipline === 'function')
            ? window._normalizeWbsDiscipline(disc) : disc;
        var cats = String(norm || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        for (var i = 0; i < cats.length; i++) {
            var who = { name: catAssignee(cats[i], (ctx || {}).meta, (ctx || {}).members3) };
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

    /**
     * 오늘 날짜가 걸린 리프 행 → 초안 후보. **한 프로젝트분.**
     *
     * `ctx` = { rows, ci, meta, members3, logs, project } — 열린 프로젝트든 NAS 에서 읽은
     * 파일이든 **같은 함수**로 훑는다. 두 벌로 두면 한쪽만 고쳐져 "열린 것만 맞는다" 가 된다.
     */
    function scanOne(ctx, dateStr) {
        var out = { mine: [], others: [], touched: [] };
        var gd = (ctx || {}).rows;
        var ci = (ctx || {}).ci || {};
        if (!Array.isArray(gd) || gd.length < 2) return out;
        var day = new Date((dateStr || ymd()) + 'T00:00:00').getTime();
        var dayEnd = day + 86400000 - 1;
        var proj = ctx.project || '';
        var catByName = {};        // 업무명 → 구분
        var byNo = {};             // No. 칸 값 → 행 (변경이력이 남기는 게 이 값이다)

        // No. 지도는 **전체 행**으로 만든다 — 손댄 업무가 오늘 일정이 아닐 수 있다.
        if (ci.no != null && ci.no !== -1) {
            for (var n0 = 1; n0 < gd.length; n0++) {
                var r0 = gd[n0];
                if (!r0) continue;
                var v0 = String(r0[ci.no] == null ? '' : r0[ci.no]).trim();
                if (v0 && !byNo[v0]) byNo[v0] = r0;
            }
        }
        for (var i = 1; i < gd.length; i++) {
            var row = gd[i];
            if (!row) continue;
            var lvl = (typeof row._level === 'number') ? row._level : 4;
            var nx = gd[i + 1];
            var nlvl = (nx && typeof nx._level === 'number') ? nx._level : -1;
            if (nx && nlvl > lvl) continue;                       // 리프만
            // ⚠️ `_calcStartTs/_calcPlanTs` 는 저장 파일에도 들어 있다(실측) — 그래도 없을 때를
            //    대비해 날짜 **칸**으로 떨어진다(저장 때 그 칸에도 같은 값이 적힌다, js/04e).
            var s = row._calcStartTs, e = row._calcPlanTs;
            if (!s && ci.start != null && ci.start !== -1) s = tsOf(row[ci.start]);
            if (!e && ci.plan != null && ci.plan !== -1) e = tsOf(row[ci.plan]);
            if (!s && !e) continue;
            if (!((s || e) <= dayEnd && (e || s) >= day)) continue;
            var nm = rowName(row);
            if (!nm) continue;
            if (!catByName[nm]) catByName[nm] = catOf(row);
            var content = (ci.content != null && ci.content !== -1) ? String(row[ci.content] || '') : '';
            var p = window._mailContentParse(content);
            var item = {
                idx: i, name: nm, project: proj, cat: catByName[nm] || '',
                status: (ci.status != null && ci.status !== -1) ? String(row[ci.status] || '') : '',
                core: oneLine(p.core, 140),
                todo: oneLine(p.todo, 120),
                issue: p.issue ? oneLine(p.issue, 120) : '',
                isMail: p.isMail,
                late: !!(e && e < day && String((ci.status !== -1 && row[ci.status]) || '') !== '완료')
            };
            (isMine(row, ctx) ? out.mine : out.others).push(item);
        }

        // 🚨 [2026-11-05 신고] 자동 적립에 `8` `851` `849` `NO` `고객` 같은 게 담겼다.
        //    범인: **`changeLogs.rowName` 은 업무명이 아니다.** `logChange`(js/04i)가 거기에
        //    넣는 건 **No. 칸 값**(또는 그 칸의 글자)이고, 어떤 기록은 아예 **행 인덱스**를 넣는다
        //    (js/04g `rowName: rowIndex` · js/14d `rowName: pos` · js/04d `rowName: i`).
        //    그래서 그걸 업무명으로 믿은 옛 코드는 번호를 그대로 보고에 적었다.
        //    → **No. 로 보고 간트에서 되찾는다.** 못 찾으면 **담지 않는다**(추측하지 않는다).
        // 오늘 내가 손댄 업무 — changeLogs 는 `toLocaleString('ko-KR')` 문자열이다.
        var logs = ctx.logs || [];
        var names = myNames();
        var seen = {};
        var dd = new Date((dateStr || ymd()) + 'T00:00:00');
        var stamp = dd.getFullYear() + '. ' + (dd.getMonth() + 1) + '. ' + dd.getDate() + '.';
        for (var k = logs.length - 1; k >= 0 && out.touched.length < 40; k--) {
            var L = logs[k];
            if (!L || String(L.time || '').indexOf(stamp) !== 0) continue;
            if (!names[String(L.userName || '').trim().toLowerCase()]) continue;
            // ⚠️ 행 자체를 만지는 기록은 `rowName` 에 **인덱스**가 들어온다 — 번호로 오인하면
            //    엉뚱한 업무를 담는다. 그 종류는 통째로 건너뛴다(`DAILY_TOUCH_SKIP_COLS`, 데이터).
            if (window.DAILY_TOUCH_SKIP_COLS.indexOf(String(L.colName || '').trim()) >= 0) continue;
            var no = String(L.rowName == null ? '' : L.rowName).trim();
            var hitRow = byNo[no];
            if (!hitRow) continue;                       // 간트에서 못 찾으면 담지 않는다
            var rn = rowName(hitRow);
            if (!rn || seen[rn]) continue;
            seen[rn] = 1;
            out.touched.push({ name: rn, project: proj, cat: catOf(hitRow),
                               col: String(L.colName || '') });
        }
        return out;
    }

    /** 'YYYY-MM-DD' / 'YYYY.MM.DD' → ts. 못 읽으면 0. */
    function tsOf(v) {
        var s = String(v == null ? '' : v).trim().replace(/[.\/]/g, '-');
        var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return 0;
        return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    }

    /** 지금 열린 프로젝트 — 예전과 똑같이 메모리에서 바로. */
    window.dailyBuildDraft = function (dateStr) {
        return scanOne({
            rows: window.globalData,
            ci: window.colIdx || {},
            meta: window.projectMeta || {},
            members3: (window.tabData && window.tabData.projectMembers3) || [],
            logs: window.changeLogs || [],
            project: projName()
        }, dateStr);
    };

    // ══════════════════════════════════════════════════════════════════════
    // 4-2. 내가 맡은 **다른** 프로젝트도 훑는다 (NAS 파일에서, AI 호출 0회)
    // ══════════════════════════════════════════════════════════════════════

    /** 훑은 결과 — 화면이 열린 프로젝트 것과 합쳐 보여 준다. */
    var _other = { at: '', mine: [], others: [], done: 0, total: 0, busy: false, errs: [] };
    var _projCache = {};        // file_name|updated_at|date → {mine, others}
    window._dailyOtherScan = _other;

    /**
     * 내가 맡은 프로젝트 파일을 차례로 읽어 같은 규칙으로 훑는다.
     *
     * ⚠️ 기다리게 하지 않는다 — 모달은 열린 프로젝트로 이미 그려져 있고, 한 건 끝날 때마다
     *    **후보 목록만** 다시 그린다(`paintCands`). 모달 전체를 다시 그리면 사람이 치던
     *    글자에서 포커스가 날아간다.
     * ⚠️ 실패는 삼키지 않는다 — 못 읽은 프로젝트는 세어서 화면에 드러낸다. 조용히 빠지면
     *    "그 프로젝트 업무가 원래 없는 것" 과 구분할 방법이 없다.
     */
    window.dailyScanOtherProjects = async function (dateStr, force) {
        var S = window.DAILY_SCAN || {};
        if (!S.otherProjects || _other.busy) return _other;
        var date = dateStr || ymd();
        // 같은 날을 이미 다 훑었으면 그냥 돌려준다. `force` 는 "다시 훑어라"(파일 캐시는 그대로
        // 쓰므로, 안 바뀐 프로젝트는 여전히 안 읽는다).
        if (!force && _other.at === date && _other.total && _other.done >= _other.total) return _other;
        _other = { at: date, mine: [], others: [], done: 0, total: 0, kept: 0, busy: true, errs: [] };
        window._dailyOtherScan = _other;
        try {
            var idx = await window.nasAppFile.get('App_Config/project_index.json', { json: true });
            var list = (idx && idx.projects) || [];
            var myTeam = String(me().team || '').trim();
            var open = String(window.currentDriveFileName || '').replace(/\.json$/i, '').trim();
            var todo = list.filter(function (p) {
                if (!p || !p.file_name) return false;
                if (S.skipCompleted && p.completed) return false;
                if (S.myTeamOnly && myTeam && String(p.team || '').trim() !== myTeam) return false;
                return String(p.file_name).replace(/\.json$/i, '').trim() !== open;
            }).slice(0, +S.maxProjects || 30);
            _other.total = todo.length;
            _other.kept = 0;
            paintCands();
            for (var i = 0; i < todo.length; i++) {
                var p = todo[i];
                try {
                    var got = await scanProjectFile(p, date);
                    if (got.skipped) { _other.done++; paintCands(); continue; }
                    _other.kept++;
                    _other.mine = _other.mine.concat(got.mine);
                    _other.others = _other.others.concat(got.others);
                } catch (e) {
                    _other.errs.push(String(p.file_name) + ' — ' + e.message);
                    if (window._issueLog) {
                        try { window._issueLog({ domain: 'daily-report', kind: 'scan_project_failed',
                                                 result: { errorRaw: e.message, file: p.file_name } }); }
                        catch (e2) { /* 기록 실패가 훑기를 막지는 않는다 */ }
                    }
                }
                _other.done++;
                paintCands();
            }
        } catch (e) {
            _other.errs.push(T('프로젝트 목록을 못 읽었습니다: ', 'Could not read the project index: ') + e.message);
        }
        _other.busy = false;
        paintCands();
        return _other;
    };

    /** 프로젝트 파일 한 개 — `updated_at` 이 그대로면 다시 안 읽는다. */
    async function scanProjectFile(entry, date) {
        var key = entry.file_name + '|' + (entry.updated_at || '') + '|' + date;
        if (_projCache[key]) return _projCache[key];
        var rel = (entry.team ? entry.team + '/' : '') + entry.file_name;
        var d = await window.nasAppFile.get(rel, { json: true });
        if (!d || !Array.isArray(d.globalData)) throw new Error(T('내용을 읽지 못했습니다', 'unreadable'));
        // 🙋 내가 든 프로젝트인가 — 색인의 담당자 **또는** 그 파일의 역할별 담당자.
        if ((window.DAILY_SCAN || {}).onlyMyProjects && !iAmIn(entry, d)) {
            _projCache[key] = { mine: [], others: [], skipped: true };
            return _projCache[key];
        }
        var rows = (typeof window._deserializeGlobalDataForMerge === 'function')
            ? window._deserializeGlobalDataForMerge(d.globalData) : null;
        if (!rows) throw new Error(T('행을 복원하지 못했습니다', 'cannot restore rows'));
        var got = scanOne({
            rows: rows,
            ci: d.colIdx || {},
            meta: d.projectMeta || {},
            members3: (d.tabData && d.tabData.projectMembers3) || [],
            logs: [],                       // 다른 프로젝트의 "오늘 손댄 것"은 안 본다 — 내 기록이 아니다
            project: String(entry.file_name).replace(/\.json$/i, '')
        }, date);
        _projCache[key] = got;
        return got;
    }

    /** 이 프로젝트에 내가 들어 있는가 — 색인 담당자 또는 파일의 역할별 담당자/멤버-3. */
    function iAmIn(entry, doc) {
        var names = myNames();
        if (!Object.keys(names).length) return true;   // 내 이름을 모르면 **거르지 않는다**
        function hit(v) {
            var list = (typeof window._addrSplitNames === 'function')
                ? window._addrSplitNames(v) : String(v || '').split(',');
            return list.some(function (x) { return names[String(x || '').trim().toLowerCase()]; });
        }
        if (hit((entry || {}).assignee)) return true;
        var meta = (doc && doc.projectMeta) || {};
        for (var k in meta) {
            if (/담당자$/.test(k) && hit(meta[k])) return true;
        }
        var m3 = (doc && doc.tabData && doc.tabData.projectMembers3) || [];
        return m3.some(function (m) { return m && hit(m.name); });
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. 저장소 — 사람 × 날짜 파일 하나. 쓰는 사람은 **나 하나**.
    // ══════════════════════════════════════════════════════════════════════

    function emptyDoc(dateStr) {
        return { date: dateStr, key: myKey(), name: me().name || '', team: me().team || '',
                 dayType: 'work', items: [], files: [], next: '', issue: '', rev: 0, savedAt: '' };
    }

    window.dailyLoad = async function (dateStr, key) {
        var k = key || myKey();
        // ⚠️ 계정을 모르면 **경로를 만들지 않는다** — `…__.json` 을 읽으러 가면
        //    "없다"로 보이고, 그 뒤 저장이 빈 파일을 새로 만든다.
        if (!k) return null;
        var rel = window.DAILY_PATHS.file(dateStr, k);
        try {
            var o = await window.nasAppFile.get(rel, { json: true });
            if (!o) return null;
            if (!Array.isArray(o.items)) o.items = [];
            if (!Array.isArray(o.files)) o.files = [];
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
        // ⚠️ 이 함수는 **내 파일만** 쓴다(그게 이 설계의 불변식이다). 그래서 `doc.key` 를
        //    믿지 않고 덮어쓴다 — 옛 초안(localStorage)에 `'unknown'` 이 남아 있을 수 있다.
        var _k = requireKey();
        doc.key = _k;
        var rel = window.DAILY_PATHS.file(doc.date, _k);
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
        // 📎 첨부도 내용이다 — 사진만 달아 둔 보고를 "번 것"으로 보면 못 지킨다.
        var hadContent = !!(cur && ((cur.items || []).length || (cur.files || []).length || cur.next || cur.issue));
        var hasContent = !!((doc.items || []).length || (doc.files || []).length || doc.next || doc.issue);
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
        // 🪪 계정을 모르면 쓸 파일이 정해지지 않는다 — 열기 전에 한 번 확보하고,
        //    그래도 모르면 **모달을 열지 않고** 왜 안 되는지 말한다.
        if (!await window.dailyEnsureIdentity()) {
            toast('⚠️ ' + T('내 계정을 알 수 없어 보고를 열 수 없습니다 — NAS 에 로그인됐는지 🔑 설정에서 확인하고 새로고침해주세요.',
                             'Cannot open: your account is unknown. Check the NAS login (🔑 settings) and reload.'), 'warning', 9000);
            return;
        }
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
                // ⚠️⚠️ 초안으로 **통째로 바꾸지 않는다.** 초안은 이 브라우저가 마지막으로 본
                //    모습일 뿐이라, 그 사이 텔레그램으로 들어온 항목·사진이 저장 때 **조용히
                //    사라진다**(읽고-고쳐-통째로 쓰기 = 2026-11-04 색인 유실과 같은 모양).
                //    규칙: 사람이 친 글은 초안이 이기고, **NAS 에만 있는 것은 가져온다.**
                var fromNas = _doc;
                _doc = d.doc;
                _doc.rev = fromNas.rev || 0;                   // rev 는 NAS 기준(충돌 가드가 쓴다)
                _doc.savedAt = fromNas.savedAt || '';
                _doc.files = (fromNas.files || []).slice();    // 📎 바이트는 NAS 가 진실
                if (!Array.isArray(_doc.items)) _doc.items = [];
                var seen = {};
                _doc.items.forEach(function (it) { seen[String(it && it.name)] = 1; });
                (fromNas.items || []).forEach(function (it) {
                    if (!seen[String(it && it.name)]) { _doc.items.push(it); seen[String(it && it.name)] = 1; }
                });
                toast(T('저장 전 초안을 되살렸습니다(그 사이 들어온 내용도 같이 담았습니다).',
                        'Restored your unsaved draft (and merged anything that arrived meanwhile).'), 'info');
            }
        } catch (e) { /* 초안이 깨졌으면 무시 */ }
        await markMissing(_doc);   // 📎 참조가 가리키는 파일이 정말 있는가 (목록 1콜)
        render();
        // 🗂 내가 맡은 **다른** 프로젝트는 뒤에서 채운다 — 기다리게 하지 않는다(await 안 함).
        //    끝날 때마다 후보 목록만 다시 그린다.
        try { window.dailyScanOtherProjects(_date); } catch (e) { /* 훑기 실패가 모달을 막지는 않는다 */ }
    };

    /**
     * 후보 목록(간트에서 불러오기)만 그린다.
     *
     * ⚠️ 모달 전체를 다시 그리면 **사람이 치던 칸에서 포커스가 날아간다** — 다른 프로젝트는
     *    뒤에서 한 건씩 들어오므로, 바뀌는 건 이 목록뿐이다. 그래서 여기만 갈아 끼운다.
     */
    function candHtml() {
        var draft = window.dailyBuildDraft(_date);
        var o = window._dailyOtherScan || { mine: [], others: [], done: 0, total: 0, busy: false, errs: [] };
        var openName = projName();
        // 내 일을 먼저, 그 다음 그 외 — 프로젝트가 섞여도 "내 것" 이 위로 온다.
        var all = [].concat(draft.mine, o.mine || [], draft.others, o.others || []);
        var seen = {};
        var cand = all.filter(function (c) {
            if (!c || !c.name) return false;
            var k = String(c.project || '') + '|' + c.name;
            if (seen[k]) return false;
            seen[k] = 1;
            // ⚠️ 이미 담은 업무는 뺀다 — 담기는 이름으로 하므로 이름으로 본다.
            return !_doc.items.some(function (it) { return it.name === c.name; });
        });
        window._dailyCand = cand;

        var note = '';
        if (o.busy) {
            note = T('다른 프로젝트에서도 찾는 중… ', 'Scanning other projects… ') + o.done + ' / ' + o.total;
        } else if (o.total) {
            // ⚠️ 열린 프로젝트가 **없을 수도 있다** — 무턱대고 +1 하면 안 본 것까지 셌다고 말한다.
            var n = (o.kept || 0) + (openName ? 1 : 0);
            note = T('내 프로젝트 ', 'Scanned ') + n + T('개에서 모았습니다 (팀 ', ' of my projects (team has ') +
                   o.total + T('개 확인)', ')');
        }
        var errTxt = (o.errs && o.errs.length)
            ? '<div style="font-size:11px; color:#b1432f; margin-bottom:4px;">⚠️ ' +
              esc(T('못 읽은 프로젝트 ', 'Could not read ') + o.errs.length + T('개', '')) + ' — ' + esc(o.errs[0]) + '</div>'
            : '';
        var noteTxt = note ? '<div style="font-size:11px; color:#aaa; margin-bottom:4px;">' + esc(note) + '</div>' : '';

        if (!cand.length) {
            return noteTxt + errTxt + '<div style="color:#aaa; font-size:11.5px;">' +
                   esc(T('오늘 날짜가 걸린 업무가 없습니다.', 'No tasks dated today.')) + '</div>';
        }
        var max = +(window.DAILY_SCAN || {}).maxCandidates || 80;
        return noteTxt + errTxt + cand.slice(0, max).map(function (c, i) {
            var pj = String(c.project || '').trim();
            return '<div onclick="window._dailyAdd(' + i + ')" style="cursor:pointer; padding:5px 7px; border:1px solid #eee; border-radius:5px; margin-bottom:4px; background:#fafbfc;" ' +
                   'onmouseover="this.style.background=\'#eef6f7\';" onmouseout="this.style.background=\'#fafbfc\';">' +
                   '<div style="font-size:12px; font-weight:bold; color:#2c5f8a;">+ ' + catBadge(c.cat) + esc(c.name) +
                     (c.isMail ? ' <span title="' + esc(T('메일 분석에서 온 업무', 'From mail analysis')) + '">📧</span>' : '') +
                     (c.late ? ' <span style="color:#b1432f; font-size:10.5px;">' + esc(T('지연', 'late')) + '</span>' : '') +
                     // 📒 어느 프로젝트 것인지 — 여러 프로젝트가 섞이면 이름만으론 못 가린다.
                     (pj && pj !== openName ? ' <span style="color:#888; font-size:10.5px; font-weight:normal;">(' + esc(pj) + ')</span>' : '') +
                   '</div>' +
                   (c.core ? '<div style="font-size:11px; color:#666; margin-top:2px;">' + esc(c.core) + '</div>' : '') +
                   '</div>';
        }).join('');
    }

    function paintCands() {
        var el = document.getElementById('daily-cand');
        if (el) el.innerHTML = candHtml();
    }

    function render() {
        var wrap = document.getElementById('daily-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'daily-modal';
            wrap.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            document.body.appendChild(wrap);
        }
        // 🐞 [2026-11-05 신고] 닫기가 `display:none` 으로 두고 가는데 `flex` 는 **처음 만들
        //    때만** 줬다 — 그래서 한 번 닫은 뒤로는 모달이 영영 안 보였다(DOM 엔 있는데).
        //    여는 건 render 하나뿐이니 **열 때마다 다시 켠다.**
        wrap.style.display = 'flex';
        var types = window.DAILY_DAY_TYPES.map(function (t) {
            var on = _doc.dayType === t.key;
            return '<button onclick="window._dailySetType(\'' + t.key + '\')" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12.5px; border:1px solid ' +
                   (on ? '#a5c8f0' : '#ddd') + '; background:' + (on ? '#e7f3ff' : '#fff') + '; color:' + (on ? '#1971c2' : '#555') + '; font-weight:' + (on ? 'bold' : 'normal') + ';">' +
                   esc(window._currentLang === 'en' ? t.en : t.ko) + '</button>';
        }).join('');

        var exempt = (window.DAILY_DAY_TYPES.filter(function (t) { return t.key === _doc.dayType; })[0] || {}).exempt;

        var chk = _doc.items.map(function (it, i) {
            // 📝 업무 하나가 카드 하나 — 오늘 한 일 / 해야 할 일 / 막힌 일 / 📎 를 **그 업무 밑에** 둔다.
            //    [2026-11-05 요청] 전엔 셋이 보고 전체에 하나씩이라, 업무가 여럿이면 누구 것인지 몰랐다.
            var fields = window.DAILY_FIELDS.map(function (f) {
                return '<div style="display:flex; align-items:center; gap:6px; margin-top:3px;">' +
                       '<span style="flex-shrink:0; width:58px; font-size:10.5px; color:#8a8a8a; text-align:right;">' +
                         esc(window._currentLang === 'en' ? f.en : f.ko) + '</span>' +
                       '<input value="' + esc(it[f.itemKey] || '') + '" ' +
                         'oninput="window._dailyItemField(' + i + ', \'' + f.itemKey + '\', this.value)" ' +
                         'style="flex:1; min-width:0; padding:3px 7px; border:1px solid #e3e6ea; border-radius:5px; font-size:11.5px;">' +
                       (f.key === 'issue'
                         ? '<button onclick="window.dailyPromoteIssue(' + i + ')" title="' +
                             esc(T('이 막힌 일을 그 업무의 [문제점] 줄로 넣습니다 — 주간보고 문제점 표에 올라옵니다',
                                   'Writes this blocker into the task as a [문제점] line — it shows up in the Weekly Report')) +
                           '" style="flex-shrink:0; padding:2px 7px; border:1px solid #cfe3e5; background:#eef6f7; color:#2c5f8a; border-radius:5px; font-size:10.5px; cursor:pointer;">↗️</button>'
                         : '') +
                       '</div>';
            }).join('');
            return '<div data-daily-item="' + i + '" style="display:flex; gap:7px; align-items:flex-start; padding:7px 0; border-bottom:1px solid #f2f2f2;">' +
                   '<button onclick="window._dailyDropItem(' + i + ')" title="' + esc(T('빼기', 'Remove')) + '" style="flex-shrink:0; width:20px; height:20px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:4px; cursor:pointer; font-size:11px; line-height:1;">✕</button>' +
                   '<div style="flex:1; min-width:0;">' +
                     '<div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">' +
                       catSelect(i, it.cat) +
                       '<span style="font-size:12.5px; font-weight:bold; color:#222;">' + esc(it.name) + '</span>' +
                       (it.project ? '<span style="color:#888; font-size:11px;">(' + esc(String(it.project).replace(/\.json$/i, '')) + ')</span>' : '') +
                     '</div>' +
                     fields +
                     filesHtml(it.name, true) +
                   '</div></div>';
        }).join('') || '<div style="color:#aaa; font-size:12px; padding:6px 0;">' + esc(T('아래에서 골라 담거나 직접 추가하세요.', 'Pick below or add manually.')) + '</div>';


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
        '<div id="daily-cand" style="max-height:190px; overflow-y:auto; margin-bottom:14px;">' + candHtml() + '</div>' +
        (_doc.aiDone
          ? '<div style="margin-bottom:10px;">' +
              '<div style="font-size:12.5px; font-weight:bold; color:#1971c2; margin-bottom:3px;">🤖 ' + esc(T('오늘 한 일 (AI 정리본 — 고쳐도 됩니다)', 'Done today (AI draft — editable)')) + '</div>' +
              '<textarea rows="4" oninput="window._dailyField(\'aiDone\', this.value)" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #a5c8f0; background:#f7fbff; border-radius:6px; font-size:12px; font-family:inherit; resize:vertical;">' + esc(_doc.aiDone) + '</textarea>' +
            '</div>'
          : '') +
        legacyEtcHtml()
    ) +
    fileInputHtml() + filesHtml('') +
  '</div>' +
  '<div style="flex-shrink:0; padding:10px 17px; border-top:1px solid #eee; display:flex; align-items:center; gap:8px;">' +
    '<span style="flex:1; font-size:11px; color:#999;">' + esc(_doc.savedAt ? T('마지막 저장 ', 'Saved ') + new Date(_doc.savedAt).toLocaleString('ko-KR') : T('아직 저장 안 됨', 'Not saved yet')) + '</span>' +
    (exempt ? '' : '<button id="daily-ai-btn" onclick="window.dailyAiTidy()" title="' + esc(T('담은 업무를 보고 문장으로 묶어 줍니다 (하루 1회)', 'Groups the picked tasks into report sentences (once a day)')) + '" style="padding:6px 13px; border:1px solid #a5c8f0; background:#e7f3ff; color:#1971c2; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">🤖 ' + esc(T('AI로 정리', 'Tidy with AI')) + '</button>') +
    '<button onclick="window.dailyCloseModal()" style="padding:6px 14px; border:1px solid #ccc; background:#fff; color:#555; border-radius:6px; font-size:12.5px; cursor:pointer;">' + esc(T('닫기', 'Close')) + '</button>' +
    '<button id="daily-save-btn" onclick="window._dailySave()" style="padding:6px 20px; border:none; background:#19c3d6; color:#fff; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">✅ ' + esc(T('저장', 'Save')) + '</button>' +
  '</div>' +
'</div>';

        paintThumbs();
        if (window._makeDraggable) window._makeDraggable('daily-box', 'daily-drag');
        if (window._bindClickToFront) window._bindClickToFront('daily-modal');
        if (window.bringModalToFront) window.bringModalToFront('daily-modal');
    }

    window.dailyCloseModal = function () {
        saveDraftLocal();
        // 📎 여기서 돌려주지 않으면 사진 blob 이 탭을 여닫는 동안 계속 샘는다.
        Object.keys(_fileUrls).forEach(function (r) {
            try { URL.revokeObjectURL(_fileUrls[r]); } catch (e) { /* 무시 */ }
            delete _fileUrls[r];
        });
        var m = document.getElementById('daily-modal');
        if (m) m.style.display = 'none';
    };
    window._dailySetType = function (k) { _doc.dayType = k; saveDraftLocal(); render(); };
    window._dailyNote = function (i, v) { if (_doc.items[i]) { _doc.items[i].note = v; saveDraftLocal(); } };
    /** 업무 하나의 칸(오늘 한 일·해야 할 일·막힌 일). 다시 그리지 **않는다** — 타이핑 중이다. */
    window._dailyItemField = function (i, key, v) {
        if (_doc.items[i]) { _doc.items[i][key] = v; saveDraftLocal(); }
    };
    window._dailyItemCat = function (i, v) {
        if (_doc.items[i]) { _doc.items[i].cat = String(v || '').trim(); saveDraftLocal(); render(); }
    };
    window._dailyField = function (k, v) { _doc[k] = v; saveDraftLocal(); };
    window._dailyDropItem = function (i) { _doc.items.splice(i, 1); saveDraftLocal(); render(); };
    window._dailyAdd = function (i) {
        var c = (window._dailyCand || [])[i];
        if (!c) return;
        _doc.items.push({ name: c.name, project: c.project, cat: c.cat || '',
                          note: c.todo || '', fromMail: !!c.isMail, rowIdx: c.idx });
        saveDraftLocal(); render();
    };
    window._dailyAddManual = function () {
        var el = document.getElementById('daily-manual');
        var v = el ? el.value.trim() : '';
        if (!v) return;
        _doc.items.push({ name: v, project: projName(), cat: '', note: '' });
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
    // 6-B. 📎 사진·파일 첨부 — 바이트는 보고 JSON **밖**에
    // ══════════════════════════════════════════════════════════════════════
    // 보고엔 참조만 남기고 바이트는 `DAILY_PATHS.filesDir` 에 둔다(메일 원문을 밖으로
    // 뺀 js/54 와 같은 이유 — JSON 이 커지면 "읽고‑고쳐‑통째로 쓰기" 한 번에 날아갈 양이 커진다).
    //
    // ⚠️ 올리기는 **고른 즉시** 한다. 저장 버튼까지 들고 있으면 모달을 닫는 순간 사라진다.
    //    대신 "저장 안 한 보고 + 이미 올라간 바이트"가 잠깐 생긴다(고아 바이트).
    //    고아는 해롭지 않다 — 해로운 건 **참조가 가리키는 파일이 없는 쪽**이고, 그건
    //    조용한 거짓말이라 모달을 열 때 폴더 목록 1콜로 대조해 화면에 드러낸다(`missing`).

    /** 종류별 아이콘. 종류 판정은 js/42 `DOC_FILE_KINDS`(데이터) 하나만 쓴다. */
    var DAILY_FILE_ICONS = {
        image: '🖼️', pdf: '📕', excel: '📊', word: '📘', ppt: '📙', hwp: '📗',
        text: '📄', html: '🌐', archive: '🗜️', cad: '📐', media: '🎬', exe: '⛔'
    };
    var _fileUrls = {};          // rel → objectURL (다시 그릴 때 또 내려받지 않게)

    function fileKind(name) { return window._docKindOf ? window._docKindOf(name) : null; }
    function fileIcon(name) { var k = fileKind(name); return (k && DAILY_FILE_ICONS[k.k]) || '📎'; }
    function isImg(name) { var k = fileKind(name); return !!(k && k.k === 'image'); }

    function sizeTxt(n) {
        n = +n || 0;
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        if (n >= 1024) return Math.round(n / 1024) + ' KB';
        return n + ' B';
    }

    function toB64(blob) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () {
                var s = String(fr.result || '');
                var i = s.indexOf(',');                 // `data:…;base64,` 접두어를 뗀다
                resolve(i >= 0 ? s.slice(i + 1) : s);
            };
            fr.onerror = function () { reject(new Error(T('파일을 읽지 못했습니다', 'Could not read the file'))); };
            fr.readAsDataURL(blob);
        });
    }

    /**
     * 📐 **사진만** 줄인다 — 현장 사진은 긴 변 2000px 이면 보고용으로 충분하고,
     *    원본이면 8MB 사진 하나가 base64 11MB 로 올라가 사람이 그만큼 기다린다.
     * ⚠️ 문서(PDF·엑셀·도면)는 **건드리지 않는다** — 내용이 달라진다.
     * ⚠️ 줄여서 더 커지면(이미 압축된 jpg 등) 원본을 쓴다.
     */
    async function prepare(file) {
        var out = { blob: file, name: String(file.name || 'file') };
        var max = +window.DAILY_POLICY.imgMaxPx || 0;
        if (!max || !isImg(out.name) || /\.(svg|gif)$/i.test(out.name)) return out;
        var url = '';
        try {
            url = URL.createObjectURL(file);
            var img = await new Promise(function (res, rej) {
                var im = new Image();
                im.onload = function () { res(im); };
                im.onerror = function () { rej(new Error('이미지를 열지 못했습니다')); };
                im.src = url;
            });
            var w = img.naturalWidth, h = img.naturalHeight, lng = Math.max(w, h);
            if (!lng || lng <= max) return out;
            var r = max / lng;
            var cv = document.createElement('canvas');
            cv.width = Math.round(w * r);
            cv.height = Math.round(h * r);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.88); });
            if (blob && blob.size < file.size) {
                out.blob = blob;
                out.name = out.name.replace(/\.(png|bmp|tiff?|webp|heic|heif)$/i, '.jpg');
            }
        } catch (e) {
            console.warn('[일일보고] 사진 줄이기 실패 — 원본으로 올립니다:', e.message);
        } finally {
            if (url) { try { URL.revokeObjectURL(url); } catch (e2) { /* 무시 */ } }
        }
        return out;
    }

    /** 이 보고에서 안 쓰인 이름으로 — 겹치면 먼저 올린 사진이 조용히 덮인다. */
    function uniqueSafeName(files, rawName) {
        var base = window.DAILY_PATHS.safeName(rawName);
        var taken = {};
        (files || []).forEach(function (f) { if (f && f.safe) taken[f.safe] = 1; });
        if (!taken[base]) return base;
        var dot = base.lastIndexOf('.');
        var stem = dot > 0 ? base.slice(0, dot) : base;
        var ext = dot > 0 ? base.slice(dot) : '';
        for (var n = 2; n < 999; n++) {
            if (!taken[stem + '-' + n + ext]) return stem + '-' + n + ext;
        }
        return stem + '-' + Date.now() + ext;
    }

    /**
     * 참조가 가리키는 파일이 **정말 있는지** 폴더 목록 1콜로 대조한다.
     * ⚠️ 목록이 비면 **판정하지 않는다** — `nasAppFile.list` 는 권한 거부·오류를
     *    빈 배열로 돌려주므로(의도된 설계), 그걸 "없다"로 읽으면 멀쩡한 첨부가
     *    전부 ⚠️ 로 보인다("없음"과 "못 봄"을 섞지 말 것).
     */
    async function markMissing(doc) {
        if (!doc || !(doc.files || []).length) return doc;
        try {
            var items = await window.nasAppFile.list(window.DAILY_PATHS.filesDir(doc.date));
            if (!items || !items.length) return doc;
            var have = {};
            items.forEach(function (it) { if (it && it.name) have[it.name] = 1; });
            doc.files.forEach(function (f) {
                f.missing = !have[String(f.rel || '').split('/').pop()];
            });
        } catch (e) { /* 못 보면 아무 말도 안 한다 */ }
        return doc;
    }

    /** 고른 파일들을 올리고 참조를 담는다. 한 개가 실패해도 나머지는 올린다. */

    // ══ 업무 구분(HW·FW·ME…) ══════════════════════════════════════════════
    //  목록은 `window.WBS_DISCIPLINE_CATEGORIES`(js/04k, 데이터) 하나 — 여기 박지 않는다.
    //  ⚠️ 그 목록에 없는 값(옛 데이터·AI가 적은 값)이 와도 **지우지 않고** 선택지에 더한다.
    function catList(cur) {
        var base = (window.WBS_DISCIPLINE_CATEGORIES || []).slice();
        var c = String(cur || '').trim();
        if (c && base.indexOf(c) < 0) base.push(c);
        return base;
    }
    function catBadge(cat) {
        cat = String(cat || '').trim();
        if (!cat) return '';
        return '<span style="display:inline-block; padding:0 5px; margin-right:4px; border-radius:3px; '
             + 'background:#eef2f6; color:#50616f; font-size:10px; font-weight:bold; vertical-align:middle;">'
             + esc(cat) + '</span>';
    }
    function catSelect(i, cur) {
        var opts = ['<option value="">' + esc(T('구분', 'Cat.')) + '</option>'];
        catList(cur).forEach(function (c) {
            opts.push('<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>');
        });
        return '<select onchange="window._dailyItemCat(' + i + ', this.value)" '
             + 'title="' + esc(T('업무 구분 — 간트차트의 담당구분과 같은 값입니다', 'Discipline — same values as the Gantt chart')) + '" '
             + 'style="padding:1px 3px; border:1px solid ' + (cur ? '#a5c8f0' : '#ddd') + '; border-radius:4px; '
             + 'background:' + (cur ? '#eef6ff' : '#fff') + '; color:#50616f; font-size:10.5px;">'
             + opts.join('') + '</select>';
    }

    /**
     * 하루 보기 표에서 행을 **더블클릭** — 내 보고 쓰기를 연다(2026-11-05 요청).
     * ⚠️ 남의 행에서는 열지 않는다 — 한 파일에 쓰는 사람이 하나라는 게 이 설계의 불변식이고,
     *    열어 주면 "고칠 수 있다"고 약속하는 꼴이 된다. 대신 왜 안 되는지 말한다.
     */
    window._dailyRowDbl = function (key) {
        var mine = String(key || '').toLowerCase() === String(myKey() || '').toLowerCase();
        if (!mine) {
            toast(T('내 보고만 쓸 수 있습니다 — 하루 파일 하나에 쓰는 사람은 한 명입니다.',
                    'You can only edit your own report — one writer per daily file.'), 'info', 6000);
            return;
        }
        window.dailyOpenModal(window._dailyTabDate || ymd());
    };

    /** 모달이 열릴 때 부르는 그 함수 그대로 — 하네스도 이걸 부른다(두 벌로 두지 않는다). */
    window.dailyMarkMissingFiles = markMissing;

    /** `task` = 이 파일이 붙을 업무명(비면 보고 전체). ⚠️ 배열은 `_doc.files` 하나 그대로 —
     *  항목 안으로 옮기면 **옛 보고의 사진이 통째로 안 보인다**(꼬리표가 없는 게 곧 전체다). */
    window.dailyAttachFiles = async function (list, task) {
        if (!_doc) return;
        var files = [].slice.call(list || []).filter(Boolean);
        if (!files.length) return;
        var k;
        try { k = requireKey(); } catch (e) { toast('⚠️ ' + e.message, 'warning', 9000); return; }
        _doc.files = _doc.files || [];
        var maxN = +window.DAILY_POLICY.filesMax || 12;
        var maxB = (+window.DAILY_POLICY.fileMaxMB || 20) * 1048576;
        var added = 0, bad = [];
        toast('⏳ ' + T(files.length + '개 올리는 중…', 'Uploading ' + files.length + '…'), 'info', 3000);
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (_doc.files.length >= maxN) {
                bad.push(T('개수 상한 ' + maxN + '개를 넘겨 나머지는 올리지 않았습니다',
                           'Stopped at the limit of ' + maxN + ' files'));
                break;
            }
            if (f.size > maxB) {
                bad.push((f.name || '?') + ' — ' + T('한 파일 ' + window.DAILY_POLICY.fileMaxMB + 'MB 까지입니다',
                                                     'over the ' + window.DAILY_POLICY.fileMaxMB + 'MB limit'));
                continue;
            }
            try {
                var prep = await prepare(f);
                var safe = uniqueSafeName(_doc.files, prep.name);
                var rel = window.DAILY_PATHS.fileRel(_doc.date, k, safe);
                var res = await window.nasAppFile.putBytes(rel, await toB64(prep.blob));
                if (res && res.ok === false) throw new Error(res.message || 'NAS 쓰기 실패');
                _doc.files.push({ name: prep.name, safe: safe, rel: rel, size: prep.blob.size,
                                  task: String(task || ''),
                                  via: 'app', addedAt: new Date().toISOString() });
                added++;
            } catch (e) {
                bad.push((f.name || '?') + ' — ' + e.message);
                if (window._issueLog) {
                    try { window._issueLog({ domain: 'daily-report', kind: 'attach_failed', result: { errorRaw: e.message } }); }
                    catch (e2) { /* 기록 실패가 올리기를 막지는 않는다 */ }
                }
            }
        }
        if (added) { saveDraftLocal(); render(); }
        if (added && !bad.length) {
            toast('📎 ' + T(added + '개 올렸습니다 — 저장을 누르면 보고에 남습니다.',
                            added + ' uploaded — press Save to keep them in the report.'), 'success', 6000);
        } else if (bad.length) {
            toast((added ? '📎 ' + added + T('개만 올렸습니다. ', ' uploaded. ') : '⚠️ ') + bad.join(' / '), 'warning', 10000);
        }
    };

    /** 첨부 지우기 — 바이트를 **먼저** 지운다(거꾸로면 지웠다고 말한 사진이 NAS 에 남는다). */
    window.dailyDropFile = async function (i) {
        var f = (_doc && _doc.files || [])[i];
        if (!f) return;
        if (!f.missing) {
            try {
                await window.nasAppFile.del(f.rel);
            } catch (e) {
                toast('⚠️ ' + T('파일을 지우지 못했습니다: ', 'Could not delete the file: ') + e.message, 'warning', 9000);
                return;
            }
        }
        if (_fileUrls[f.rel]) {
            try { URL.revokeObjectURL(_fileUrls[f.rel]); } catch (e2) { /* 무시 */ }
            delete _fileUrls[f.rel];
        }
        _doc.files.splice(i, 1);
        saveDraftLocal();
        render();
        toast(T('첨부를 지웠습니다 — 저장을 눌러야 보고에서도 빠집니다.',
                'Attachment deleted — press Save to update the report.'), 'info', 6000);
    };

    /** blob 에 **이름에서 뽑은 MIME** 을 달아 준다 — 이 값이 "보여줄지 받을지"를 가른다. */
    function typedBlob(blob, name) {
        var m = window._docMimeOf ? window._docMimeOf(name) : { mime: '' };
        if (!m.mime || blob.type === m.mime) return blob;
        try { return new Blob([blob], { type: m.mime }); } catch (e) { return blob; }
    }

    function revokeLater(u) {
        setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) { /* 무시 */ } }, 60000);
    }

    /** 썸네일용 — 캐시한다(모달을 닫을 때 한꺼번에 돌려준다). */
    async function fileUrl(rel, name) {
        if (_fileUrls[rel]) return _fileUrls[rel];
        var blob = await window.nasAppFile.getBlob(rel);
        if (!blob) return null;
        _fileUrls[rel] = URL.createObjectURL(typedBlob(blob, name));
        return _fileUrls[rel];
    }

    /**
     * 첨부 열기 — ① 연결 프로그램 → ② 새 탭 → ③ 이름 붙여 내려받기.
     *
     * ⚠️⚠️ ①이 기본인 이유(2026-11-05 실사용 신고): 브라우저로 여는 길은 `blob:` URL 이라
     *    **파일 이름이 실리지 않는다.** 그래서 사진을 눌렀더니 `242b6110-c875-…`(확장자 없음)로
     *    받아졌다 — 보려던 사람에게 "받기"가, 그것도 **못 여는 이름으로** 일어난 것이다.
     *    백엔드가 NAS 원본을 그 자리에서 열면 사진은 사진 뷰어, 엑셀은 엑셀로 간다.
     * ⚠️ ①이 안 되는 자리가 있다(Windows 아님·공유가 안 보임·구버전 백엔드) → ②로 내려온다.
     *    ②도 **볼 수 있는 종류만** 간다(`_docMimeOf().view`) — 못 보는 종류를 새 탭으로 보내면
     *    그게 바로 ①을 만들게 한 그 증상이다.
     * ⚠️ 이름을 실을 수 있는 자리는 ③ 하나뿐이다(`<a download>`).
     */
    window.dailyOpenRel = async function (rel, name) {
        try {
            var r = await window.nasAppFile.openNative(rel);
            if (r && r.ok !== false) {
                toast('🖥️ ' + T('연결 프로그램으로 열었습니다.', 'Opened in its app.'), 'success', 4000);
                return true;
            }
        } catch (e) {
            console.warn('[일일보고] 연결 프로그램으로 못 열어 브라우저로 돌립니다:', e.message);
        }
        var u = '';
        try {
            var blob = await window.nasAppFile.getBlob(rel);
            if (!blob) {
                toast('⚠️ ' + T('NAS 에 그 파일이 없습니다 — 올리는 중에 끊겼을 수 있습니다.',
                                 'That file is not on the NAS — the upload may have failed.'), 'warning', 8000);
                return false;
            }
            var m = window._docMimeOf ? window._docMimeOf(name) : { mime: '', view: false };
            u = URL.createObjectURL(typedBlob(blob, name));
            if (m.view) {
                var w = window.open(u, '_blank');
                if (w) { revokeLater(u); return true; }
            }
            var a = document.createElement('a');
            a.href = u;
            a.download = String(name || 'file');     // ← 이름이 붙는 유일한 자리
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('⬇️ ' + T((name || '파일') + ' 로 내려받았습니다.',
                             'Downloaded as ' + (name || 'file') + '.'), 'info', 6000);
            revokeLater(u);
            return false;
        } catch (e) {
            if (u) revokeLater(u);
            toast('⚠️ ' + e.message, 'error', 8000);
            return false;
        }
    };
    window.dailyOpenFile = function (i) {
        var f = (_doc && _doc.files || [])[i];
        if (f) return window.dailyOpenRel(f.rel, f.name);
    };
    /** 남의 보고 첨부 — 인덱스로만 받는다(파일 이름이 onclick 에 들어가지 않게). */
    window.dailyOpenDayFile = function (i) {
        var f = (window._dailyDayFiles || [])[i];
        if (f) return window.dailyOpenRel(f.rel, f.name);
    };

    /** 썸네일은 그린 **뒤에** 채운다 — 렌더를 막지 않는다. */
    function paintThumbs() {
        (_doc && _doc.files || []).forEach(function (f, i) {
            if (!isImg(f.name) || f.missing) return;
            var el = document.getElementById('daily-th-' + i);
            if (!el || el.getAttribute('data-done')) return;
            el.setAttribute('data-done', '1');
            fileUrl(f.rel, f.name).then(function (u) {
                if (u) { el.style.backgroundImage = 'url("' + u + '")'; el.textContent = ''; }
            }).catch(function () { /* 썸네일 하나 못 그려도 목록은 쓴다 */ });
        });
    }

    /**
     * 옛 보고의 **보고-단위** 해야 할 일·막힌 일.
     * [2026-11-05 요청] 칸을 업무마다로 옮겼으니 입력칸은 없앴다. 다만 **이미 적힌 글을
     * 안 보이게만 하면 지울 수도 없는 데이터**가 남는다 — 있을 때만 보여 주고 치울 수 있게 한다.
     */
    function legacyEtcHtml() {
        var has = String(_doc.next || '').trim() || String(_doc.issue || '').trim();
        if (!has) return '';
        return '<div style="margin:10px 0; padding:8px 10px; border:1px dashed #d8c7a8; background:#fffaf0; border-radius:6px;">' +
                 '<div style="display:flex; align-items:center; gap:7px; margin-bottom:4px;">' +
                   '<span style="font-size:11.5px; font-weight:bold; color:#8a6d3b;">' +
                     esc(T('예전 방식으로 적힌 글 (업무에 안 붙음)', 'Older report-level text (not tied to a task)')) + '</span>' +
                   '<button onclick="window._dailyClearLegacyEtc()" style="padding:2px 8px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:5px; font-size:10.5px; cursor:pointer;">' +
                     esc(T('치우기', 'Clear')) + '</button>' +
                 '</div>' +
                 '<div style="font-size:11.5px; color:#6b5a3e; white-space:pre-line;">' +
                   esc([String(_doc.next || '').trim(), String(_doc.issue || '').trim()].filter(Boolean).join('\n')) +
                 '</div>' +
               '</div>';
    }
    window._dailyClearLegacyEtc = function () {
        _doc.next = ''; _doc.issue = '';
        saveDraftLocal(); render();
        toast(T('치웠습니다 — 저장을 눌러야 남습니다.', 'Cleared — press Save to keep it.'), 'info', 5000);
    };

    /** 모달 안 첨부 영역 HTML. 일 종류가 면제여도 보여준다(출장 사진 같은 게 있다). */
    /** 어느 업무로 담을지 기억해 두고 고르기 창을 연다. */
    window._dailyPickFiles = function (task) {
        window._dailyPickTask = String(task || '');
        var el = document.getElementById('daily-file-input');
        if (el) el.click();
    };

    /**
     * 📎 이 사진이 **어느 업무 것인지** 고르는 칸.
     * ⚠️ 텔레그램으로 온 사진은 어느 업무인지 알 길이 없어 "기타"로 들어온다
     *    (2026-11-05 신고: "텔레그램 알림 첨부 위치 수정되어야"). 사람이 한 번에 옮길 수 있게 한다.
     */
    function taskSelect(gi, cur) {
        var names = (_doc.items || []).map(function (x) { return String(x.name || ''); }).filter(Boolean);
        var c = String(cur || '');
        if (c && names.indexOf(c) < 0) names.push(c);     // 지워진 업무 것도 지우지 않는다
        return '<select onchange="window._dailyFileTask(' + gi + ', this.value)" ' +
            'title="' + esc(T('이 사진이 붙을 업무', 'Which task this file belongs to')) + '" ' +
            'style="width:100%; box-sizing:border-box; border:none; border-top:1px solid #eef1f4; ' +
            'background:#fafbfc; font-size:9.5px; color:#50616f; padding:1px 2px;">' +
            '<option value=""' + (c ? '' : ' selected') + '>' + esc(T('기타', 'Other')) + '</option>' +
            names.map(function (n) {
                return '<option value="' + esc(n) + '"' + (n === c ? ' selected' : '') + '>' +
                       esc(n.length > 14 ? n.slice(0, 14) + '…' : n) + '</option>';
            }).join('') + '</select>';
    }

    /** 사진을 다른 업무로 옮긴다 — 바이트는 그대로 두고 **꼬리표만** 바꾼다. */
    window._dailyFileTask = function (gi, task) {
        var f = (_doc && _doc.files || [])[gi];
        if (!f) return;
        f.task = String(task || '');
        saveDraftLocal();
        render();
        toast(T('첨부를 옮겼습니다 — 저장을 눌러야 남습니다.',
                'Moved the attachment — press Save to keep it.'), 'info', 5000);
    };

    /** 고르기 창은 **문서에 하나만** — 업무마다 만들면 id 가 겹쳐 늘 첫 번째만 열린다. */
    function fileInputHtml() {
        return '<input type="file" id="daily-file-input" multiple style="display:none;" ' +
               'onchange="window.dailyAttachFiles(this.files, window._dailyPickTask || \'\'); this.value=\'\';">';
    }

    /**
     * `task` 가 있으면 **그 업무에 붙은 것만**, 없으면 꼬리표 없는 것(보고 전체)만.
     * ⚠️ 카드의 인덱스는 **`_doc.files` 안의 진짜 자리**여야 한다 — 걸러 낸 목록의 번호를 쓰면
     *    두 번째 업무의 사진을 지울 때 **첫 번째 업무의 사진이 지워진다.**
     */
    function filesHtml(task, compact) {
        var only = String(task || '');
        var all = _doc.files || [];
        var fl = [];
        all.forEach(function (f, gi) {
            if (String((f && f.task) || '') === only) fl.push({ f: f, gi: gi });
        });
        var w = compact ? 78 : 104;
        var h = compact ? 46 : 62;
        var cards = fl.map(function (x) {
            var f = x.f, gi = x.gi;
            var th = isImg(f.name) && !f.missing
                ? '<div id="daily-th-' + gi + '" style="width:100%; height:' + h + 'px; border-radius:5px 5px 0 0; background:#f1f3f5 center/cover no-repeat; display:flex; align-items:center; justify-content:center; font-size:16px; color:#bbb;">🖼️</div>'
                : '<div style="width:100%; height:' + h + 'px; border-radius:5px 5px 0 0; background:#f6f7f9; display:flex; align-items:center; justify-content:center; font-size:' + (compact ? 18 : 24) + 'px;">' + (f.missing ? '⚠️' : fileIcon(f.name)) + '</div>';
            return '<div style="width:' + w + 'px; border:1px solid ' + (f.missing ? '#eeb0ac' : '#e4e7ea') + '; border-radius:6px; overflow:hidden; background:#fff; position:relative;">' +
                     '<button onclick="window.dailyDropFile(' + gi + ')" title="' + esc(T('지우기', 'Delete')) + '" style="position:absolute; top:2px; right:2px; width:17px; height:17px; border:1px solid #eeb0ac; background:rgba(251,228,226,.95); color:#b1432f; border-radius:4px; cursor:pointer; font-size:9px; line-height:1; padding:0;">✕</button>' +
                     '<div onclick="window.dailyOpenFile(' + gi + ')" title="' + esc(f.name + (f.missing ? ' — ' + T('NAS 에 없습니다', 'missing on NAS') : '')) + '" style="cursor:pointer;">' + th +
                       '<div style="padding:3px 4px;">' +
                         '<div style="font-size:9.5px; color:#333; line-height:1.2; word-break:break-all; max-height:22px; overflow:hidden;">' + esc(f.name) + '</div>' +
                         (compact ? '' : '<div style="font-size:9.5px; color:#aaa; margin-top:1px;">' + esc(sizeTxt(f.size)) + (f.via === 'telegram' ? ' 📱' : '') + '</div>') +
                       '</div>' +
                     '</div>' +
                     taskSelect(gi, f.task) +
                   '</div>';
        }).join('');
        var pick = '<button onclick="window._dailyPickFiles(' + JSON.stringify(only).replace(/"/g, '&quot;') + ')" ' +
                   'style="padding:' + (compact ? '1px 7px' : '4px 11px') + '; border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-size:' + (compact ? '10.5px' : '11.5px') + '; font-weight:bold; cursor:pointer;">📎 ' +
                   esc(compact ? T('사진·파일', 'Files') : T('파일 고르기', 'Add files')) + '</button>';
        if (compact) {
            // 업무 카드 안 — 머리글·안내문 없이 한 줄로(카드가 길어지면 읽기 어렵다)
            return '<div style="display:flex; align-items:flex-start; gap:6px; margin-top:4px;">' +
                     '<span style="flex-shrink:0; width:58px;"></span>' +   // 칸 라벨과 줄 맞춤
                     '<div style="flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:5px; align-items:center;">' +
                       pick + cards +
                     '</div>' +
                   '</div>';
        }
        // 🧹 [2026-11-05 요청] 보고-단위 "사진·파일 (업무에 안 붙는 것)" 칸은 없앤다 —
        //    파일은 **업무마다** 붙이는 게 맞고, 칸이 둘이면 같은 사진을 두 군데서 찾게 된다.
        //    ⚠️ 그래도 **꼬리표 없는 파일은 계속 생긴다** — 텔레그램으로 온 사진은 백엔드가
        //       어느 업무인지 알 길이 없고, 옛 보고에도 남아 있다. 칸을 통째로 지우면 그 사진이
        //       **보이지도 지워지지도 않는다** — 옛 글을 노란 띠로 남긴 것과 같은 이유로,
        //       **있을 때만** 띠로 보여 준다(업무를 고르거나 ✕ 로 지울 수 있게).
        //    └ 고르기 버튼도 안내문도 없다 — 새 파일은 업무 카드에서 붙이는 게 맞다.
        if (!fl.length) return '';
        return '<div style="margin:10px 0 0; padding:8px 10px; border:1px dashed #d8c7a8; background:#fffaf0; border-radius:6px;">' +
                 '<div style="font-size:11.5px; font-weight:bold; color:#8a6d3b; margin-bottom:6px;">📎 ' +
                   esc(T('아직 업무에 안 붙은 사진·파일 — 카드 아래 칸에서 업무를 골라 주세요',
                         'Photos & files not tied to a task yet — pick a task under each card')) + '</div>' +
                 '<div style="display:flex; flex-wrap:wrap; gap:7px;">' + cards + '</div>' +
               '</div>';
    }

    /**
     * 끌어다 놓기 · 붙여넣기.
     *
     * ⚠️⚠️ [2026-11-05 실측] 상자 **위**에 떨어뜨리면 잘 됐는데, **어두운 배경**에 떨어뜨리면
     *    보고는 0건이고 **앱 전역 드롭**(js/04f 의 `window 'drop'`)이 받아 그 사진을
     *    **간트 일정표 엑셀로 열려** 했다. 배경(`#daily-modal`)은 `pointer-events:none` 이라
     *    드래그 이벤트가 아예 거길 지나지 않는다 — 상자에만 걸어선 못 막는다.
     *    → 모달이 열려 있는 동안엔 **문서 capture 단계**에서 가로채 보고로 담는다.
     * ⚠️ 그래서 `preventDefault` 와 `stopPropagation` 을 **capture 에서** 건다 —
     *    bubble 로 가면 그땐 이미 전역이 받은 뒤다.
     * 📎 업무 카드 위에 떨어뜨리면 **그 업무에** 붙는다(`data-daily-item`).
     */
    function taskFromEvent(e) {
        var el = e && e.target;
        while (el && el !== document) {
            if (el.getAttribute && el.getAttribute('data-daily-item') != null) {
                var n = +el.getAttribute('data-daily-item');
                var it = (_doc && _doc.items || [])[n];
                return it ? String(it.name || '') : '';
            }
            el = el.parentNode;
        }
        return '';
    }

    function modalOpen() {
        var w = document.getElementById('daily-modal');
        return !!(w && w.style.display !== 'none' && _doc);
    }

    (function bindFileDropOnce() {
        document.addEventListener('dragover', function (e) {
            if (!modalOpen()) return;
            e.preventDefault();                       // 이걸 안 하면 drop 자체가 안 온다
        }, true);
        document.addEventListener('drop', function (e) {
            if (!modalOpen()) return;
            var fs = e.dataTransfer && e.dataTransfer.files;
            if (!fs || !fs.length) return;
            e.preventDefault();
            e.stopPropagation();                      // 전역(엑셀 열기)까지 가지 않게
            window.dailyAttachFiles(fs, taskFromEvent(e));
        }, true);
        document.addEventListener('paste', function (e) {
            if (!modalOpen()) return;
            var items = (e.clipboardData && e.clipboardData.items) || [];
            var out = [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].kind !== 'file') continue;
                var f = items[i].getAsFile();
                if (!f) continue;
                // 📋 화면 캡처는 이름이 없다(또는 전부 `image.png`) — 날짜로 지어 준다.
                var nm = String(f.name || '');
                if (!nm || nm === 'image.png' || nm === 'blob') {
                    try {
                        f = new File([f], 'capture_' + ymd() + '_' + String(Date.now()).slice(-6) + '.png',
                                     { type: f.type || 'image/png' });
                    } catch (e2) { /* File 생성이 막히면 원본 이름으로 */ }
                }
                out.push(f);
            }
            if (!out.length) return;                  // 글자 붙여넣기는 그대로 입력칸으로
            e.preventDefault();
            e.stopPropagation();
            window.dailyAttachFiles(out, taskFromEvent(e));
        }, true);
    })();

    // ══════════════════════════════════════════════════════════════════════
    // 7. 팀 하루 보기 탭
    // ══════════════════════════════════════════════════════════════════════

    /** 행 자체를 만지는 기록 — `rowName` 에 **인덱스**가 들어와 번호로 오인된다. 데이터로 둔다. */
    window.DAILY_TOUCH_SKIP_COLS = window.DAILY_TOUCH_SKIP_COLS ||
        ['행 조작', '일정 재계산', '일정 고정'];

    /** 지금 필터에 걸리는 항목만. */
    function keepItems(items) {
        var F = window._dailyFilter || {};
        return (items || []).filter(function (it) {
            if (F.cat && String((it && it.cat) || '') !== F.cat) return false;
            if (F.proj && String((it && it.project) || '').replace(/\.json$/i, '') !== F.proj) return false;
            return true;
        });
    }

    /**
     * "오늘 한 일" 칸 — 구분·업무·프로젝트를 **열로** 나눈다(2026-11-05 요청).
     * ⚠️ 전엔 `• [HW] 이름 (프로젝트)` 한 줄이라 구분이 글 안에 묻혔다.
     * ⚠️ 한 사람 행 안에 항목이 여럿이라 바깥 표에 열을 더할 수 없다 — **안에 작은 표**를 둔다.
     */
    /** 그 업무에 붙은 사진·파일. 꼬리표(`task`)로 가른다. */
    function filesOf(d, task) {
        return ((d && d.files) || []).filter(function (f) {
            return String((f && f.task) || '') === String(task || '');
        });
    }

    /**
     * "업무별 보고" 칸 — 한 업무가 **한 줄**이고 칸이 열로 갈린다.
     *   구분 | 업무(+프로젝트) | 오늘 한 일 | 해야 할 일 | 막힌 일 | 📎
     * ⚠️ 바깥 표에 열을 더할 수 없다(한 사람 행에 업무가 여럿) → **안에 표**를 둔다.
     * ⚠️ 머리글은 `DAILY_FIELDS`(데이터)에서 — 칸 이름을 바꿀 때 여기도 고치는 일이 없게.
     */
    function itemsCellUnused(d) {
        var ai = String((d && d.aiDone) || '').trim();
        var items = keepItems(d && d.items);
        var head = ai ? '<div style="white-space:pre-line; margin-bottom:' + (items.length ? '5px' : '0') + ';">' + esc(ai) + '</div>' : '';
        if (!items.length) return head || '';
        var th = 'padding:2px 5px; border:1px solid #e3eaef; background:#f3f7f9; font-size:10.5px; color:#2c5f8a; font-weight:normal;';
        var td = 'padding:3px 5px; border:1px solid #eef1f4; font-size:11.5px; vertical-align:top; white-space:pre-line;';
        var cols = window.DAILY_FIELDS;
        return head +
          '<table style="width:100%; border-collapse:collapse; table-layout:fixed;">' +
            '<colgroup><col style="width:42px;"><col style="width:26%;">' +
              cols.map(function () { return '<col>'; }).join('') +
              '<col style="width:66px;"></colgroup>' +
            '<thead><tr>' +
              '<th style="' + th + '">' + esc(T('구분', 'Cat.')) + '</th>' +
              '<th style="' + th + '">' + esc(T('업무', 'Task')) + '</th>' +
              cols.map(function (f) {
                  return '<th style="' + th + '">' + esc(window._currentLang === 'en' ? f.en : f.ko) + '</th>';
              }).join('') +
              '<th style="' + th + '">📎</th>' +
            '</tr></thead><tbody>' +
            items.map(function (it) {
                var pj = String((it && it.project) || '').replace(/\.json$/i, '');
                var fs = filesOf(d, it.name);
                return '<tr>' +
                  '<td class="daily-cat-cell" style="' + td + '">' + esc(it.cat || '-') + '</td>' +
                  '<td style="' + td + '"><b>' + esc(it.name) + '</b>' +
                    (pj ? '<div style="color:#9aa3ab; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(pj) + '">' + esc(pj) + '</div>' : '') +
                  '</td>' +
                  cols.map(function (f) {
                      var v = String(it[f.itemKey] || '').trim();
                      return '<td style="' + td + (f.key === 'issue' && v ? ' background:#fffaf0;' : '') + '">' + esc(v || '-') + '</td>';
                  }).join('') +
                  '<td style="' + td + ' text-align:center;">' + (fs.length ? fileChips(fs) : '<span style="color:#ccc;">-</span>') + '</td>' +
                '</tr>';
            }).join('') +
          '</tbody></table>';
    }

    /** 파일 칩 — **인덱스로만** 연다(파일 이름이 onclick 속성에 들어가지 않게). */
    function fileChips(list) {
        return list.map(function (f) {
            var gi = window._dailyDayFiles.push({ rel: f.rel, name: f.name }) - 1;
            return '<span onclick="window.dailyOpenDayFile(' + gi + ')" title="' + esc(f.name) + '" ' +
                   'style="cursor:pointer; margin:0 1px; font-size:13px;">' + fileIcon(f.name) + '</span>';
        }).join('');
    }

    window.dailySetFilter = function (k, v) {
        (window._dailyFilter || (window._dailyFilter = {}))[k] = String(v || '');
        window.dailyRenderTab();
    };

    /** 필터 줄 — 고를 수 있는 값은 **그 날 실제로 있는 것만** 만든다(없는 선택지를 주지 않는다). */
    function filterBar(people, docs) {
        var F = window._dailyFilter || {};
        var projs = {}, cats = {};
        (docs || []).forEach(function (d) {
            (d.items || []).forEach(function (it) {
                var pj = String((it && it.project) || '').replace(/\.json$/i, '').trim();
                if (pj) projs[pj] = 1;
                var c = String((it && it.cat) || '').trim();
                if (c) cats[c] = 1;
            });
        });
        function sel(key, label, opts, cur) {
            return '<select onchange="window.dailySetFilter(\'' + key + '\', this.value)" ' +
                'style="padding:3px 6px; border:1px solid ' + (cur ? '#a5c8f0' : '#ddd') + '; border-radius:5px; ' +
                'background:' + (cur ? '#eef6ff' : '#fff') + '; font-size:11.5px; color:#50616f;">' +
                '<option value="">' + esc(label) + '</option>' +
                opts.map(function (o) {
                    return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
                }).join('') + '</select>';
        }
        var who = (people || []).map(function (p) { return [String(p.key || ''), String(p.name || p.key || '')]; });
        return '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">' +
            '<span style="font-size:11.5px; color:#888;">🔎</span>' +
            sel('who', T('담당자 전체', 'All people'), who, F.who || '') +
            sel('proj', T('프로젝트 전체', 'All projects'), Object.keys(projs).sort().map(function (k) { return [k, k]; }), F.proj || '') +
            sel('cat', T('구분 전체', 'All disciplines'), Object.keys(cats).sort().map(function (k) { return [k, k]; }), F.cat || '') +
            ((F.who || F.proj || F.cat)
                ? '<button onclick="window._dailyFilter={who:\'\',proj:\'\',cat:\'\'}; window.dailyRenderTab();" ' +
                  'style="padding:3px 9px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:5px; font-size:11px; cursor:pointer;">' +
                  esc(T('필터 해제', 'Clear')) + '</button>'
                : '') +
        '</div>';
    }

    /** 하루 보기 표의 열 — **데이터 한 곳**. 칸 셋은 `DAILY_FIELDS` 에서 끌어온다. */
    var DAY_COLS = [
        { ko: '이름', en: 'Name', w: '78px' },
        { ko: '종류', en: 'Type', w: '50px' },
        { ko: '구분', en: 'Cat.', w: '46px' },
        { ko: '업무', en: 'Task', w: '20%' }
    ].concat(window.DAILY_FIELDS.map(function (f) { return { ko: f.ko, en: f.en, w: '' }; }))
     .concat([{ ko: '첨부', en: 'Files', w: '58px' }]);

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
                // 📊 보고가 업무별이 됐으니 **한 업무가 한 줄**이다(2026-11-05).
                //    전엔 사람 한 줄에 업무를 전부 뭉쳐 넣어, 엑셀에서 거르거나 정렬할 수가 없었다.
                var hdr = [en ? 'Name' : '이름', en ? 'Type' : '종류', en ? 'Cat.' : '구분',
                           en ? 'Task' : '업무', en ? 'Project' : '프로젝트'];
                window.DAILY_FIELDS.forEach(function (f) { hdr.push(en ? f.en : f.ko); });
                hdr.push(en ? 'Attachments' : '첨부', en ? 'Saved' : '작성시각');
                var rows = [hdr];
                docs.forEach(function (d) {
                    var ty = window.DAILY_DAY_TYPES.filter(function (x) { return x.key === d.dayType; })[0] || {};
                    var who = d.name || d.key, tyTxt = (en ? ty.en : ty.ko) || '';
                    var when = d.savedAt ? new Date(d.savedAt).toLocaleString('ko-KR') : '';
                    var att = function (task) {
                        return ((d.files || []).filter(function (f) { return String((f && f.task) || '') === task; })
                            .map(function (f) { return f.name; }).join(', '));
                    };
                    (d.items || []).forEach(function (it) {
                        var r = [who, tyTxt, it.cat || '', it.name || '',
                                 String(it.project || '').replace(/\.json$/i, '')];
                        window.DAILY_FIELDS.forEach(function (f) { r.push(it[f.itemKey] || ''); });
                        r.push(att(it.name), when);
                        rows.push(r);
                    });
                    // 업무에 안 붙는 것(옛 보고의 보고-단위 글 포함)은 한 줄로 따로.
                    var etc = [String(d.next || '').trim(), String(d.issue || '').trim()].filter(Boolean);
                    if (etc.length || att('') || !(d.items || []).length) {
                        rows.push([who, tyTxt, '', en ? '(other)' : '(기타)', '',
                                   String(d.aiDone || '').trim(), d.next || '', d.issue || '', att(''), when]);
                    }
                });
                var ws2 = XLSX.utils.aoa_to_sheet(rows);
                ws2['!cols'] = [{ wch: 11 }, { wch: 7 }, { wch: 6 }, { wch: 30 }, { wch: 20 },
                                { wch: 34 }, { wch: 26 }, { wch: 26 }, { wch: 22 }, { wch: 19 }];
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
        await window.dailyEnsureIdentity();   // 씨앗 행의 계정id 를 채우려면 먼저 알아야 한다
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
        // 🐞 보고 모달과 **같은 버그** — 닫기가 `display:none` 으로 두고 가므로 열 때마다 켠다.
        wrap.style.display = 'flex';
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
     '<b>' + esc(T('이 표에 누가 나오는지를 정하는 명단입니다.', 'This roster decides who appears in the table.')) + '</b> ' +
     esc(T('우리 팀 사람은 📒 주소록(부서·메일·텔레그램 ID)에서 저절로 채워집니다 — 여기선 📣 담당·사용 안 함·별칭처럼 주소록에 없는 것만 손봅니다.',
           'Teammates are filled in from the Address Book (dept / mail / Telegram ID) — set only what the Address Book cannot hold: 📣, off, aliases.')) + '<br>' +
     esc(T('여기 없는 사람은 \'미작성\' 으로도 안 보이고, 텔레그램으로 보내도 받아 주지 않습니다.',
           'People not listed never show as \'not written\', and their Telegram messages are ignored.')) + '<br>' +
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
        var list = (window._dailyRosterDraft || [])
            .filter(function (m) { return String(m.key || '').trim(); })
            .map(function (m) { var c = Object.assign({}, m); delete c.fromAddr; return c; });
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


    // ══════════════════════════════════════════════════════════════════════
    // 7-F. 탭이 스스로 그려지게 + 자동 갱신
    // ══════════════════════════════════════════════════════════════════════

    // 🐞 [2026-11-05 신고] "처음엔 목록이 안 보이고 다른 페이지 갔다 오면 보인다."
    //    범인은 **로딩 순서**다 — 마지막 탭을 되살리는 js/23 의 IIFE 가 js/59 **보다 먼저**
    //    돌아서, 그 순간 `window.dailyOnTabShown` 이 아직 없었다(그래서 조용히 건너뛴다).
    //    파일 순서를 바꾸는 대신 **이 파일이 자기 탭이 이미 켜져 있는지 스스로 본다.**
    // ⚠️ 바로 그리면 NAS 로그인이 아직이라 "못 읽었다"가 뜬다 — 사람은 그걸 고장으로 읽는다.
    //    계정이 잡힐 때까지 짧게 몇 번만 기다린다(상한 있음).
    (function bootRenderIfActive() {
        var BOOT_TRIES = 4, BOOT_WAIT = 2000;
        async function go(n) {
            var panel = document.getElementById('tab-daily');
            if (!panel || !panel.classList.contains('active')) return;
            if (window._storageMode && window._storageMode() !== 'nas') return;
            var ok = false;
            try { ok = !!(await window.dailyEnsureIdentity()); } catch (e) { ok = false; }
            if (!ok && n < BOOT_TRIES) { setTimeout(function () { go(n + 1); }, BOOT_WAIT); return; }
            window.dailyOnTabShown();
        }
        function start() { setTimeout(function () { go(0); }, 900); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    })();

    // 🔄 자동 갱신 — 텔레그램으로 들어온 보고·나간 알림이 **탭을 다시 열지 않아도** 보이게.
    //    ⚠️ 통째로 다시 그리지 않는다: 그 달 폴더 **목록 1콜**로 서명을 만들어 **달라졌을 때만** 그린다
    //       (사람이 글을 쓰고 있는데 화면이 깜빡이면 그게 더 나쁘다).
    //    ⚠️ 탭이 안 보이면 **네트워크도 안 쓴다** — 배경 탭이 1분마다 NAS 를 두드릴 이유가 없다.
    //    주기는 백엔드 수신 틱과 같은 60초(`DAILY_POLL_MS`, 데이터).
    var DAILY_POLL_MS = 60000;
    var _pollTimer = null, _pollSig = null, _pollBusy = false;

    async function pollTick() {
        if (_pollBusy) return;
        var panel = document.getElementById('tab-daily');
        if (!panel || !panel.classList.contains('active')) return;
        if (window._storageMode && window._storageMode() !== 'nas') return;
        if (window._dailyView === 'month') return;      // 월 보기는 O/X 라 1분마다 볼 값이 아니다
        var date = window._dailyTabDate || ymd();
        _pollBusy = true;
        try {
            var items = await window.nasAppFile.list(window.DAILY_PATHS.month(date));
            var sig = (items || []).filter(function (it) {
                var p = window.DAILY_PATHS.parse(it && it.name);
                return p && p.ymd === date;
            }).map(function (it) {
                return it.name + ':' + (it.size || '') + ':' + (it.mtime || '');
            }).sort().join('|');
            if (_pollSig === null) { _pollSig = sig; return; }    // 첫 바퀴는 기준만 잡는다
            if (sig === _pollSig) return;
            _pollSig = sig;
            await window.dailyRenderTab();
            toast('🔄 ' + T('일일보고가 갱신되었습니다.', 'Daily report updated.'), 'info', 3500);
        } catch (e) {
            // 조용히 접는다 — 자동 갱신이 안 됐다고 화면을 어지럽히지 않는다(다음 바퀴에 또 본다).
            console.warn('[일일보고] 자동 갱신 건너뜀:', e.message);
        } finally {
            _pollBusy = false;
        }
    }

    /** 하네스·사람이 **60초를 기다리지 않고** 한 바퀴 돌려 보려고 드러낸다. */
    window._dailyPollTick = pollTick;

    /** 다음 바퀴에 무조건 다시 그리게 한다(저장·알림 확인 직후처럼 내가 바꾼 걸 알 때). */
    window._dailyPollReset = function () { _pollSig = null; };

    (function startPoll() {
        if (_pollTimer) return;
        _pollTimer = setInterval(pollTick, DAILY_POLL_MS);
    })();

    window.dailyOnTabShown = function () {
        if (!window._dailyTabDate) window._dailyTabDate = ymd();
        _pollSig = null;                 // 지금 그리니 다음 바퀴는 이 상태를 기준으로
        window.dailyRenderTab();
    };

    /** 알림·수신 담당 PC 에서 1회 확인(사람이 누를 때). 백엔드가 구버전이면 404 로 구분된다.
     *  ⚠️ 돌린 **결과를 화면에도 반영**한다 — 전엔 토스트만 띄우고 표는 그대로여서,
     *     방금 들어온 보고를 보려면 탭을 다시 열어야 했다. */
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
            // 방금 들어온 보고가 **지금 표에 보이게** 한다(전엔 탭을 다시 열어야 했다).
            _pollSig = null;
            await window.dailyRenderTab();
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
    /**
     * ↗️ 그 업무의 "막힌 일"을 간트 업무 행의 `[문제점]` 줄로 넣는다(주간보고가 그 줄을 읽는다).
     * [2026-11-05] 칸이 업무마다로 갈리면서 **어느 업무인지 고를 필요가 없어졌다** — 번호로 받는다.
     * ⚠️ 행은 **이름으로 다시 찾는다.** 인덱스는 정렬·추가로 움직이고, 2026-11-04 에 `_rowUid` 가
     *    통째로 바뀌는 것도 봤다.
     * ⚠️ `project` 로 거르지 않는다 — 저장되는 프로젝트 이름은 `.json` 을 뗀 모양이라
     *    `currentDriveFileName` 과 글자가 다르다(그걸로 거르면 **아무도 안 걸린다**).
     *    지금 열린 간트에서 같은 이름의 행을 찾는 것으로 충분하다.
     */
    window.dailyPromoteIssue = function (idx) {
        var it = (_doc && _doc.items || [])[idx];
        if (!it) { toast(T('어느 업무인지 알 수 없습니다.', 'No such task.'), 'info'); return; }
        var txt = String(it.issue || '').trim();
        if (!txt) { toast(T('이 업무의 「막힌 일」이 비어 있습니다.', 'This task has no blocker text.'), 'info'); return; }
        var gd = window.globalData, ci = window.colIdx || {};
        if (!Array.isArray(gd) || gd.length < 2 || ci.content == null || ci.content === -1) {
            toast(T('이 프로젝트를 먼저 열어주세요 — 이슈를 적을 업무 행이 필요합니다.',
                    'Open the project first — the issue needs a task row.'), 'warning', 7000);
            return;
        }
        var target = null, label = String(it.name || '');
        for (var i = 1; i < gd.length; i++) {
            if (gd[i] && rowName(gd[i]) === label) { target = gd[i]; break; }
        }
        if (!target) {
            toast(T('지금 열린 간트에서 「' + label + '」 행을 찾지 못했습니다 — 그 프로젝트를 열고 다시 눌러주세요.',
                    'Could not find a row named "' + label + '" in the open Gantt.'), 'warning', 8000);
            return;
        }
        it.promoted = true;
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
                doc.items.push({ name: t.name, project: t.project, cat: t.cat || '', note: '', auto: true });
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
        // 🗓️ 보기 토글 버튼 라벨은 **js/59 가 맡는다** — 그래서 HTML 에 `data-i18n` 을 달지 않았다.
        //    (i18n 맵은 HTML 라벨을 덮어쓰므로, 맵에 맡기면 '하루 보기'가 다시 '월 보기'로 되돌아간다)
        //    ⚠️ 전엔 아무도 안 고쳐서 **월 보기로 바꿔도 버튼이 계속 '월 보기'** 였다.
        var rb = document.querySelector('[data-i18n="btn-daily-roster"]');
        if (rb) {
            rb.title = T('이 표에 나올 팀원 명단 — 누가 \'미작성\' 으로 보일지, 텔레그램으로 온 보고를 누구 것으로 담을지(chat_id)를 정합니다.',
                         'Team roster for this table — who shows as \'not written\', and whose report an incoming Telegram message belongs to (chat_id).');
        }
        var vb = document.getElementById('daily-view-btn');
        if (vb) {
            vb.textContent = (window._dailyView === 'month')
                ? '📅 ' + T('하루 보기', 'Day')
                : '🗓️ ' + T('월 보기', 'Month');
        }
        if (window._storageMode && window._storageMode() !== 'nas') {
            box.innerHTML = '<div style="padding:18px; color:#b1432f; font-size:13px;">' +
                esc(T('일일보고는 사내 NAS 저장소에서만 동작합니다.', 'Daily report requires the NAS storage backend.')) + '</div>';
            return;
        }
        box.innerHTML = '<div style="padding:18px; color:#888; font-size:12.5px;">⏳ ' + esc(T('불러오는 중…', 'Loading…')) + '</div>';
        // 🪪 "내 보고"를 가리려면 내 계정을 알아야 한다. 부팅 때 못 받았을 수 있다(실측).
        await window.dailyEnsureIdentity();

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
            window.dailyRosterSyncIfNotifier();   // 기다리지 않는다 — 화면은 이미 합쳐져 있다
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
        // ⚠️ 계정id 는 주소록 메일에서 **추정**한 값이다(한 명으로만 확인한 규칙).
        //    틀리면 그 사람 보고가 '미작성'으로 남고 아무도 모른다 — 그래서 **명단에 없는
        //    작성자**를 뒤에 붙여, 보고를 쓴 사람이 화면에서 사라지는 일은 없게 한다.
        var known = {};
        people.forEach(function (m) { known[String(m.key || '').toLowerCase()] = 1; });
        docs.forEach(function (d) {
            var k = String(d.key || '').toLowerCase();
            if (k && !known[k]) {
                known[k] = 1;
                people.push({ key: d.key, name: (d.name || d.key) + ' *', team: d.team || '', _stray: true });
            }
        });

        // 📎 남의 보고 첨부는 **인덱스로만** 여다 — 파일 이름이 onclick 속으로
        //    들어가지 않게 한다(이름엔 따옴표·괄호가 섭일 수 있다).
        window._dailyDayFiles = [];
        function dayChipsUnused(d) {
            var fl = (d && d.files) || [];
            if (!fl.length) return '';
            return '<div style="margin-top:5px; display:flex; flex-wrap:wrap; gap:4px;">' + fl.map(function (f) {
                var gi = window._dailyDayFiles.push({ rel: f.rel, name: f.name }) - 1;
                return '<span onclick="window.dailyOpenDayFile(' + gi + ')" title="' + esc(f.name) + '" '
                     + 'style="cursor:pointer; display:inline-block; max-width:160px; overflow:hidden; text-overflow:ellipsis; '
                     + 'white-space:nowrap; padding:1px 7px; border:1px solid #cfe3e5; background:#f2f9fa; color:#2c5f8a; '
                     + 'border-radius:9px; font-size:10.5px;">' + fileIcon(f.name) + ' ' + esc(f.name) + '</span>';
            }).join('') + '</div>';
        }

        var allPeople = people.slice();   // 선택지는 **필터 걸기 전** 목록에서 만든다
        // 🔎 필터 — 사람·프로젝트·구분. 비어 있으면 전부.
        var F = window._dailyFilter || (window._dailyFilter = { who: '', proj: '', cat: '' });
        var itemFiltered = !!(F.proj || F.cat);
        if (F.who) people = people.filter(function (p) { return String(p.key || '') === F.who; });
        if (itemFiltered) {
            people = people.filter(function (p) {
                var dd = byKey[String(p.key || '').toLowerCase()];
                return dd && keepItems(dd.items).length;
            });
        }

        // 📋 [2026-11-05 요청] 안쪽 표를 없애고 **한 겹**으로 편다 —
        //    업무 하나가 한 줄이고, 이름·종류는 `rowspan` 으로 묶는다.
        //    ⚠️ 그래서 `rows` 는 사람당 **여러 줄**이다(전엔 한 줄이었다).
        var td = 'padding:5px 8px; border:1px solid #e3e6ea; vertical-align:top; font-size:12px;';
        // 🎨 [2026-11-05 요청] 구분 열은 **모든 줄에서 같은 배경**, 그리고 **회색이 아니라 팔레트 테마색**.
        //    ⚠️ 색을 여기 인라인으로 박으면 팔레트를 바꿔도 이 표만 안 바뀐다(표를 다시 그려야 하니까).
        //    → 클래스만 달고 색은 styles.css(기본 청록) + js/21 `_cpApplyLive`(라이브)가 정한다.
        var rows = people.map(function (p) {
            var d = byKey[String(p.key || '').toLowerCase()];
            var dbl = ' ondblclick="window._dailyRowDbl(\'' + esc(String(p.key || '')) + '\')"'
                    + ' title="' + esc(T('더블클릭하면 내 보고 쓰기가 열립니다', 'Double-click to open your report')) + '"';
            var nameTd = function (span) {
                return '<td rowspan="' + span + '" style="' + td + ' white-space:nowrap; font-weight:bold;">' +
                       esc(p.name || p.key) + '</td>';
            };
            if (!d) {
                // 🎨 '미작성' 은 테마색이 아니라 그 **보색** — 한눈에 테마와 갈려 보여야 한다(js/21).
                return '<tr class="daily-none-row" style="cursor:pointer;"' + dbl + '>' + nameTd(1) +
                       '<td style="' + td + '" colspan="' + (DAY_COLS.length - 1) + '">' +
                       '<span class="daily-none-txt" style="font-weight:bold;">' + esc(T('미작성', 'Not written')) + '</span></td></tr>';
            }
            var typ = window.DAILY_DAY_TYPES.filter(function (x) { return x.key === d.dayType; })[0] || {};
            var typeTxt = window._currentLang === 'en' ? (typ.en || '') : (typ.ko || '');
            var items = keepItems(d.items);

            // 🧺 기타 = 업무에 안 붙는 것(옛 보고의 보고-단위 글·꼬리표 없는 사진).
            //    ⚠️ 필터가 켜져 있으면 기타는 안 보여 준다 — 어느 업무에도 안 걸리니까.
            var etcTxt = [String(d.aiDone || '').trim(), String(d.next || '').trim(), String(d.issue || '').trim()]
                .filter(Boolean).join('\n');
            var etcFiles = filesOf(d, '');
            var hasEtc = !(window._dailyFilter && (window._dailyFilter.proj || window._dailyFilter.cat))
                      && !!(etcTxt || etcFiles.length);

            var span = items.length + (hasEtc ? 1 : 0);
            if (!span) {   // 일 종류만 적고 넘어간 날(휴가 등)
                return '<tr style="cursor:pointer;"' + dbl + '>' + nameTd(1) +
                       '<td style="' + td + ' white-space:nowrap;">' + esc(typeTxt) + '</td>' +
                       '<td style="' + td + '" colspan="' + (DAY_COLS.length - 2) + '">-</td></tr>';
            }

            var out = [];
            items.forEach(function (it, n) {
                var pj = String((it && it.project) || '').replace(/\.json$/i, '');
                var fs = filesOf(d, it.name);
                out.push('<tr style="cursor:pointer;"' + dbl + '>' +
                    (n === 0 ? nameTd(span) + '<td rowspan="' + span + '" style="' + td + ' white-space:nowrap;">' + esc(typeTxt) + '</td>' : '') +
                    '<td class="daily-cat-cell" style="' + td + '">' + esc(it.cat || '-') + '</td>' +
                    '<td style="' + td + '"><b>' + esc(it.name) + '</b>' +
                      (pj ? '<div style="color:#9aa3ab; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(pj) + '">' + esc(pj) + '</div>' : '') +
                    '</td>' +
                    window.DAILY_FIELDS.map(function (f) {
                        var v = String(it[f.itemKey] || '').trim();
                        return '<td style="' + td + ' white-space:pre-line;' + (f.key === 'issue' && v ? ' background:#fffaf0;' : '') + '">' + esc(v || '-') + '</td>';
                    }).join('') +
                    '<td style="' + td + ' text-align:center;">' + (fs.length ? fileChips(fs) : '<span style="color:#ccc;">-</span>') + '</td>' +
                '</tr>');
            });
            if (hasEtc) {
                out.push('<tr style="cursor:pointer;"' + dbl + '>' +
                    (items.length ? '' : nameTd(span) + '<td rowspan="' + span + '" style="' + td + ' white-space:nowrap;">' + esc(typeTxt) + '</td>') +
                    '<td class="daily-cat-cell" style="' + td + '">-</td>' +
                    '<td style="' + td + ' color:#888;">' + esc(T('(기타)', '(other)')) + '</td>' +
                    '<td style="' + td + ' white-space:pre-line;" colspan="' + window.DAILY_FIELDS.length + '">' + esc(etcTxt || '-') + '</td>' +
                    '<td style="' + td + ' text-align:center;">' + (etcFiles.length ? fileChips(etcFiles) : '<span style="color:#ccc;">-</span>') + '</td>' +
                '</tr>');
            }
            return out.join('');
        }).join('');

        var written = people.filter(function (p) { return byKey[String(p.key || '').toLowerCase()]; }).length;
        box.innerHTML =
          filterBar(allPeople, docs) +
          '<div style="margin-bottom:9px; font-size:12.5px; color:#555;">' +
            esc(T('작성 ', 'Written ')) + '<b>' + written + '</b> / ' + people.length +
            ((F.who || F.proj || F.cat) ? ' <span style="color:#1971c2;">' + esc(T('(필터 적용 중)', '(filtered)')) + '</span>' : '') +
            (roster && roster.length ? '' : ' <span style="color:#b1432f;">' + esc(T('(명단 파일이 없어 쓴 사람만 보입니다)', '(no roster file — showing authors only)')) + '</span>') +
          '</div>' +
          '<table style="width:100%; border-collapse:collapse; table-layout:fixed;">' +
            '<colgroup>' + DAY_COLS.map(function (c) { return '<col' + (c.w ? ' style="width:' + c.w + ';"' : '') + '>'; }).join('') + '</colgroup>' +
            '<thead><tr style="background:#eef6f7;">' +
              DAY_COLS.map(function (c) {
                  return '<th style="padding:6px 8px; border:1px solid #cfe3e5; font-size:12px; color:#2c5f8a;">' +
                         esc(window._currentLang === 'en' ? c.en : c.ko) + '</th>';
              }).join('') +
            '</tr></thead><tbody>' + (rows || '<tr><td colspan="' + DAY_COLS.length + '" style="padding:16px; text-align:center; color:#aaa; font-size:12.5px;">' + esc(T('이 날짜에 작성된 보고가 없습니다.', 'No reports for this date.')) + '</td></tr>') + '</tbody></table>';
    };
})();
