// 🧬 EDID 판독기(js/77) + 지원 해상도 열쇠(js/69 resKeyOf) 맞물림 검증
//   실행: node tests/edid-parse.test.js
//   ⚠️ 실제 고객 EDID 파일은 저장소에 넣지 않는다(공개 저장소) — 여기 EDID 는 전부 **합성**이다.
//   가짜 0개: js/77 은 순수 함수라 그대로 부르고, js/69 는 DOM 없이 정의만 하므로 그대로 불러 열쇠를 대조한다.
'use strict';
const path = require('path');
const fs = require('fs');

global.window = globalThis;
const EDID = require(path.join(__dirname, '..', 'js', '77-edid-parse.js'));
// js/69 — 최상위는 함수 정의뿐이라 DOM 없이 불린다
new Function(fs.readFileSync(path.join(__dirname, '..', 'js', '69-resolution-spec.js'), 'utf8'))();

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };

// ── 합성 EDID 만들기 ─────────────────────────────────────────────
const dtd = (t) => {  // { pclkKHz, ha, hb, hfp, hsw, va, vb, vfp, vsw, hmm, vmm, flags }
    const p = t.pclkKHz / 10, b = new Array(18).fill(0);
    b[0] = p & 0xFF; b[1] = p >> 8;
    b[2] = t.ha & 0xFF; b[3] = t.hb & 0xFF; b[4] = ((t.ha >> 8) << 4) | (t.hb >> 8);
    b[5] = t.va & 0xFF; b[6] = t.vb & 0xFF; b[7] = ((t.va >> 8) << 4) | (t.vb >> 8);
    b[8] = t.hfp & 0xFF; b[9] = t.hsw & 0xFF; b[10] = ((t.vfp & 0xF) << 4) | (t.vsw & 0xF);
    b[11] = ((t.hfp >> 8) << 6) | ((t.hsw >> 8) << 4) | ((t.vfp >> 4) << 2) | (t.vsw >> 4);
    b[12] = (t.hmm || 0) & 0xFF; b[13] = (t.vmm || 0) & 0xFF; b[14] = (((t.hmm || 0) >> 8) << 4) | ((t.vmm || 0) >> 8);
    b[17] = t.flags == null ? 0x1E : t.flags;
    return b;
};
const name = (s) => { const b = [0, 0, 0, 0xFC, 0]; for (let i = 0; i < 13; i++) b.push(i < s.length ? s.charCodeAt(i) : (i === s.length ? 0x0A : 0x20)); return b; };
const fix = (blk) => { let s = 0; for (let i = 0; i < 127; i++) s += blk[i]; blk[127] = (256 - (s & 0xFF)) & 0xFF; return blk; };

const DTD_1080 = { pclkKHz: 148500, ha: 1920, hb: 280, hfp: 88, hsw: 44, va: 1080, vb: 45, vfp: 4, vsw: 5, hmm: 527, vmm: 296 };
const DTD_1200RB = { pclkKHz: 154000, ha: 1920, hb: 160, hfp: 48, hsw: 32, va: 1200, vb: 35, vfp: 3, vsw: 6 };
const DTD_1080I = { pclkKHz: 74250, ha: 1920, hb: 280, hfp: 88, hsw: 44, va: 540, vb: 22, vfp: 2, vsw: 5, flags: 0x9E };

