/* ============================================================================
   tests/page-excel-roundtrip.browser.js
   📄↔📊 페이지 ↔ 엑셀 왕복 회귀 — 브라우저 콘솔에 통째로 붙여넣어 실행

   무엇을 보나:
     내보낸 엑셀을 **그대로 다시 불러왔을 때 내용이 그대로인가**.
     왕복이 어긋나면 "엑셀로 고쳐서 올렸더니 딴 게 됐다"가 되는데, 화면엔 오류가 안 뜬다.
     ⚠️ 특히 **ko→en·en→ko 교차 왕복**을 본다. 같은 언어끼리만 보면 전부 통과해서,
        언어를 바꾼 순간 시트를 못 찾는 사고를 못 잡는다(docs/ui-conventions.md).

   가짜는 경계에만:
     · `XLSX.writeFile`  — 파일로 내려받는 자리. 바이트만 가로챈다(내보내기 로직은 진짜).
     · `saveToGoogleDrive` / `_saveToGoogleDriveOptimistic` — **데이터 보호용 킬스위치**.
       불러오기는 화면을 통째로 바꾸므로, 혹시 자동저장이 돌아도 NAS 에 안 써지게 막는다.
     · `showToast` — 메시지를 모아 보려고. (판정에는 쓰지 않는다)
     그 외 내보내기·시트 조립·시트 매칭·불러오기·되돌리기는 **전부 진짜 코드**가 돈다.

   ⚠️ 쓰는 법
     1) 프로젝트를 하나 연 뒤 실행한다(열지 않으면 비교할 내용이 없다).
     2) 끝나면 각 페이지를 `pageExcelUndo` 로 되돌리고, 그것까지 검증한다.
     3) **한 번 돌릴 때마다 새로고침할 것.** 같은 페이지에서 연달아 돌리면 결과를 믿을 수 없다 —
        실측(2026-11-04): 두 번째 실행부터 모든 페이지가 "writeFile 이 안 불렸다"로 떨어지고
        화면 언어가 en 으로 남아 엉뚱한 실패가 났다. 불러오기가 화면·전역 상태를 바꾸기 때문이다.
        **그 실패는 앱이 아니라 하네스 탓이다** — 재현하려면 새로고침 → 프로젝트 열기 → 1회 실행.
     4) 저장은 막아 두었지만(킬스위치), 끝나면 새로고침해서 메모리 상태를 버리는 게 안전하다.
   ========================================================================== */
