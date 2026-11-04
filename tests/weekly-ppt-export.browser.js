/* ============================================================================
   tests/weekly-ppt-export.browser.js
   📋 주간보고 PPT 출력 회귀 — 브라우저 콘솔에 통째로 붙여넣어 실행

   무엇을 보나:
     "📥 PPT 출력"이 **진짜 파일을 만들어 내는가**. 내려받기는 눈으로 열어 보기 전엔
     깨졌는지 알 수 없어서, 여기서는 **만들어진 바이트를 직접 뜯어본다** —
     zip 인가 · 슬라이드가 몇 장인가 · 그 안에 이 프로젝트의 글자가 들어 있는가.

   가짜는 경계에만:
     · `PptxGenJS.prototype.writeFile` — **내려받는 자리 하나만** 가로채 바이트를 받는다.
       슬라이드를 조립하는 코드는 전부 진짜가 돈다.
     그 외 색상 선택 모달·AI 미리보기 모달은 **진짜 버튼을 눌러서** 지난다.

   ⚠️ AI 할당량
     AI 미리보기 모달은 키가 있으면 AI를 부를 수 있다. 이 하네스는 **"취소 (직접 출력)"**
     쪽으로 지나가므로 원본 데이터로 출력한다 — 하루 한도를 쓰지 않는다.

   ⚠️ 쓰는 법
     1) 프로젝트를 열고, 주간보고에 내용이 있는 주로 맞춰 둔 뒤 실행한다.
     2) 파일은 **저장되지 않는다**(내려받기를 가로채므로 디스크에 안 남는다).
   ========================================================================== */