const base = (opts) => {
    const b = new Array(128).fill(0);
    [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00].forEach((v, i) => { b[i] = v; });
    // 'TST' = T(20) S(19) T(20)
    const m = (20 << 10) | (19 << 5) | 20; b[8] = m >> 8; b[9] = m & 0xFF;
    b[10] = 0x34; b[11] = 0x12; b[16] = 5; b[17] = 2026 - 1990;
    b[18] = 1; b[19] = opts.v14 ? 4 : 3;
    b[20] = opts.analog ? 0x08 : (0x80 | (opts.iface || 0));
    b[21] = 53; b[22] = 30;
    b[35] = 0x21; b[36] = 0x08; b[37] = 0x00;          // 640×480@60, 800×600@60, 1024×768@60
    for (let i = 38; i < 54; i++) b[i] = 0x01;
    b[38] = 0x81; b[39] = 0x80;                         // 1280×1024@60 (5:4)
    const descs = opts.descs || [dtd(DTD_1080), dtd(DTD_1200RB), name('TEST MON'), [0, 0, 0, 0x10].concat(new Array(14).fill(0))];
    descs.forEach((d, k) => d.forEach((v, i) => { b[54 + k * 18 + i] = v; }));
    b[126] = opts.ext || 0;
    return fix(b);
};
const cta = (vics, extraDtds) => {
    const b = new Array(128).fill(0);
    b[0] = 0x02; b[1] = 0x03;
    const vdb = [(2 << 5) | vics.length].concat(vics);
    vdb.forEach((v, i) => { b[4 + i] = v; });
    b[2] = 4 + vdb.length;
    (extraDtds || []).forEach((d, k) => d.forEach((v, i) => { b[b[2] + k * 18 + i] = v; }));
    return fix(b);
};

// ── 1. 기본 블록만 ──────────────────────────────────────────────
console.log('1. 기본 블록');
let r = EDID.parse(Uint8Array.from(base({})));
ok(r.ok, '읽힌다');
ok(r.vendor === 'TST' && r.product === '0x1234' && r.year === 2026 && r.name === 'TEST MON', '머리 정보 ' + [r.vendor, r.product, r.year, r.name]);
ok(r.checksums[0].valid, '체크섬 유효');
const labels = r.modes.map(m => m.label);
['640×480@60', '800×600@60', '1024×768@60', '1280×1024@60', '1920×1080@60', '1920×1200@60 (RB)'].forEach(l => ok(labels.includes(l), '모드 ' + l + ' (있는 것: ' + labels.join(', ') + ')'));
ok(r.modes.length === 6, '모드 6개 — ' + r.modes.length);
ok(r.native && r.native.label === '1920×1080@60', '기본 해상도 = 첫 DTD');
const t1080 = r.modes.find(m => m.label === '1920×1080@60').timing;
ok(t1080 && t1080.pclkMHz === 148.5 && t1080.hTotal === 2200 && t1080.vTotal === 1125, 'DTD 타이밍 값');
ok(t1080.hPol === '+' && t1080.vPol === '+', '싱크 극성');
// ⚠️ DMT 640×480@60 도 가로 블랭킹 160 — RB 로 오판하면 안 된다
const dmt640 = { pclkKHz: 25175, ha: 640, hb: 160, hfp: 16, hsw: 96, va: 480, vb: 45, vfp: 10, vsw: 2 };
r = EDID.parse(Uint8Array.from(base({ descs: [dtd(dmt640), name('X'), [0, 0, 0, 0x10].concat(new Array(14).fill(0)), [0, 0, 0, 0x10].concat(new Array(14).fill(0))] })));
ok(r.modes.find(m => m.w === 640 && m.timing) && !r.modes.find(m => m.w === 640 && m.timing).rb, '640×480 DMT 는 RB 아님');
ok(r.modes.filter(m => m.w === 640 && m.h === 480).length === 1, '같은 모드(기본 타이밍+DTD)는 한 줄로 합쳐진다');

// ── 2. 입력 모양 ────────────────────────────────────────────────
console.log('2. 입력 모양');
const bytes = base({});
const hexPlain = EDID.hex(bytes);
ok(EDID.parse(hexPlain).ok, '16진 덤프(공백)');
const withOffsets = hexPlain.split('\n').map((l, i) => ('000' + (i * 16).toString(16)).slice(-4) + ': ' + l).join('\n');
r = EDID.parse(withOffsets);
ok(r.ok && r.checksums[0].valid && r.modes.length === 6, '주소 칸 있는 덤프(0010: …) — 주소가 바이트로 섞이지 않는다');
ok(EDID.parse(bytes.map(v => '0x' + ('0' + v.toString(16)).slice(-2)).join(', ')).ok, '0x.., 쉼표 형식');
ok(EDID.parse(bytes.map(v => ('0' + v.toString(16)).slice(-2)).join('')).ok, '붙여 쓴 16진');
ok(EDID.parse(Buffer.from('--- EDID dump ---\n' + hexPlain + '\n')).ok, '글자 파일(바이트로 들어온 텍스트)');
ok(EDID.parse(Uint8Array.from([1, 2, 3].concat(bytes))).ok, '앞에 쓰레기 바이트가 있어도 머리부터');
r = EDID.parse('hello world');
ok(!r.ok && /머리/.test(r.error), '머리 없음 → 오류 문구');
r = EDID.parse(Uint8Array.from(bytes.slice(0, 100)));
ok(!r.ok && /128/.test(r.error), '128바이트 미만 → 오류');
const bad = bytes.slice(); bad[60] ^= 1;
r = EDID.parse(Uint8Array.from(bad));
ok(r.ok && !r.checksums[0].valid && r.warn.length, '체크섬 틀림 → 읽되 경고');

