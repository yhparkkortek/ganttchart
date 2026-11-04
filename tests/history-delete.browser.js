/* ============================================================================
   tests/history-delete.browser.js
   📜 수정이력 "구간 삭제" 7범위 회귀 — 브라우저 콘솔에 통째로 붙여넣어 실행

   · 왜 필요한가: 2026-11-04에 화면마다 복사돼 있던 7벌(300줄)을 공용 엔진
     (js/04i `deleteHistoryByScope` + `HISTORY_SCOPES`) 하나로 합쳤다. 7곳 중
     한 곳이라도 범위 설정(입력칸 prefix·로그 배열·다시 그리기)이 어긋나면
     "삭제를 눌렀는데 아무 일도 안 난다" 또는 "엉뚱한 표가 지워진다"가 되는데,
     둘 다 화면에선 조용하다. 그래서 7범위를 전부 여기서 돌린다.

   · 가짜는 경계에만 둔다 — 관리자 비밀번호 게이트(`adminPwMatches`), 확인창
     (`bmConfirmModal`), 알림창(`bmAlertModal`), 표 다시 그리기 함수뿐.
     날짜 파싱·구간 판정·입력칸 조회·배열 필터는 전부 진짜 코드가 돈다.
     호출도 버튼에 달린 바로 그 함수(`window.delete*HistoryByDateRange`)를 부른다.

   · 사용법: 앱을 연 뒤(프로젝트는 안 열어도 됨) 콘솔에 붙여넣기.
     데이터는 건드리지 않는다 — 시작할 때 원본을 통째로 보관하고 끝에 되돌린다.
   ========================================================================== */
