/* ============================================================================
   tests/reference-excel.browser.js
   📗 참조 엑셀 가져오기 (NAS 이전) 회귀 — 브라우저 콘솔에 통째로 붙여넣어 실행

   · 왜 필요한가: 참조 엑셀은 원래 **구글 시트**였고, 쓰는 곳이 둘이다 —
       ① 새 프로젝트 "🚀 자동으로 가져오기" (워크북 전체 → handleFiles)
       ② Customer SPEC 표준 서식 채우기 (js/43, 시트 하나만)
     저장소가 NAS 로 넘어간 뒤 **둘 다 조용히 실패**했다. ②는 null 을 돌려주고 끝이라
     화면엔 아무 말도 안 나오고 서식만 영영 비어 있었다 — 그래서 사람이 못 알아챈다.
     2026-11-04에 NAS(`Reference/Reference.xlsx`)에서 받도록 바꿨고, 이 하네스가 그걸 지킨다.

   · 가짜는 경계에만 둔다 — `window.fetch`(실패 상황을 만들 때만), `handleFiles`
     (화면을 통째로 덮어쓰므로 받아만 보고 적용하지 않는다), `_storageMode`(드라이브 모드 흉내).
     성공 경로는 **진짜 NAS 에서 진짜 파일**을 받아 진짜 XLSX 로 연다.

   · ⚠️ 이 하네스는 데이터를 쓰지 않는다. handleFiles 를 가로채므로 열려 있는 프로젝트도
     덮어쓰지 않는다. 그래도 **프로젝트를 열지 않은 상태**에서 돌리는 쪽이 안전하다.

   · 전제: 백엔드가 떠 있고 NAS 에 로그인돼 있어야 한다(성공 경로 4건). 아니면 그 4건만 실패한다.
   ========================================================================== */