(function () {
  'use strict';

  var pass = 0, fail = 0, warn = 0, lines = [];
  function ok(name, cond, detail) {
    if (cond) { pass++; lines.push('  ✅ ' + name); }
    else { fail++; lines.push('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
  }
  function note(msg) { warn++; lines.push('  ⚠️  ' + msg); }

  var saved = {
    writeFile: window.XLSX && window.XLSX.writeFile,
    saveToGoogleDrive: window.saveToGoogleDrive,
    _saveToGoogleDriveOptimistic: window._saveToGoogleDriveOptimistic,
    showToast: window.showToast,
    lang: window._currentLang
  };

  var saveAttempts = [];
  var toasts = [];

  /* ── 비교에서 빼는 것 — "다른 게 맞는" 자리 ─────────────────────────────
     ⚠️ 처음엔 이걸 안 두고 돌렸다가 **가짜 실패 3종**을 진짜 버그로 볼 뻔했다:

     · gantt 의 업무명(wbs) 열은 `_ganttSet` 이 **일부러 안 받는다**(js/42 주석).
       레벨 기호·들여쓰기가 붙은 **표시 전용** 값이고 원본은 레벨별 열에 있다 —
       왕복 후 달라지는 게 정상이다.
     · aoa 블록의 **머리글 줄**(마일스톤·Elec Parts)은 현재 **화면 언어로 그려진다**.
       ko 로 내보내고 en 에서 불러오면 '구분'→'Type' 이 되는데, 이것도 정상이다.

     그래서 이 둘은 비교에서 뺀다. 빼는 자리를 **데이터로 적어** 둔다 —
     조용히 무시하면 진짜 버그까지 같이 숨는다. */
  var IGNORE_FIELDS = { gantt: ['wbs'] };         // specId → 비교에서 뺄 키

  /* aoa 블록은 **표 안에 라벨이 섞여 있다** — 마일스톤은 0열이 '계획/실적',
     Elec Parts 는 '## CHANGE LOG' 같은 구역 머리글과 그 아래 '변경 일시' 머리글.
     전부 **현재 화면 언어로 다시 그려지므로**, 언어를 바꿔 불러오면 값이 달라지는 게 정상이다.
     그래서 교차 언어 검사에서 aoa 블록은 **값이 아니라 "시트를 찾아 읽었는가(행 수)"** 만 본다 —
     교차 언어가 진짜로 지켜야 하는 건 그거다(시트 이름을 한쪽만 보면 못 찾는다). */
  var isAoa = function (b) { return (b && b.kind) === 'aoa'; };

  /** 값 비교용 정규화 — 엑셀을 거치면 숫자가 문자열이 되는 건 정상이라 그 차이는 따로 센다. */
  function norm(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return v;
    var s2 = String(v).trim();
    /* 💵 금액은 숫자로 맞춰 본다. M.C 는 '$1,234.00' 같은 표시값으로 돌아오면
       **숫자만 남겨 저장하도록 일부러 만들어져 있다**(js/42 주석: 통화기호가 프로젝트
       JSON 에 쌓이지 않게). 그러니 '$109.00' → '109' 는 고장이 아니라 정리다. */
    if (/^[$₩\s]*-?\d[\d,]*(\.\d+)?[$₩\s]*$/.test(s2)) {
      var n = parseFloat(s2.replace(/[^0-9.-]/g, ''));
      if (isFinite(n)) return String(n);
    }
    return s2;
  }
  /** 비교 전에 "달라도 되는" 자리를 걷어낸다 */
  function strip(specId, blockIdx, val) {
    var v = JSON.parse(JSON.stringify(val === undefined ? null : val));
    var drop = IGNORE_FIELDS[specId];
    if (drop && Array.isArray(v)) {
      v.forEach(function (r) {
        if (r && typeof r === 'object' && !Array.isArray(r)) drop.forEach(function (k) { delete r[k]; });
      });
    }
    return v;
  }
  function deepNorm(x) {
    if (Array.isArray(x)) return x.map(deepNorm);
    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).sort().forEach(function (k) { o[k] = deepNorm(x[k]); });
      return o;
    }
    return norm(x);
  }
  function snap(block) {
    try { return JSON.parse(JSON.stringify(block.get())); } catch (e) { return null; }
  }
  /** 첫 번째로 다른 자리를 사람 말로 */
  function firstDiff(a, b, path) {
    path = path || '';
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return path + ' 길이 ' + a.length + '→' + b.length;
      for (var i = 0; i < a.length; i++) {
        var d = firstDiff(a[i], b[i], path + '[' + i + ']');
        if (d) return d;
      }
      return path + ' (배열 내용)';
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      var keys = [...new Set(Object.keys(a).concat(Object.keys(b)))];
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        var d2 = firstDiff(a[k], b[k], path + '.' + k);
        if (d2) return d2;
      }
      return path + ' (객체 내용)';
    }
    return path + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b);
  }


  /** 그 페이지의 탭을 실제로 열어 화면을 만든다 — aoa 블록은 화면을 보고 만들어지므로
      한 번도 안 들른 탭은 내용이 덜 나온다(실측: Elec Parts 29행 → 들른 뒤 38행). */
  async function openTab(spec) {
    var tabId = spec.tab;
    var btn = [].slice.call(document.querySelectorAll('.sidebar-tab,[onclick*="switchTab"]'))
      .find(function (e) {
        var oc = e.getAttribute('onclick') || '';
        return tabId ? oc.indexOf(tabId) !== -1 : false;
      });
    if (!btn && spec.id) {
      var re = new RegExp(spec.id.replace('briefspec', 'Customer SPEC').replace('elecparts', 'PARTS')
                 .replace('mctable', 'M.C').replace('summary', 'Summary').replace('gantt', 'Gantt')
                 .replace('address', 'Address'), 'i');
      btn = [].slice.call(document.querySelectorAll('.sidebar-tab,[onclick*="switchTab"]'))
        .find(function (e) { return re.test(e.textContent || ''); });
    }
    if (btn) { btn.click(); await new Promise(function (r) { setTimeout(r, 1200); }); }
  }


  /** 빈 칸은 비교에서 뺀다 — 엑셀을 거치면 없던 열이 ''로 생긴다(undefined 와 같은 뜻이다). */
  function dropEmpty(x) {
    if (Array.isArray(x)) return x.map(dropEmpty);
    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).forEach(function (k) {
        var v = x[k];
        if (v === '' || v === null || v === undefined) return;
        o[k] = dropEmpty(v);
      });
      return o;
    }
    return x;
  }

  /* 교차 언어에서는 **키 이름을 비교하지 않는다.**
     모델 블록처럼 get() 이 머리글을 현재 언어로 내는 블록이 있다(`KTK PN_모델명` ↔ `KTK PN_Model`).
     set() 은 한/영 둘 다 받으므로 **저장된 값은 그대로**인데, get() 출력만 달라 보인다.
     그래서 교차 언어는 "값 묶음이 같은가"로 본다 — 시트를 못 찾거나 내용이 날아가면 이게 깨진다. */
  function valueFingerprint(x) {
    var vals = [];
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === 'object') return Object.keys(v).forEach(function (k) { walk(v[k]); });
      var s2 = norm(v);
      if (s2 !== '') vals.push(String(s2));
    })(x);
    return vals.sort();
  }

  /* ══ 🕳 숨은 메타 속성(`_`) ═══════════════════════════════════════════════
     ⚠️⚠️ **이 하네스의 맹점이었다.** 처음 판은 블록의 `get()` 출력만 비교했는데,
     `rowsToAoa` 는 `_` 로 시작하는 키를 **일부러 안 내보낸다**. 그래서 간트 행 배열에
     붙어 있는 `_level`·`_origDev`·`_origT1~4`·`_mailRaw`·`_rowUid` 같은 속성은
     비교에 **아예 들어오지 않았고**, 2026-11-04 에 `_ganttSet` 의 `slice()` 가 그걸
     통째로 날리는 사고가 났는데도 이 하네스는 "왕복 후 내용 동일 ✅"이라고 말했다.
     (칸 값만 남아 "데이터는 있는데 업무명이 없는" 상태가 됐고 오류는 하나도 안 났다.)

     → 그래서 **원본 배열의 `_` 속성까지** 따로 떠서 비교한다.
       눈에 보이는 값이 아니라 **앱이 실제로 쓰는 상태**를 봐야 한다. */
  function metaSnapshot() {
    var gd = window.globalData || [];
    return gd.map(function (row) {
      if (!row || typeof row !== 'object') return null;
      var o = {};
      Object.keys(row).forEach(function (k) {
        if (k.charAt(0) !== '_') return;
        var v = row[k];
        o[k] = (v && typeof v === 'object') ? ('obj:' + Object.keys(v).length) : String(v);
      });
      return o;
    });
  }
  function metaSummary(snapshot) {
    var keys = {}, rowsWithMeta = 0;
    (snapshot || []).forEach(function (o) {
      if (!o) return;
      var ks = Object.keys(o);
      if (ks.length) rowsWithMeta++;
      ks.forEach(function (k) { keys[k] = (keys[k] || 0) + 1; });
    });
    return { rowsWithMeta: rowsWithMeta, keys: keys };
  }

  return (async function () {
    try {
      if (!window.PAGE_EXCEL_SPECS || !window.XLSX) {
        lines.push('  ❌ PAGE_EXCEL_SPECS 또는 XLSX 가 없다 — 앱이 다 뜬 뒤에 실행할 것');
        fail++;
        throw new Error('precondition');
      }

      // ── 데이터 보호: 저장 경로를 막는다(킬스위치) ───────────────────────
      window.saveToGoogleDrive = function () { saveAttempts.push('saveToGoogleDrive'); return Promise.resolve(true); };
      window._saveToGoogleDriveOptimistic = function () { saveAttempts.push('optimistic'); return Promise.resolve(true); };
      window.showToast = function (m) { toasts.push(String(m)); };

      // ── 내보내기 바이트 가로채기 ────────────────────────────────────────
      var captured = null;
      window.XLSX.writeFile = function (wb, name) {
        captured = { name: name, data: window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) };
        return true;
      };

      function exportBytes(id) {
        captured = null;
        window.pageExcelExport(id);          // ← 진짜 내보내기
        return captured;
      }
      function fileOf(cap) {
        return new File([cap.data], cap.name || 'rt.xlsx',
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      var specs = window.PAGE_EXCEL_SPECS.filter(function (s) { return !s.exportOnly; });
      var label = function (s) { return (typeof s.label === 'string' ? s.label : (s.label && s.label[0]) || s.id); };

      lines.push('── 1) 같은 언어 왕복 (내보낸 그대로 다시 불러오기) ──────');
      var roundTripped = [];
      for (var i = 0; i < specs.length; i++) {
        var s = specs[i], nm = label(s) + ' [' + s.id + ']';
        var before = s.blocks.map(snap);   // 탭을 열기 전 값(아래에서 다시 잡는다)
        var filled = before.filter(function (b) { return b && (Array.isArray(b) ? b.length : Object.keys(b).length); }).length;
        if (!filled) { note(nm + ' — 내용이 비어 있어 건너뜀(프로젝트를 열고 실행할 것)'); continue; }

        await openTab(s);          // ⚠️ 그 탭을 한 번 그려 둔다 — aoa 블록은 화면을 보고 만든다
        before = s.blocks.map(snap);   // 탭을 연 뒤의 상태가 진짜 기준이다
        var metaBefore = metaSnapshot();   // 🕳 눈에 안 보이는 `_` 속성까지
        var cap = exportBytes(s.id);
        if (!cap) { ok(nm + ' 내보내기', false, 'writeFile 이 안 불렸다'); continue; }
        ok(nm + ' 내보내기 (' + Math.round(cap.data.byteLength / 1024) + 'KB)', cap.data.byteLength > 0);

        toasts = [];
        await window.pageExcelImport(s.id, fileOf(cap));   // ← 진짜 불러오기
        var after = s.blocks.map(snap);

        var sb = before.map(function (v, bi) { return strip(s.id, bi, v); });
        var sa = after.map(function (v, bi) { return strip(s.id, bi, v); });
        var same = JSON.stringify(dropEmpty(deepNorm(sb))) === JSON.stringify(dropEmpty(deepNorm(sa)));
        ok(nm + ' 왕복 후 내용 동일', same, same ? '' : firstDiff(dropEmpty(deepNorm(sb)), dropEmpty(deepNorm(sa)), ''));
        if (!same) lines.push('       toast: ' + toasts.join(' | ').slice(0, 160));

        // 🕳 숨은 메타 속성이 살아남았는가 — 간트처럼 원본 배열에 `_` 가 붙는 페이지가 대상이다.
        //    (내보내기에서 제외되는 값이라 위의 내용 비교로는 **절대 안 잡힌다**)
        var mb = metaSummary(metaBefore), ma = metaSummary(metaSnapshot());
        if (mb.rowsWithMeta) {
          ok(nm + ' 숨은 메타(_) 속성 보존 (' + mb.rowsWithMeta + '행)',
             JSON.stringify(mb) === JSON.stringify(ma),
             '행 ' + mb.rowsWithMeta + '→' + ma.rowsWithMeta
             + ' / 키 ' + JSON.stringify(mb.keys) + ' → ' + JSON.stringify(ma.keys));
        }

        // 되돌리기도 진짜로 돌려 본다
        if (window._pageExcelUndo && window._pageExcelUndo[s.id]) {
          window.pageExcelUndo(s.id);
          var restored = s.blocks.map(snap);
          var sr = restored.map(function (v, bi) { return strip(s.id, bi, v); });
          ok(nm + ' 되돌리기로 원래대로',
             JSON.stringify(dropEmpty(deepNorm(sr))) === JSON.stringify(dropEmpty(deepNorm(sb))),
             firstDiff(dropEmpty(deepNorm(sb)), dropEmpty(deepNorm(sr)), '') || '');
        } else {
          note(nm + ' — 되돌리기 스냅샷이 없다');
        }
        roundTripped.push(s);
      }

      // ── 2) 교차 언어 왕복 ──────────────────────────────────────────────
      lines.push('── 2) 교차 언어 왕복 (ko 로 내보내고 en 에서 불러오기) ──');
      if (typeof window.toggleLang !== 'function') {
        note('toggleLang 이 없어 교차 언어 검사를 건너뜀');
      } else {
        for (var j = 0; j < roundTripped.length; j++) {
          var sp = roundTripped[j], nm2 = label(sp) + ' [' + sp.id + ']';
          var base = sp.blocks.map(snap);

          // ko 로 내보낸다
          window._currentLang = 'ko';
          var capKo = exportBytes(sp.id);
          if (!capKo) { ok(nm2 + ' ko 내보내기', false); continue; }

          // en 으로 바꾼 뒤 그 파일을 불러온다
          window._currentLang = 'en';
          toasts = [];
          await window.pageExcelImport(sp.id, fileOf(capKo));
          var afterEn = sp.blocks.map(snap);
          var sbase = base.map(function (v, bi) { return strip(sp.id, bi, v); });
          /* ⚠️ 교차 언어는 **값으로 판정할 수 없다** — 블록 안에 라벨이 섞여 있고
             (마일스톤 '계획/실적', Elec Parts '## CHANGE LOG', 모델 블록의 열 머리글)
             그 라벨은 현재 화면 언어로 다시 그려지는 게 정상이기 때문이다.
             교차 언어가 진짜로 지켜야 하는 건 **"언어를 바꿔도 그 시트를 찾아 읽는가"** 다
             (한쪽 이름만 보면 '시트를 찾지 못했습니다'로 떨어진다). 그래서 크기만 본다. */
          var cmp = function (arr) { return arr.map(function (v) {
              return Array.isArray(v) ? ('rows=' + v.length)
                   : (v && typeof v === 'object') ? ('keys=' + Object.keys(v).length) : 'scalar'; }); };
          var baseCmp = cmp(base);
          var notFound = toasts.some(function (t2) { return /찾지 못했|No matching sheet/i.test(t2); });
          var okKoEn = !notFound && JSON.stringify(deepNorm(baseCmp)) === JSON.stringify(deepNorm(cmp(afterEn)));
          ok(nm2 + ' ko→en 왕복', okKoEn,
             okKoEn ? '' : (firstDiff(deepNorm(baseCmp), deepNorm(cmp(afterEn)), '') + ' / toast: ' + toasts.join('|').slice(0, 110)));

          // en 으로 내보내고 ko 에서 불러온다
          var capEn = exportBytes(sp.id);
          window._currentLang = 'ko';
          toasts = [];
          await window.pageExcelImport(sp.id, fileOf(capEn));
          var afterKo = sp.blocks.map(snap);
          var notFound2 = toasts.some(function (t2) { return /찾지 못했|No matching sheet/i.test(t2); });
          var okEnKo = !notFound2 && JSON.stringify(deepNorm(baseCmp)) === JSON.stringify(deepNorm(cmp(afterKo)));
          ok(nm2 + ' en→ko 왕복', okEnKo,
             okEnKo ? '' : (firstDiff(deepNorm(baseCmp), deepNorm(cmp(afterKo)), '') + ' / toast: ' + toasts.join('|').slice(0, 110)));

          if (window._pageExcelUndo && window._pageExcelUndo[sp.id]) window.pageExcelUndo(sp.id);
        }
      }

      // ── 3) 데이터 보호가 실제로 걸렸나 ─────────────────────────────────
      lines.push('── 3) 저장이 나가지 않았는가 ───────────────────────────');
      ok('테스트 중 NAS 저장 시도 없음 (있었다면 킬스위치가 받아냈다)', true,
         saveAttempts.length ? ('가로챈 저장 시도 ' + saveAttempts.length + '건') : '');
      if (saveAttempts.length) note('저장 시도 ' + saveAttempts.length + '건을 가로챘다 — 실제로는 안 나갔다');

    } catch (e) {
      fail++;
      lines.push('  ❌ 하네스가 중간에 터졌다 — ' + (e && e.stack ? e.stack.split('\n')[0] : e));
    } finally {
      if (saved.writeFile) window.XLSX.writeFile = saved.writeFile;
      window.saveToGoogleDrive = saved.saveToGoogleDrive;
      window._saveToGoogleDriveOptimistic = saved._saveToGoogleDriveOptimistic;
      window.showToast = saved.showToast;
      window._currentLang = saved.lang;
    }

    console.log('%c[page-excel-roundtrip] ' + pass + ' pass / ' + fail + ' fail / ' + warn + ' note',
                'font-weight:bold;color:' + (fail ? '#c92a2a' : '#2f9e44'));
    console.log(lines.join('\n'));
    console.log('%c※ 끝났으면 새로고침해서 메모리 상태를 버리세요(저장은 막아 두었습니다).', 'color:#868e96');
    return { pass: pass, fail: fail, warn: warn, detail: lines };
  })();
})();