(function () {
  'use strict';

  var pass = 0, fail = 0, lines = [];
  function ok(name, cond, detail) {
    if (cond) { pass++; lines.push('  ✅ ' + name); }
    else { fail++; lines.push('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
  }

  // ── 원본 보관 (끝에서 전부 되돌린다) ───────────────────────────────────
  var saved = {
    tabData: window.tabData,
    changeLogs: window.changeLogs,
    adminPwMatches: window.adminPwMatches,
    adminPwGateFailMessage: window.adminPwGateFailMessage,
    bmConfirmModal: window.bmConfirmModal,
    bmAlertModal: window.bmAlertModal,
    alert: window.alert,
    confirm: window.confirm
  };
  var RERENDER = ['showHistoryModal', 'sumRenderHistoryTable', 'bsRenderHistoryTable',
                  'mcRenderHistoryTable', 'addrRenderHistoryTable', 'pcRenderHistoryTable',
                  'epRenderHistoryTable'];
  RERENDER.forEach(function (k) { saved[k] = window[k]; });

  var madeEls = [];                    // 이 하네스가 만든 입력칸만 지운다
  function inputEl(id, type, value) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('input');
      el.id = id; el.type = type;
      document.body.appendChild(el);
      madeEls.push(el);
    }
    el.value = value;
    return el;
  }

  // ── 가짜(경계만) ───────────────────────────────────────────────────────
  var alerts = [], rerendered = [];
  window.adminPwGateFailMessage = function () { return 'PW-FAIL'; };
  window.bmAlertModal = function (m) { alerts.push(String(m)); };
  window.alert = function (m) { alerts.push(String(m)); };
  window.bmConfirmModal = function (msg, onYes) { alerts.push('CONFIRM:' + msg); onYes(); };
  window.confirm = function () { return true; };
  RERENDER.forEach(function (k) {
    window[k] = function () { rerendered.push(k + (arguments.length ? '(' + arguments[0] + ')' : '')); };
  });

  // ── 로그 3건: 1건만 구간 안(2026-06-15), 2건은 밖 ────────────────────
  var FROM = '2026-06-10', TO = '2026-06-20';
  function seed() {
    return [
      { time: '2026. 6. 1. 오전 9:00:00', rowName: 'before', colName: 'c' },
      { time: '2026. 6. 15. 오후 3:24:00', rowName: 'inside', colName: 'c' },
      { time: '2026. 7. 1. 오후 1:00:00', rowName: 'after',  colName: 'c' }
    ];
  }

  // scope: [표시이름, 입력칸 prefix, 로그를 넣는 함수, 로그를 읽는 함수, 호출]
  var EP_TYPE = 'adbd';
  var CASES = [
    ['gantt  (Gantt 변경 이력)', 'history-del-',
      function (v) { window.changeLogs = v; },
      function () { return window.changeLogs; },
      function () { window.deleteHistoryByDateRange(); }],
    ['sum    (Summary)', 'sum-history-del-',
      function (v) { window.tabData.sumChangeLog = v; },
      function () { return window.tabData.sumChangeLog; },
      function () { window.deleteSumHistoryByDateRange(); }],
    ['bs     (Customer SPEC)', 'bs-history-del-',
      function (v) { window.tabData.bsChangeLog = v; },
      function () { return window.tabData.bsChangeLog; },
      function () { window.deleteBsHistoryByDateRange(); }],
    ['mc     (M.C Table)', 'mc-history-del-',
      function (v) { window.tabData.mcChangeLog = v; },
      function () { return window.tabData.mcChangeLog; },
      function () { window.deleteMcHistoryByDateRange(); }],
    ['addr   (Address)', 'addr-history-del-',
      function (v) { window.tabData.addressChangeLog = v; },
      function () { return window.tabData.addressChangeLog; },
      function () { window.deleteAddrHistoryByDateRange(); }],
    ['pc     (Panel Compare)', 'pc-history-del-',
      function (v) { window.tabData.panelCompareChangeLog = v; },
      function () { return window.tabData.panelCompareChangeLog; },
      function () { window.deletePcHistoryByDateRange(); }],
    ['ep     (PARTS ' + EP_TYPE + ')', 'ep-' + EP_TYPE + '-history-del-',
      function (v) { window.tabData.elecCompareChangeLog = { adbd: v }; },
      function () { return window.tabData.elecCompareChangeLog[EP_TYPE]; },
      function () { window.deleteEpHistoryByDateRange(EP_TYPE); }]
  ];

  try {
    lines.push('── 1) 구간 안 1건만 지워지는가 (7범위) ──────────────────');
    CASES.forEach(function (c) {
      var name = c[0], prefix = c[1], put = c[2], get = c[3], run = c[4];
      window.tabData = window.tabData || {};
      window.adminPwMatches = function () { return true; };
      alerts = []; rerendered = [];
      put(seed());
      var pwEl = inputEl(prefix + 'pw', 'password', 'whatever');
      inputEl(prefix + 'from', 'date', FROM);
      inputEl(prefix + 'to', 'date', TO);

      run();

      var left = get() || [];
      var names = left.map(function (l) { return l.rowName; }).join(',');
      ok(name + ' — 2건 남고 inside 만 사라짐', left.length === 2 && names === 'before,after', '남은=' + names);
      ok(name + ' — 비밀번호칸이 비워짐', pwEl.value === '', 'value=' + JSON.stringify(pwEl.value));
      ok(name + ' — "1건" 알림', alerts.some(function (a) { return /(^|[^0-9])1건/.test(a); }),
         alerts.join(' | ').slice(0, 120));
      ok(name + ' — 표를 다시 그림', rerendered.length > 0, rerendered.join(','));
    });

    lines.push('── 2) 비밀번호가 틀리면 한 건도 안 지워진다 ─────────────');
    CASES.forEach(function (c) {
      var name = c[0], prefix = c[1], put = c[2], get = c[3], run = c[4];
      window.adminPwMatches = function () { return false; };
      alerts = [];
      put(seed());
      inputEl(prefix + 'pw', 'password', 'wrong');
      inputEl(prefix + 'from', 'date', FROM);
      inputEl(prefix + 'to', 'date', TO);
      run();
      ok(name + ' — 3건 그대로', (get() || []).length === 3, '남은=' + (get() || []).length);
      ok(name + ' — 거부 메시지', alerts.indexOf('PW-FAIL') !== -1, alerts.join('|'));
    });

    lines.push('── 3) 날짜 검사 (gantt 로 대표) ─────────────────────────');
    window.adminPwMatches = function () { return true; };
    // 3-a) 날짜를 비우면 삭제 안 함
    alerts = []; window.changeLogs = seed();
    inputEl('history-del-pw', 'password', 'x');
    inputEl('history-del-from', 'date', '');
    inputEl('history-del-to', 'date', '');
    window.deleteHistoryByDateRange();
    ok('날짜 미입력 — 3건 그대로', window.changeLogs.length === 3, String(window.changeLogs.length));
    ok('날짜 미입력 — 안내 메시지', alerts.some(function (a) { return /시작일|start date/i.test(a); }), alerts.join('|'));
    // 3-b) 시작일 > 종료일이면 삭제 안 함
    alerts = []; window.changeLogs = seed();
    inputEl('history-del-pw', 'password', 'x');
    inputEl('history-del-from', 'date', TO);
    inputEl('history-del-to', 'date', FROM);
    window.deleteHistoryByDateRange();
    ok('시작일>종료일 — 3건 그대로', window.changeLogs.length === 3, String(window.changeLogs.length));
    ok('시작일>종료일 — 안내 메시지', alerts.some(function (a) { return /늦을 수 없|later than/i.test(a); }), alerts.join('|'));
    // 3-c) 못 읽는 시각 문자열은 건드리지 않는다
    alerts = [];
    window.changeLogs = [{ time: 'garbage', rowName: 'weird' }, { time: '2026. 6. 15. 오후 3:24:00', rowName: 'inside' }];
    inputEl('history-del-pw', 'password', 'x');
    inputEl('history-del-from', 'date', FROM);
    inputEl('history-del-to', 'date', TO);
    window.deleteHistoryByDateRange();
    ok('시각을 못 읽는 기록은 남긴다',
       window.changeLogs.length === 1 && window.changeLogs[0].rowName === 'weird',
       JSON.stringify(window.changeLogs.map(function (l) { return l.rowName; })));

    lines.push('── 4) 범위 레지스트리 자체 ──────────────────────────────');
    ok('HISTORY_SCOPES 가 7범위를 덮는다',
       ['gantt', 'sum', 'bs', 'mc', 'addr', 'pc', 'ep'].every(function (k) { return !!window.HISTORY_SCOPES[k]; }),
       Object.keys(window.HISTORY_SCOPES || {}).join(','));
    ok('모르는 범위는 조용히 넘어가지 않는다',
       (function () {
         var e = console.error, hit = false;
         console.error = function () { hit = true; };
         try { window.deleteHistoryByScope('nope'); } catch (_) {}
         console.error = e;
         return hit;
       })(), '');
    ok('gantt 범위는 changeLogs + mcChangeLog 둘 다 본다',
       window.HISTORY_SCOPES.gantt.logs.length === 2,
       String(window.HISTORY_SCOPES.gantt.logs.length));

  } finally {
    // ── 되돌리기 ─────────────────────────────────────────────────────────
    Object.keys(saved).forEach(function (k) { window[k] = saved[k]; });
    madeEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
  }

  console.log('%c[history-delete] ' + pass + ' pass / ' + fail + ' fail',
              'font-weight:bold;color:' + (fail ? '#c92a2a' : '#2f9e44'));
  console.log(lines.join('\n'));
  return { pass: pass, fail: fail, detail: lines };
})();