(function () {
  'use strict';

  var pass = 0, fail = 0, lines = [];
  function ok(name, cond, detail) {
    if (cond) { pass++; lines.push('  ✅ ' + name); }
    else { fail++; lines.push('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
  }

  var saved = {
    fetch: window.fetch,
    handleFiles: window.handleFiles,
    _storageMode: window._storageMode,
    showToast: window.showToast,
    alert: window.alert,
    confirm: window.confirm,
    bmAlertModal: window.bmAlertModal
  };

  return (async function () {
    try {
      // ── 1) 설정 자체 ────────────────────────────────────────────────────
      lines.push('── 1) 배선 ─────────────────────────────────────────────');
      ok('_refExcelBlob 이 있다', typeof window._refExcelBlob === 'function');
      ok('_storageMode 가 있다', typeof window._storageMode === 'function');
      ok('NAS 경로가 데이터로 있다', window.REFERENCE_NAS_REL === 'Reference/Reference.xlsx',
         String(window.REFERENCE_NAS_REL));

      var mode = window._storageMode();
      lines.push('     (지금 저장소 모드: ' + mode + ')');

      // ── 2) 성공 경로 — 진짜 NAS 에서 진짜 파일 ─────────────────────────
      lines.push('── 2) 진짜로 받아온다 (NAS 모드일 때만) ────────────────');
      if (mode === 'nas') {
        var blob = await window._refExcelBlob();
        ok('참조 엑셀을 받았다', blob && blob.size > 10000, 'size=' + (blob && blob.size));
        var head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        ok('받은 바이트가 xlsx(PK) 다', head[0] === 0x50 && head[1] === 0x4B,
           head[0] + ',' + head[1]);
        var wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
        ok('기대하는 시트가 들어 있다',
           wb.SheetNames.indexOf('Summary') !== -1 && wb.SheetNames.indexOf('GanttChart') !== -1
           && wb.SheetNames.some(function (n) { return /Brief SPEC|Customer SPEC/.test(n); }),
           wb.SheetNames.join(','));

        var rows = await window._bsFetchTemplateRows();
        ok('Customer SPEC 표준 서식을 읽는다(null 아님)', Array.isArray(rows) && rows.length > 10,
           Array.isArray(rows) ? ('rows=' + rows.length) : String(rows));
      } else {
        lines.push('  ⏭  NAS 모드가 아니라 건너뜀 (지금: ' + mode + ')');
      }

      // ── 3) 가져오기 파이프라인에 넘기는 것까지 ─────────────────────────
      lines.push('── 3) 자동 가져오기가 importer 까지 간다 ───────────────');
      var handed = null;
      window.handleFiles = function (ev) { var f = ev.target.files[0]; handed = { name: f.name, size: f.size }; };
      var toasts = [];
      window.showToast = function (m) { toasts.push(String(m)); };
      await window.autoImportReferenceExcel();
      ok('handleFiles 에 xlsx File 이 전달된다', handed && handed.size > 10000, JSON.stringify(handed));
      ok('성공 토스트가 뜬다', toasts.some(function (t) { return t.indexOf('참조 엑셀') !== -1; }), toasts.join('|'));
      window.handleFiles = saved.handleFiles;
      window.showToast = saved.showToast;

      // ── 4) 실패 경로 — 사람이 읽을 말이 나오는가 ───────────────────────
      lines.push('── 4) 실패했을 때 ──────────────────────────────────────');
      window._storageMode = function () { return 'nas'; };

      // 4-a) 파일이 없을 때(404)
      window.fetch = function () {
        return Promise.resolve(new Response(JSON.stringify({ ok: false, message: '없는 경로' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }));
      };
      var msg = '';
      try { await window._refExcelBlob(); } catch (e) { msg = String(e.message || e); }
      ok('파일이 없으면 경로를 알려준다',
         msg.indexOf('Reference/Reference.xlsx') !== -1, msg.slice(0, 110));

      // 4-b) 백엔드가 꺼져 있을 때(네트워크 예외)
      window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
      msg = '';
      try { await window._refExcelBlob(); } catch (e) { msg = String(e.message || e); }
      ok('백엔드가 꺼져 있으면 그렇게 말한다', /백엔드|backend/i.test(msg), msg.slice(0, 110));

      // 4-c) xlsx 가 아닌 것이 돌아올 때 (DSM 은 없는 파일에 HTML 을 준다)
      window.fetch = function () {
        return Promise.resolve(new Response('<html>페이지를 찾을 수 없습니다</html>', { status: 200 }));
      };
      msg = '';
      try { await window._refExcelBlob(); } catch (e) { msg = String(e.message || e); }
      ok('엑셀이 아니면 그대로 넘기지 않는다', /엑셀 파일이 아|not an Excel/i.test(msg), msg.slice(0, 110));

      // 4-d) 조용한 호출(위자드 진입)은 창을 띄우지 않는다
      var popped = 0;
      window.alert = function () { popped++; };
      window.bmAlertModal = function () { popped++; };
      window.confirm = function () { popped++; return false; };
      window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
      window.handleFiles = function () { /* 여기 오면 안 된다 */ };
      await window.autoImportReferenceExcel(true);
      ok('silent 호출은 창을 띄우지 않는다', popped === 0, 'popped=' + popped);

      // 4-e) 사람이 누른 경우엔 알린다
      popped = 0;
      await window.autoImportReferenceExcel();
      ok('버튼으로 누르면 실패를 알린다', popped > 0, 'popped=' + popped);

      // ── 5) 캐시 금지 (옛 사본을 읽어 색인을 날린 적이 있다) ────────────
      lines.push('── 5) NAS 읽기에 캐시를 쓰지 않는다 ────────────────────');
      var seen = null;
      window.fetch = function (u, o) {
        seen = { url: String(u), cache: o && o.cache };
        return Promise.reject(new TypeError('stop here'));
      };
      try { await window._refExcelBlob(); } catch (e) { /* 의도된 중단 */ }
      ok("cache:'no-store' 로 부른다", seen && seen.cache === 'no-store', JSON.stringify(seen && seen.cache));
      ok('URL 에 캐시 우회 난수(_cb)가 붙는다', seen && seen.url.indexOf('_cb=') !== -1,
         seen && seen.url.slice(0, 110));
      ok('NAS 백엔드 경로로 부른다', seen && seen.url.indexOf('/nas/app/get') !== -1,
         seen && seen.url.slice(0, 110));

      // ── 6) 드라이브 모드는 NAS 를 부르지 않는다 ────────────────────────
      lines.push('── 6) 드라이브 모드(옛 경로)는 그대로 ──────────────────');
      window._storageMode = function () { return 'drive'; };
      var calls = [];
      window.fetch = function (u) { calls.push(String(u)); return Promise.reject(new TypeError('x')); };
      var hadToken = !!((typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken()
                        && gapi.client.getToken().access_token) || window.googleAccessToken);
      msg = '';
      try { await window._refExcelBlob(); } catch (e) { msg = String(e.message || e); }
      ok('드라이브 모드에서 NAS 를 부르지 않는다',
         !calls.some(function (u) { return u.indexOf('/nas/') !== -1; }), calls.join(' | ').slice(0, 110));
      if (!hadToken) {
        ok('토큰이 없으면 NO_DRIVE_TOKEN 으로 알린다(연동 제안용)', msg === 'NO_DRIVE_TOKEN', msg.slice(0, 80));
      } else {
        ok('토큰이 있으면 드라이브 주소로 간다',
           calls.some(function (u) { return u.indexOf('googleapis.com') !== -1; }), calls.join('|').slice(0, 110));
      }

    } catch (e) {
      fail++;
      lines.push('  ❌ 하네스가 중간에 터졌다 — ' + (e && e.stack ? e.stack.split('\n')[0] : e));
    } finally {
      Object.keys(saved).forEach(function (k) { window[k] = saved[k]; });
    }

    console.log('%c[reference-excel] ' + pass + ' pass / ' + fail + ' fail',
                'font-weight:bold;color:' + (fail ? '#c92a2a' : '#2f9e44'));
    console.log(lines.join('\n'));
    return { pass: pass, fail: fail, detail: lines };
  })();
})();