(function () {
  'use strict';

  var pass = 0, fail = 0, lines = [];
  function ok(name, cond, detail) {
    if (cond) { pass++; lines.push('  ✅ ' + name); }
    else { fail++; lines.push('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /** 만들어진 .pptx(zip)를 뜯어 본다 — 외부 라이브러리 없이 중앙 디렉터리를 직접 읽는다. */
  async function openPptx(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), entries = [];
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var nameLen = dv.getUint16(off + 28, true);
      entries.push({
        name: new TextDecoder().decode(u8.slice(off + 46, off + 46 + nameLen)),
        method: dv.getUint16(off + 10, true),
        compSize: dv.getUint32(off + 20, true),
        localOff: dv.getUint32(off + 42, true)
      });
      off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
    }
    async function read(e) {
      var lh = e.localOff;
      var start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      var data = u8.slice(start, start + e.compSize);
      if (e.method === 0) return new TextDecoder().decode(data);
      var out = await new Response(new Blob([data]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      return new TextDecoder().decode(out);
    }
    return { entries: entries, read: read };
  }

  var saved = { writeFile: window.PptxGenJS && window.PptxGenJS.prototype.writeFile };

  return (async function () {
    try {
      if (typeof PptxGenJS === 'undefined') { ok('PptxGenJS 로드됨', false, '라이브러리가 없다'); throw new Error('no lib'); }
      if (typeof window.exportWeeklyReportPPT !== 'function') { ok('exportWeeklyReportPPT 있음', false); throw new Error('no fn'); }

      // 주간보고 탭을 연다 — 화면을 보고 만드는 값이 있다
      var wtab = [].slice.call(document.querySelectorAll('.sidebar-tab,[onclick*="switchTab"]'))
        .find(function (e) { return /Weekly/.test(e.textContent || ''); });
      if (wtab) { wtab.click(); await sleep(1800); }

      // ── 내려받기 경계만 가로챈다 ────────────────────────────────────────
      var captured = null;
      window.PptxGenJS.prototype.writeFile = async function (opts) {
        var b = await this.write({ outputType: 'arraybuffer' });
        captured = { fileName: (opts && opts.fileName) || '', buf: b };
        return captured.fileName;
      };

      /** 출력 1회 — colorBtn: 'pcc-default'|'pcc-current'|'pcc-cancel', pvBtn: 'wr-pv-skip'|'wr-pv-save'|'wr-pv-x' */
      async function runExport(colorBtn, pvBtn) {
        captured = null;
        var p = window.exportWeeklyReportPPT();
        await sleep(1000);
        var cb = document.getElementById(colorBtn);
        if (!cb) return { err: '색상 모달에 ' + colorBtn + ' 없음' };
        cb.click();
        if (colorBtn === 'pcc-cancel') { await p.catch(function () {}); return { cancelled: true }; }
        await sleep(2500);
        var pb = document.getElementById(pvBtn);
        if (!pb) return { err: '미리보기 모달에 ' + pvBtn + ' 없음' };
        pb.click();
        for (var i = 0; i < 25 && !captured; i++) await sleep(600);
        await p.catch(function () {});
        return { cap: captured };
      }

      // ── 1) 기본 테마 색상으로 출력 ──────────────────────────────────────
      lines.push('── 1) 기본 테마 색상으로 출력 ──────────────────────────');
      var r1 = await runExport('pcc-default', 'wr-pv-skip');
      ok('색상 선택 모달이 뜨고 "기본 테마 색상"을 누를 수 있다', !r1.err, r1.err || '');
      ok('PPT 파일이 만들어졌다', !!(r1.cap && r1.cap.buf && r1.cap.buf.byteLength > 10000),
         r1.cap ? (Math.round(r1.cap.buf.byteLength / 1024) + 'KB') : '안 만들어짐');

      if (r1.cap) {
        var u = new Uint8Array(r1.cap.buf);
        ok('진짜 pptx(zip) 다', u[0] === 0x50 && u[1] === 0x4B, u[0] + ',' + u[1]);
        ok('파일 이름에 프로젝트명과 "주간보고"가 들어간다',
           /\.pptx$/.test(r1.cap.fileName) && /주간보고|Weekly/i.test(r1.cap.fileName),
           r1.cap.fileName);

        var z = await openPptx(r1.cap.buf);
        ok('zip 을 열 수 있다', !!z);
        if (z) {
          var slides = z.entries.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e.name); });
          ok('슬라이드가 1장 이상 들어 있다 (' + slides.length + '장)', slides.length >= 1);

          var xml = await z.read(slides[0]);
          var texts = [];
          var re = /<a:t>([^<]*)<\/a:t>/g, m;
          while ((m = re.exec(xml))) if (m[1]) texts.push(m[1]);
          ok('첫 슬라이드에 글자가 들어 있다 (' + texts.length + '개)', texts.length >= 5);

          // 이 프로젝트의 내용이 실제로 담겼는가 — 빈 껍데기가 아닌지
          var joined = texts.join(' ');
          ok('주간보고 항목(과제개요/개발일정 등)이 보인다',
             /과제개요|과제구분|개발일정|투입자원|Overview|Schedule/.test(joined),
             joined.slice(0, 60));
        }
      }

      // ── 2) 현재 테마 색상으로도 나온다 ──────────────────────────────────
      lines.push('── 2) 현재 테마 색상으로 출력 ──────────────────────────');
      var r2 = await runExport('pcc-current', 'wr-pv-skip');
      ok('"현재 테마 색상"으로도 파일이 나온다',
         !!(r2.cap && r2.cap.buf && r2.cap.buf.byteLength > 10000),
         r2.err || (r2.cap ? Math.round(r2.cap.buf.byteLength / 1024) + 'KB' : '안 나옴'));

      // ── 3) 취소하면 아무 파일도 안 만든다 ───────────────────────────────
      lines.push('── 3) 취소 ─────────────────────────────────────────────');
      var r3 = await runExport('pcc-cancel');
      ok('색상 모달에서 취소하면 파일을 안 만든다', !captured, captured ? '파일이 만들어졌다' : '');

      captured = null;
      var r4 = await runExport('pcc-default', 'wr-pv-x');
      ok('미리보기에서 ✕ 로 닫으면 파일을 안 만든다', !r4.cap, r4.err || (r4.cap ? '파일이 만들어졌다' : ''));

    } catch (e) {
      fail++;
      lines.push('  ❌ 하네스가 중간에 터졌다 — ' + (e && e.stack ? e.stack.split('\n')[0] : e));
    } finally {
      if (saved.writeFile) window.PptxGenJS.prototype.writeFile = saved.writeFile;
      ['ppt-color-choice-modal', 'wr-pv-overlay', 'wr-pv-box'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { try { el.style.display = 'none'; } catch (_) {} }
      });
    }

    console.log('%c[weekly-ppt-export] ' + pass + ' pass / ' + fail + ' fail',
                'font-weight:bold;color:' + (fail ? '#c92a2a' : '#2f9e44'));
    console.log(lines.join('\n'));
    return { pass: pass, fail: fail, detail: lines };
  })();
})();
