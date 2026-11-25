// 🧬 EDID → 지원 해상도 + Customer SPEC `EDID Check Sum` 칸 — 브라우저 하네스
//   실행: 앱을 **프로젝트 없이** 연 뒤 콘솔에
//     eval(await (await fetch('tests/resolution-edid.browser.js',{cache:'no-store'})).text()); await __resEdidTest()
//   가짜는 경계 둘뿐: 저장 표시(_markNonGanttDirty)·토스트. 판독(js/77)·팝업·미리보기·적용·Customer SPEC 그리기(populateTabData)·
//   **저장이 읽는 길(collectTabData)** 은 진짜다. EDID 는 전부 합성(실제 고객 파일은 저장소에 안 넣는다).
//   ⚠️ 프로젝트가 열려 있으면 거부한다 — tabData 를 합성값으로 바꿔 그린다(앱 자동저장이 그걸 쓸 수 있다).
window.__resEdidTest = async function (opt) {
    opt = opt || {};
    var ok = 0, fail = 0, log = [];
    var check = function (c, m) { if (c) ok++; else { fail++; log.push('✗ ' + m); } };
    if (window.currentDriveFileId && !opt.force) return '⛔ 프로젝트가 열려 있습니다 — 빈 상태에서 돌리세요';
    var saved = { td: window.tabData, dirty: window._markNonGanttDirty, toast: window.showToast, unit: window.mcActiveUnit };
    var toasts = [];
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // 합성 EDID — [kHz, H활성, H블랭크, H앞, H싱크, V활성, V블랭크, V앞, V싱크, 플래그], ext = CTA 블록 VIC 목록
    var mk = function (dtds, ext) {
        var b = []; for (var z = 0; z < 128; z++) b.push(0);
        [0, 255, 255, 255, 255, 255, 255, 0].forEach(function (v, i) { b[i] = v; });
        b[18] = 1; b[19] = 3; b[20] = 0x80; b[35] = 0x20;
        for (var s = 38; s < 54; s++) b[s] = 1;
        dtds.forEach(function (t, k) {
            var o = 54 + k * 18, p = t[0] / 10;
            b[o] = p & 255; b[o + 1] = p >> 8; b[o + 2] = t[1] & 255; b[o + 3] = t[2] & 255; b[o + 4] = ((t[1] >> 8) << 4) | (t[2] >> 8);
            b[o + 5] = t[5] & 255; b[o + 6] = t[6] & 255; b[o + 7] = ((t[5] >> 8) << 4) | (t[6] >> 8);
            b[o + 8] = t[3]; b[o + 9] = t[4]; b[o + 10] = (t[7] << 4) | t[8]; b[o + 17] = t[9];
        });
        for (var d = 54 + dtds.length * 18; d < 126; d += 18) b[d + 3] = 0x10;
        b[126] = ext ? 1 : 0;
        var fix = function (blk) { var sum = 0; for (var q = 0; q < 127; q++) sum += blk[q]; blk[127] = (256 - (sum & 255)) & 255; return blk; };
        fix(b);
        if (ext) {
            var e = []; for (var y = 0; y < 128; y++) e.push(0);
            e[0] = 2; e[1] = 3; e[4] = (2 << 5) | ext.length; ext.forEach(function (v, i) { e[5 + i] = v; }); e[2] = 5 + ext.length;
            b = b.concat(fix(e));
        }
        return Uint8Array.from(b);
    };
    var D1080 = [148500, 1920, 280, 88, 44, 1080, 45, 4, 5, 0x1E], D1440 = [241500, 2560, 160, 48, 32, 1440, 41, 3, 5, 0x1A];
    var rowVal = function () {
        var tr = [].slice.call(document.querySelectorAll('#briefspec-body tr')).filter(function (t) {
            var i = t.querySelector('input[data-field="type"]'); return i && /^EDID\s*Check\s*Sum$/i.test(i.value.trim());
        })[0];
        return tr ? { v: tr.querySelector('input[data-field="modelA"]').value, shown: tr.style.display !== 'none', tr: tr } : null;
    };
    var load = function (bytes, name, port) {
        window.resEdidLoadBytes(bytes, name);
        if (port) window.resEdidSetPort(port);
    };
    try {
        window._markNonGanttDirty = function () {};
        window.showToast = function (m, k) { toasts.push([k, m]); };
        window.mcActiveUnit = '';
        window.tabData = { briefSpec: [
            { type: 'Panel', sub: '', modelA: 'PNL-TEST', note: '' },
            { type: 'F/W Version', sub: '', modelA: 'V1.0', note: '' },
            { type: 'EDID Check Sum', sub: '', modelA: '', note: '' },
            { type: 'Power estimation (Max. W)', sub: 'LCD Monitor', modelA: '30W', note: '' }
        ], documents: {} };
        window.populateTabData();
        var u = window.resActiveUnit();
        check(rowVal() && rowVal().v === '' && !rowVal().shown, '준비: EDID Check Sum 줄은 비어 숨겨져 있다');

        // ① 빈 칸 → 적용하면 자동으로 적힌다
        load(mk([D1440, D1080]), 'P12_DP_TEST.bin');
        var body = document.getElementById('resedid-body').innerText;
        check(/EDID Check Sum: \(비어 있음\)/.test(body) && /적용하면 자동으로 적습니다/.test(body) && !document.getElementById('resedid-sum'),
              '미리보기: 빈 칸은 자동 — 덮어쓰기 상자 없음');
        // 화면에서 사람이 다른 칸을 고쳐 두었다(아직 저장 전) — 적용이 그걸 지우면 안 된다
        var fw = [].slice.call(document.querySelectorAll('#briefspec-body tr')).filter(function (t) { return t.querySelector('input[data-field="type"]').value === 'F/W Version'; })[0];
        fw.querySelector('input[data-field="modelA"]').value = 'V1.1-EDIT';
        var r1 = window.resEdidApply();
        var dp = window.resEdidSaved().DP;
        var sum1 = 'DP ' + window.EDID.parse(dp.hex).checksum;
        check(r1.sum === sum1, '적용 결과에 적은 값 (' + r1.sum + ')');
        check(rowVal().v === sum1 && rowVal().shown, '화면 칸에 적히고 줄이 드러난다 (' + rowVal().v + ')');
        check(window.resEdidSpecSumCurrent() === sum1, '현재값 읽기도 같은 값');
        // 저장이 실제로 지나는 길 — 화면 표를 다시 읽는다
        window.collectTabData();
        var bs = window.tabData.briefSpec;
        var get = function (t) { return (bs.filter(function (r) { return r.type === t; })[0] || {}).modelA; };
        check(get('EDID Check Sum') === sum1, 'collectTabData(저장 경로) 뒤에도 남는다 (' + get('EDID Check Sum') + ')');
        check(get('F/W Version') === 'V1.1-EDIT' && get('Panel') === 'PNL-TEST', '저장 전에 고친 다른 칸도 그대로 (' + get('F/W Version') + ')');
        check(window.tabData.briefSpecByUnit && window.tabData.briefSpecByUnit[window.bsActiveUnit()] === bs, '모델별 저장소(briefSpecByUnit)도 같은 배열');

        // ② 두 번째 포트(HDMI, 확장 블록) — 칸이 "지난번 앱이 쓴 값 그대로" 라 자동, 포트 순서대로 합친다
        load(mk([D1080], [16, 4]), 'EDID_HDMI.bin');
        var hx = window.EDID.parse(mk([D1080], [16, 4]));
        var hdmiSum = 'HDMI ' + hx.checksums.map(function (c) { return c.value; }).join('/');
        check(/적용하면 자동으로 적습니다/.test(document.getElementById('resedid-body').innerText), '앱이 쓴 값 그대로면 자동');
        var r2 = window.resEdidApply();
        check(rowVal().v === hdmiSum + ' · ' + sum1, '포트 순서(RES_PORTS)대로 합치고 확장 블록은 / 로 (' + rowVal().v + ')');

        // ③ 사람이 다른 값을 적어 두면 기본은 그대로 — 덮어쓰기를 켤 때만
        rowVal().tr.querySelector('input[data-field="modelA"]').value = 'DP 0x36 (문서)';
        load(mk([D1440]), 'P12_DP_V2.bin');
        var box = document.getElementById('resedid-sum');
        check(box && !box.checked && /사람이 적은 값과 다릅니다/.test(document.getElementById('resedid-body').innerText), '사람 값과 다르면 덮어쓰기 상자 꺼진 채');
        var r3 = window.resEdidApply();
        check(r3.sum === '' && rowVal().v === 'DP 0x36 (문서)', '기본 적용은 사람 값을 안 덮는다 (' + rowVal().v + ')');
        check(window.resEdidSaved().DP.file === 'P12_DP_V2.bin', '그래도 EDID 자체는 저장된다');
        load(mk([D1440, D1080]), 'P12_DP_V3.bin');
        window.resEdidSetPort('DP');                       // 다시 그려도 사람이 켠 상자가 유지돼야 → 켠 뒤 포트 다시 고르기
        window.resEdidSetWriteSum(true);
        window.resEdidSetPort('DP');
        check(document.getElementById('resedid-sum').checked, '사람이 켠 덮어쓰기는 다시 그려도 유지');
        var r4 = window.resEdidApply();
        check(r4.sum && /^HDMI .* · DP 0x/.test(rowVal().v), '덮어쓰기를 켜면 쓴다 (' + rowVal().v + ')');

        // ④ 항목이 아예 없는 표 — 제자리에 만들어 적는다
        window.tabData = { briefSpec: [
            { type: 'Panel', sub: '', modelA: 'PNL-TEST', note: '' },
            { type: 'Power estimation (Max. W)', sub: 'LCD Monitor', modelA: '30W', note: '' }], documents: {} };
        window.populateTabData();
        // js/43 이 그릴 때 보탬 항목(빈 EDID 줄)을 끼워 넣는다 — 사람이 그 줄을 지운 표를 흉내 낸다(다시 그리는 길을 타게)
        if (rowVal()) rowVal().tr.remove();
        check(rowVal() === null && window.resEdidSpecSumCurrent() === null, '준비: 화면 표에 EDID 줄이 없다');
        load(mk([D1080]), 'X_DP.bin');
        // 이 경로는 표를 통째로 다시 그린다 — 저장 전에 화면에서 고친 칸이 그 바람에 날아가면 안 된다
        var pnl = [].slice.call(document.querySelectorAll('#briefspec-body tr')).filter(function (t) { return t.querySelector('input[data-field="type"]').value === 'Panel'; })[0];
        pnl.querySelector('input[data-field="modelA"]').value = 'PNL-EDIT';
        var r5 = window.resEdidApply();
        var pnl2 = [].slice.call(document.querySelectorAll('#briefspec-body tr')).filter(function (t) { return t.querySelector('input[data-field="type"]').value === 'Panel'; })[0];
        check(pnl2 && pnl2.querySelector('input[data-field="modelA"]').value === 'PNL-EDIT', '다시 그려도 저장 전에 고친 칸이 남는다');
        var types = [].slice.call(document.querySelectorAll('#briefspec-body input[data-field="type"]')).map(function (i) { return i.value; });
        check(rowVal() && rowVal().v === r5.sum && r5.sum, '없던 항목을 만들어 적고 화면에도 그린다 (' + (rowVal() || {}).v + ')');
        check(types.indexOf('EDID Check Sum') >= 0 && types.indexOf('EDID Check Sum') < types.indexOf('Power estimation (Max. W)'),
              '자리는 js/43 규칙대로 Power 위 (' + types.join(' | ') + ')');
        window.collectTabData();
        check((window.tabData.briefSpec.filter(function (r) { return r.type === 'EDID Check Sum'; })[0] || {}).modelA === r5.sum, '저장 경로 뒤에도 남는다');
    } catch (e) {
        fail++; log.push('💥 ' + (e && e.stack || e));
    } finally {
        if (window.resEdidClose) window.resEdidClose();
        window._markNonGanttDirty = saved.dirty; window.showToast = saved.toast;
        window.tabData = saved.td; window.mcActiveUnit = saved.unit;
        try { window.populateTabData(); } catch (e2) { /* 원래 비어 있었다 */ }
    }
    return ok + ' 통과 / ' + fail + ' 실패' + (log.length ? '\n' + log.join('\n') : '');
};
