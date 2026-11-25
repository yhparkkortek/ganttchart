// 🧬 [2026-11-25 신규] EDID 판독기 — 지원 해상도(js/69)를 실제 EDID 로 채우기 위한 순수 함수
//
//  왜: 지원 해상도 팝업은 사람이 "의도한" 해상도를 체크하는 곳이다. 펌웨어에 실제로 구운
//      EDID 와 그 체크가 같은지 대조할 길이 없었다. 사용자 요청(2026-11-25):
//      "지원 해상도를 EDID DATA 를 이용해서 프로젝트 모델에 셋팅하면 좋을 것 같은데".
//
//  ⚠️ AI 를 안 쓴다 — EDID 는 바이트 규칙(VESA E-EDID 1.3/1.4 + CTA-861)으로 다 읽힌다.
//  ⚠️ DOM·앱 상태를 건드리지 않는다(순수 함수). 화면·적용은 js/69 가 한다.
//     node 하네스(tests/edid-parse.test.js)가 이 파일을 그대로 불러 돌린다.
//  ⚠️ 표(기본 타이밍·CTA VIC)는 **데이터**다 — 모르는 VIC 는 지어내지 않고 `unknown` 으로 드러낸다.
//  ⚠️ EDID 는 "모니터가 광고하는 모드" 이지 "받아 주는 모드 전부" 가 아니다 — 그래서 js/69 는
//     EDID 에 없다고 체크를 **끄지 않는다**(사람이 고른다).
(function (root) {
    'use strict';

    var HEADER = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];

    // ── 기본 지원 타이밍(Established Timings I/II, 바이트 35~37) — 데이터 ──
    //   [바이트, 비트, W, H, Hz, 인터레이스?]
    var EST_TIMINGS = [
        [35, 7, 720, 400, 70], [35, 6, 720, 400, 88], [35, 5, 640, 480, 60], [35, 4, 640, 480, 67],
        [35, 3, 640, 480, 72], [35, 2, 640, 480, 75], [35, 1, 800, 600, 56], [35, 0, 800, 600, 60],
        [36, 7, 800, 600, 72], [36, 6, 800, 600, 75], [36, 5, 832, 624, 75], [36, 4, 1024, 768, 87, true],
        [36, 3, 1024, 768, 60], [36, 2, 1024, 768, 70], [36, 1, 1024, 768, 75], [36, 0, 1280, 1024, 75],
        [37, 7, 1152, 870, 75]
    ];

    // ── CTA-861 VIC 표 — 데이터 ── [W, H, Hz, 인터레이스?]
    //   화면 해상도가 같은 4:3/16:9·64:27 변종은 같은 모드로 합쳐진다(js/69 열쇠가 W×H@Hz).
    var CTA_VIC = {
        1: [640, 480, 60], 2: [720, 480, 60], 3: [720, 480, 60], 4: [1280, 720, 60], 5: [1920, 1080, 60, true],
        6: [720, 480, 60, true], 7: [720, 480, 60, true], 8: [720, 240, 60], 9: [720, 240, 60],
        10: [2880, 480, 60, true], 11: [2880, 480, 60, true], 12: [2880, 240, 60], 13: [2880, 240, 60],
        14: [1440, 480, 60], 15: [1440, 480, 60], 16: [1920, 1080, 60], 17: [720, 576, 50], 18: [720, 576, 50],
        19: [1280, 720, 50], 20: [1920, 1080, 50, true], 21: [720, 576, 50, true], 22: [720, 576, 50, true],
        23: [720, 288, 50], 24: [720, 288, 50], 25: [2880, 576, 50, true], 26: [2880, 576, 50, true],
        27: [2880, 288, 50], 28: [2880, 288, 50], 29: [1440, 576, 50], 30: [1440, 576, 50],
        31: [1920, 1080, 50], 32: [1920, 1080, 24], 33: [1920, 1080, 25], 34: [1920, 1080, 30],
        35: [2880, 480, 60], 36: [2880, 480, 60], 37: [2880, 576, 50], 38: [2880, 576, 50],
        39: [1920, 1080, 50, true], 40: [1920, 1080, 100, true], 41: [1280, 720, 100], 42: [720, 576, 100],
        43: [720, 576, 100], 44: [720, 576, 100, true], 45: [720, 576, 100, true], 46: [1920, 1080, 120, true],
        47: [1280, 720, 120], 48: [720, 480, 120], 49: [720, 480, 120], 50: [720, 480, 120, true],
        51: [720, 480, 120, true], 52: [720, 576, 200], 53: [720, 576, 200], 54: [720, 576, 200, true],
        55: [720, 576, 200, true], 56: [720, 480, 240], 57: [720, 480, 240], 58: [720, 480, 240, true],
        59: [720, 480, 240, true], 60: [1280, 720, 24], 61: [1280, 720, 25], 62: [1280, 720, 30],
        63: [1920, 1080, 120], 64: [1920, 1080, 100],
        65: [1280, 720, 24], 66: [1280, 720, 25], 67: [1280, 720, 30], 68: [1280, 720, 50], 69: [1280, 720, 60],
        70: [1280, 720, 100], 71: [1280, 720, 120], 72: [1920, 1080, 24], 73: [1920, 1080, 25], 74: [1920, 1080, 30],
        75: [1920, 1080, 50], 76: [1920, 1080, 60], 77: [1920, 1080, 100], 78: [1920, 1080, 120],
        79: [1680, 720, 24], 80: [1680, 720, 25], 81: [1680, 720, 30], 82: [1680, 720, 50], 83: [1680, 720, 60],
        84: [1680, 720, 100], 85: [1680, 720, 120], 86: [2560, 1080, 24], 87: [2560, 1080, 25], 88: [2560, 1080, 30],
        89: [2560, 1080, 50], 90: [2560, 1080, 60], 91: [2560, 1080, 100], 92: [2560, 1080, 120],
        93: [3840, 2160, 24], 94: [3840, 2160, 25], 95: [3840, 2160, 30], 96: [3840, 2160, 50], 97: [3840, 2160, 60],
        98: [4096, 2160, 24], 99: [4096, 2160, 25], 100: [4096, 2160, 30], 101: [4096, 2160, 50], 102: [4096, 2160, 60],
        103: [3840, 2160, 24], 104: [3840, 2160, 25], 105: [3840, 2160, 30], 106: [3840, 2160, 50], 107: [3840, 2160, 60]
    };
    // HDMI VSDB 의 HDMI_VIC (1.4b 4K) — 데이터
    var HDMI_VIC = { 1: [3840, 2160, 30], 2: [3840, 2160, 25], 3: [3840, 2160, 24], 4: [4096, 2160, 24] };

    // 디지털 입력 인터페이스(EDID 1.4, 바이트 20 하위 4비트) → js/69 RES_PORTS 열쇠
    var IFACE_PORT = { 1: 'DVI', 2: 'HDMI', 3: 'HDMI', 5: 'DP' };

    var hex2 = function (n) { return ('0' + (n & 0xFF).toString(16).toUpperCase()).slice(-2); };

    // ── 입력 → 바이트 배열 ─────────────────────────────────────────────
    //  · 이진 파일(.bin/.dat): 머리(00 FF…FF 00)가 그대로 들어 있다
    //  · 16진 덤프(.ddc/.hex/.txt): "00 FF FF …", "0x00, 0xFF", "00: 00 FF …"(주소 칸), 붙여 쓴 "00FFFF…"
    //  ⚠️ 주소 칸(`00:`·`0010|`)은 줄 앞에서 떼야 한다 — 안 떼면 그 숫자가 바이트로 섞인다.
    var findHeader = function (arr) {
        for (var i = 0; i + 8 <= arr.length; i++) {
            var ok = true;
            for (var j = 0; j < 8; j++) { if (arr[i + j] !== HEADER[j]) { ok = false; break; } }
            if (ok) return i;
        }
        return -1;
    };
    var textToBytes = function (text) {
        var out = [];
        String(text).split(/\r?\n/).forEach(function (line) {
            line = line.replace(/^\s*(?:0x)?[0-9A-Fa-f]{1,8}\s*[:|]/, '');   // 주소 칸
            line.split(/[\s,;]+/).forEach(function (tok) {
                tok = tok.replace(/^0x/i, '').replace(/h$/i, '');
                if (!tok || !/^[0-9A-Fa-f]+$/.test(tok) || tok.length % 2) return;
                for (var k = 0; k < tok.length; k += 2) out.push(parseInt(tok.substr(k, 2), 16));
            });
        });
        return out;
    };
    /** Uint8Array·ArrayBuffer·배열·문자열 무엇이든 → EDID 바이트(머리부터, 블록 수만큼) 또는 오류 */
    var toEdidBytes = function (input) {
        var raw = null;
        if (input == null) return { error: '내용이 비었습니다.' };
        if (typeof input === 'string') raw = textToBytes(input);
        else {
            var u8 = (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) ? new Uint8Array(input) : input;
            var arr = Array.prototype.slice.call(u8);
            if (findHeader(arr) >= 0) raw = arr;
            else {
                // 이진에 머리가 없으면 글자로 보고 다시 읽는다(16진 덤프 파일)
                var s = '';
                for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
                raw = textToBytes(s);
            }
        }
        var at = findHeader(raw);
        if (at < 0) return { error: 'EDID 머리(00 FF FF FF FF FF FF 00)를 찾지 못했습니다 — EDID 파일이 맞는지 확인해 주세요.' };
        raw = raw.slice(at);
        if (raw.length < 128) return { error: 'EDID 기본 블록(128바이트)이 다 안 들어 있습니다 (' + raw.length + '바이트).' };
        var blocks = 1 + raw[126];
        var warn = [];
        if (raw.length < blocks * 128) {
            warn.push('확장 블록 ' + raw[126] + '개라고 적혀 있는데 ' + Math.floor(raw.length / 128 - 1) + '개만 들어 있습니다 — 있는 만큼만 읽습니다.');
            blocks = Math.floor(raw.length / 128);
        }
        return { bytes: raw.slice(0, blocks * 128), warn: warn };
    };

    // ── 상세 타이밍(DTD, 18바이트) ─────────────────────────────────────
    var parseDtd = function (b, o) {
        var pclk = (b[o] | (b[o + 1] << 8)) * 10;               // kHz
        if (!pclk) return null;
        var hAct = b[o + 2] | ((b[o + 4] & 0xF0) << 4);
        var hBlk = b[o + 3] | ((b[o + 4] & 0x0F) << 8);
        var vAct = b[o + 5] | ((b[o + 7] & 0xF0) << 4);
        var vBlk = b[o + 6] | ((b[o + 7] & 0x0F) << 8);
        var hFp = b[o + 8] | ((b[o + 11] & 0xC0) << 2);
        var hSw = b[o + 9] | ((b[o + 11] & 0x30) << 4);
        var vFp = (b[o + 10] >> 4) | ((b[o + 11] & 0x0C) << 2);
        var vSw = (b[o + 10] & 0x0F) | ((b[o + 11] & 0x03) << 4);
        var hMm = b[o + 12] | ((b[o + 14] & 0xF0) << 4);
        var vMm = b[o + 13] | ((b[o + 14] & 0x0F) << 8);
        var fl = b[o + 17];
        var inter = !!(fl & 0x80);
        var hTot = hAct + hBlk, vTot = vAct + vBlk;
        var hz = hTot && vTot ? (pclk * 1000) / (hTot * vTot) : 0;   // 인터레이스면 필드 주사율
        // CVT 감축 블랭킹 — v1: 블랭킹 160·싱크 32·앞여백 48 / v2: 80·32·8.
        //   ⚠️ 블랭킹 폭 하나로만 보면 안 된다: DMT 640×480@60 도 가로 블랭킹이 160 이다.
        var rb = (hBlk === 160 && hSw === 32 && hFp === 48) || (hBlk === 80 && hSw === 32 && hFp === 8);
        var digSep = (fl & 0x18) === 0x18;
        return {
            w: hAct, h: inter ? vAct * 2 : vAct, i: inter, hz: hz, rb: rb, pclkMHz: pclk / 1000,
            hTotal: hTot, vTotal: vTot, hFront: hFp, hSync: hSw, hBack: hBlk - hFp - hSw,
            vFront: vFp, vSync: vSw, vBack: vBlk - vFp - vSw, imageMm: [hMm, vMm],
            hPol: digSep ? ((fl & 0x02) ? '+' : '-') : '', vPol: digSep ? ((fl & 0x04) ? '+' : '-') : '',
            khz: hTot ? pclk / hTot : 0
        };
    };

    // 표준 타이밍 2바이트 → 모드 (01 01 = 빈 칸)
    var parseStd = function (b1, b2, ver14) {
        if ((b1 === 0x01 && b2 === 0x01) || (b1 === 0 && b2 === 0)) return null;
        var w = (b1 + 31) * 8;
        var ar = b2 >> 6;
        var h = ar === 0 ? (ver14 ? Math.round(w * 10 / 16) : w) : ar === 1 ? Math.round(w * 3 / 4) : ar === 2 ? Math.round(w * 4 / 5) : Math.round(w * 9 / 16);
        return { w: w, h: h, hz: (b2 & 0x3F) + 60, i: false };
    };

    var str13 = function (b, o) {
        var s = '';
        for (var i = 5; i < 18; i++) { var c = b[o + i]; if (c === 0x0A) break; s += String.fromCharCode(c); }
        return s.replace(/\s+$/, '');
    };

    // ── 모드 이름 · 열쇠 ─────────────────────────────────────────────────
    //  ⚠️ 열쇠는 js/69 `resKeyOf` 와 **같은 규칙**이어야 한다(W×H[i]@반올림Hz[RB]).
    //     여기서 따로 만들면 "목록에 있는데 새 줄이 생긴다" 가 난다 → 이름만 만들고 열쇠는 js/69 가 정한다.
    var fmtHz = function (hz) {
        var r = Math.round(hz * 100) / 100;
        return (Math.abs(r - Math.round(r)) < 0.05) ? String(Math.round(r)) : r.toFixed(2).replace(/0$/, '');
    };
    var labelOf = function (m) {
        return m.w + '×' + m.h + (m.i ? 'i' : '') + '@' + fmtHz(m.hz) + (m.rb ? ' (RB)' : '');
    };

    // ── 본체 ─────────────────────────────────────────────────────────────
    var parse = function (input) {
        var got = toEdidBytes(input);
        if (got.error) return { ok: false, error: got.error };
        var b = got.bytes;
        var warn = got.warn.slice();
        var res = { ok: true, bytes: b, blocks: b.length / 128, modes: [], warn: warn, notes: [] };

        // 블록별 체크섬
        res.checksums = [];
        for (var k = 0; k < res.blocks; k++) {
            var sum = 0;
            for (var j = 0; j < 128; j++) sum = (sum + b[k * 128 + j]) & 0xFF;
            res.checksums.push({ block: k, value: '0x' + hex2(b[k * 128 + 127]), valid: sum === 0 });
            if (sum !== 0) warn.push('블록 ' + k + ' 체크섬이 맞지 않습니다(합계 0x' + hex2(sum) + ') — 파일이 깨졌거나 일부만 복사됐을 수 있습니다.');
        }
        res.checksum = res.checksums[0].value;

        // 머리 정보
        var mfg = (b[8] << 8) | b[9];
        res.vendor = String.fromCharCode(64 + ((mfg >> 10) & 31), 64 + ((mfg >> 5) & 31), 64 + (mfg & 31));
        res.product = '0x' + hex2(b[11]) + hex2(b[10]);
        res.serial = (b[12] | (b[13] << 8) | (b[14] << 16) | (b[15] << 24)) >>> 0;
        res.week = b[16];
        res.year = b[17] + 1990;
        res.version = b[18] + '.' + b[19];
        var ver14 = b[18] === 1 && b[19] >= 4;
        res.digital = !!(b[20] & 0x80);
        res.iface = res.digital && ver14 ? (IFACE_PORT[b[20] & 0x0F] || '') : '';
        res.portGuess = res.iface || (res.digital ? '' : 'RGB');
        res.sizeCm = [b[21], b[22]];

        var modes = [];
        var add = function (m, src, extra) {
            if (!m || !m.w || !m.h || !(m.hz > 0)) return;
            var o = { w: m.w, h: m.h, i: !!m.i, hz: m.hz, rb: !!m.rb, src: src };
            if (extra) for (var x in extra) o[x] = extra[x];
            o.label = labelOf(o);
            modes.push(o);
        };

        // 기본 지원 타이밍
        EST_TIMINGS.forEach(function (t) {
            if (b[t[0]] & (1 << t[1])) add({ w: t[2], h: t[3], hz: t[4], i: !!t[5] }, 'Established');
        });
        // 표준 타이밍 8칸
        for (var s = 38; s < 54; s += 2) add(parseStd(b[s], b[s + 1], ver14), 'Standard');

        // 설명자 4칸
        res.dtds = [];
        var dtdNo = 0;
        for (var d = 54; d < 126; d += 18) {
            if (b[d] || b[d + 1]) {
                var t = parseDtd(b, d);
                dtdNo++;
                if (t) { res.dtds.push(t); add(t, 'DTD' + dtdNo, { native: dtdNo === 1, timing: t }); }
                continue;
            }
            var tag = b[d + 3];
            if (tag === 0xFC) res.name = str13(b, d);
            else if (tag === 0xFF) res.serialText = str13(b, d);
            else if (tag === 0xFE) res.text = (res.text ? res.text + ' / ' : '') + str13(b, d);
            else if (tag === 0xFD) {
                res.range = { vMin: b[d + 5], vMax: b[d + 6], hMinKhz: b[d + 7], hMaxKhz: b[d + 8], pclkMaxMHz: b[d + 9] * 10 };
            } else if (tag === 0xFA) {
                for (var q = d + 5; q < d + 17; q += 2) add(parseStd(b[q], b[q + 1], ver14), 'Standard(FA)');
            } else if (tag === 0xF7) {
                res.notes.push('Established Timings III 설명자가 있습니다 — 아직 읽지 않습니다(필요하면 표를 더하면 됩니다).');
            }
        }

        // 확장 블록
        for (var e = 1; e < res.blocks; e++) {
            var o = e * 128, etag = b[o];
            if (etag === 0x02) {
                var dOff = b[o + 2];
                var p = o + 4, end = o + (dOff >= 4 ? dOff : 4);
                while (p < end) {
                    var hd = b[p], btag = hd >> 5, len = hd & 0x1F;
                    if (btag === 2) {                                  // Video Data Block
                        for (var v = 1; v <= len; v++) {
                            var sv = b[p + v], vic, nat = false;
                            if (sv >= 129 && sv <= 192) { vic = sv & 0x7F; nat = true; } else vic = sv;
                            var row = CTA_VIC[vic];
                            if (row) add({ w: row[0], h: row[1], hz: row[2], i: !!row[3] }, 'CTA VIC ' + vic, nat ? { ctaNative: true } : null);
                            else res.notes.push('CTA VIC ' + vic + ' 은 표에 없어 건너뜁니다 — CTA_VIC 에 한 줄 더하면 읽힙니다.');
                        }
                    } else if (btag === 3 && len >= 5 && b[p + 1] === 0x03 && b[p + 2] === 0x0C && b[p + 3] === 0x00) {
                        // HDMI VSDB — HDMI_VIC(4K) 가 있으면 읽는다
                        var q8 = p + 8;
                        if (len >= 8 && (b[q8] & 0x20)) {
                            var qq = q8 + 1;
                            if (b[q8] & 0x80) qq += 2;                 // latency
                            if (b[q8] & 0x40) qq += 2;                 // interlaced latency
                            if (qq - p <= len) {
                                var vicLen = b[qq + 1] >> 5;
                                for (var hv = 0; hv < vicLen && qq + 2 + hv - p <= len; hv++) {
                                    var hvRow = HDMI_VIC[b[qq + 2 + hv]];
                                    if (hvRow) add({ w: hvRow[0], h: hvRow[1], hz: hvRow[2] }, 'HDMI VIC ' + b[qq + 2 + hv]);
                                }
                            }
                        }
                        if (!res.portGuess) res.portGuess = 'HDMI';
                    } else if (btag === 7 && len >= 1 && b[p + 1] === 14) {
                        res.notes.push('YCbCr 4:2:0 전용 모드 블록이 있습니다 — 일반 지원 해상도로는 넣지 않습니다.');
                    }
                    p += 1 + len;
                }
                if (dOff >= 4) {
                    for (var dd = o + dOff; dd + 18 <= o + 127; dd += 18) {
                        if (!b[dd] && !b[dd + 1]) break;
                        var et = parseDtd(b, dd);
                        if (et) add(et, 'CTA DTD', { timing: et });
                    }
                }
            } else if (etag === 0x70) {
                res.notes.push('DisplayID 확장 블록이 있습니다 — 아직 읽지 않습니다. 그 안의 해상도는 빠져 있을 수 있습니다.');
            } else if (etag === 0xF0) {
                // 블록 맵 — 내용 없음
            } else {
                res.notes.push('확장 블록 ' + e + ' (태그 0x' + hex2(etag) + ') 은 읽지 않습니다.');
            }
        }

        // 같은 모드는 하나로 — 상세 타이밍(DTD)이 가진 정보가 더 많으니 그쪽을 남긴다.
        //  ⚠️ 여기 열쇠는 **중복 제거용**일 뿐이다(js/69 열쇠와 같은 모양으로 만든다).
        var seen = {};
        modes.forEach(function (m) {
            var key = m.w + 'X' + m.h + (m.i ? 'I' : '') + '@' + Math.round(m.hz) + (m.rb ? 'RB' : '');
            var prev = seen[key];
            if (!prev) { seen[key] = m; m.srcs = [m.src]; res.modes.push(m); return; }
            if (prev.srcs.indexOf(m.src) < 0) prev.srcs.push(m.src);
            if (m.timing && !prev.timing) { prev.timing = m.timing; prev.hz = m.hz; prev.label = m.label; }
            if (m.native) prev.native = true;
        });
        res.native = res.modes.filter(function (m) { return m.native; })[0] || null;
        return res;
    };

    var api = {
        parse: parse, toEdidBytes: toEdidBytes, labelOf: labelOf,
        EST_TIMINGS: EST_TIMINGS, CTA_VIC: CTA_VIC, HDMI_VIC: HDMI_VIC, IFACE_PORT: IFACE_PORT,
        hex: function (bytes) {
            var lines = [];
            for (var i = 0; i < bytes.length; i += 16) {
                lines.push(Array.prototype.slice.call(bytes, i, i + 16).map(hex2).join(' '));
            }
            return lines.join('\n');
        }
    };
    root.EDID = api;
    root.edidParse = parse;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