// ── 3. CTA 확장 ─────────────────────────────────────────────────
console.log('3. CTA-861 확장');
const b2 = base({ ext: 1, iface: 2, v14: true }).concat(cta([16 | 0x80, 4, 97, 5, 220], [dtd(DTD_1080I)]));
r = EDID.parse(Uint8Array.from(b2));
ok(r.ok && r.blocks === 2 && r.checksums.every(c => c.valid), '두 블록, 체크섬 둘 다 유효');
const l2 = r.modes.map(m => m.label);
['3840×2160@60', '1280×720@60', '1920×1080i@60'].forEach(l => ok(l2.includes(l), 'CTA 모드 ' + l + ' (' + l2.join(', ') + ')'));
ok(l2.filter(l => l === '1920×1080@60').length === 1, 'VIC 16 과 DTD 1080p 는 한 줄');
ok(r.modes.find(m => m.label === '1920×1080@60').srcs.includes('CTA VIC 16'), '출처가 합쳐진다');
ok(r.notes.some(n => /VIC 220/.test(n)), '모르는 VIC 은 지어내지 않고 드러낸다');
ok(r.portGuess === 'HDMI', 'EDID 1.4 입력 종류로 포트 추정(HDMI) — ' + r.portGuess);
ok(r.modes.filter(m => m.label === '1920×1080i@60').length === 1, 'CTA DTD 인터레이스 = VIC 5 와 한 줄');
// 확장 수는 적혀 있는데 잘린 파일
r = EDID.parse(Uint8Array.from(base({ ext: 1 })));
ok(r.ok && r.blocks === 1 && r.warn.some(w => /확장/.test(w)), '잘린 확장 → 있는 만큼 + 경고');

// ── 4. 아날로그 → RGB ───────────────────────────────────────────
r = EDID.parse(Uint8Array.from(base({ analog: true })));
ok(r.portGuess === 'RGB' && !r.digital, '아날로그 입력 → RGB 추정');

// ── 5. js/69 열쇠와 맞물리는가 ──────────────────────────────────
console.log('4. js/69 resKeyOf 맞물림');
window.tabData = {};
const all = window.resAllRows();
const keyOf = (l) => window.resKeyOf(l);
const inCat = (l) => all.some(row => row.key === keyOf(l));
ok(inCat('1920×1200@60 (RB)') && all.find(row => row.key === keyOf('1920×1200@60 (RB)')).label === 'VESA 1920×1200@60 (RB)', 'RB 모드 → 카탈로그 RB 줄');
ok(keyOf('1920×1200@60 (RB)') !== keyOf('1920×1200@60'), 'RB 와 일반은 다른 열쇠');
ok(inCat('1920×1080i@60') && keyOf('1920×1080i@60') !== keyOf('1920×1080@60'), '인터레이스는 다른 열쇠, 카탈로그에 있음');
ok(inCat('3840×2160@60') && inCat('2560×1440@60') && inCat('640×480@60'), '흔한 모드는 카탈로그에 있다');
ok(keyOf(EDID.labelOf({ w: 640, h: 480, hz: 59.94, i: false, rb: false })) === keyOf('VESA 640×480@59.9'), '59.94 → 60 반올림이 카탈로그와 같다');

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
