// node tests/po-bizregno-vision-fallback.test.js
//
// 🔎 구매오더 PDF 추출(js/04h, _ganttQaExtractPoItemsViaAi) — 사업자등록번호가 텍스트
//    레이어에 아예 없는 PDF(예: 더존비즈온 전자세금계산서, 등록번호 칸이 박스형 서브셋
//    폰트/이미지로 찍혀 pdf.js 텍스트 추출에 숫자가 안 잡힘)에서 "비전(이미지) 재확인"
//    폴백이 제대로 도는지 검증.
//
// 배경(2026-11-12, 실제 PDF로 재현): "1_정림전자 20261111.pdf"는 품목/날짜/상호명은 텍스트로
// 멀쩡히 뽑히는데 "등록번호" 칸만 공급자·공급받는자(코텍 자사 포함) 둘 다 숫자가 하나도 없다.
// 기존 "환각 복구"(정규식으로 원문 digit-stream 재탐색)는 원문에 숫자 자체가 없으니 못 찾는다.
// → 그 경우에만 같은 페이지를 이미지로 한 번 더 렌더링해 AI 비전으로 번호만 재확인한다
//   (품목 등은 이미 텍스트로 뽑혔으니 재추출 안 함 — AI 호출 1회 추가뿐).
//
// 네트워크 없이 돈다 — 실제 함수를 소스에서 그대로 잘라 돌리고(복제 아님),
// callAiBackend/_pcRenderPdfAsImages 경계만 스텁한다(CLAUDE.md "안쪽을 가짜로 만들면
// 테스트가 자기 자신을 테스트한다" — 비전 재확인 로직 자체는 진짜 소스로 돈다).

'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', '04h-core-app-upload-utils-3.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

function sliceFn(name) {
    const head = SRC.indexOf('window.' + name + ' = ');
    if (head < 0) throw new Error('함수를 못 찾음: ' + name);
    const end = SRC.indexOf('\n    };', head);
    if (end < 0) throw new Error('끝을 못 찾음: ' + name);
    return SRC.slice(head, end + '\n    };'.length);
}

function makeWin(aiBackendImpl, renderImpl) {
    return {
        _t: function (ko, en) { return ko; },
        _ganttQaPoOptionsTableText: function () { return { tempLines: '', purposeLines: '' }; },
        callAiBackend: aiBackendImpl,
        _extractGanttQaAiText: function (result) { return result.raw; },
        _pcRenderPdfAsImages: renderImpl,
    };
}

function buildFn(win) {
    const code = sliceFn('_ganttQaExtractPoItemsViaAi') + '\nreturn window._ganttQaExtractPoItemsViaAi;';
    return new Function('window', code)(win);
}

const ITEMS_OK = [{ desc: 'P550QAR01.0 T-CON BOARD', qty: 5, unitPrice: 14776.3, supplyAmount: 73882, tempCode: '' }];

(async () => {
    console.log('[1] 텍스트에서 바로 성공 — 비전 재확인 호출 안 함');
    {
        let calls = 0;
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                calls++;
                return { ok: true, raw: JSON.stringify({ bizRegNo: '1068147845', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { throw new Error('비전 렌더링이 불리면 안 됨'); }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: 'a.pdf', text: '정림전자(주) 106-81-47845 ... 품목내역', file: {} }], null);
        check('bizRegNo 그대로 사용', doc.bizRegNo === '1068147845', 'got=' + doc.bizRegNo);
        check('callAiBackend 1회만 호출(비전 재확인 없음)', calls === 1, 'calls=' + calls);
    }

    console.log('\n[2] 실제 사고 재현 — 텍스트엔 번호가 아예 없음 → 비전 재확인이 자동으로 복구');
    {
        let calls = 0, lastOptsHadImage = false;
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                calls++;
                if (opts && opts.imageParts) {
                    lastOptsHadImage = true;
                    return { ok: true, raw: JSON.stringify({ bizRegNo: '106-81-47845', vendorName: '정림전자(주)' }) };
                }
                // 1차 호출 — 텍스트 기반, 등록번호 칸만 비어 있는 실제 사고 재현(품목/날짜는 정상)
                return { ok: true, raw: JSON.stringify({ bizRegNo: '', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) {
                check('비전 렌더링에 maxPages:1 전달', opts && opts.maxPages === 1);
                return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }];
            }
        );
        const fn = buildFn(win);
        // ⚠️ 원문 텍스트에 등록번호 패턴이 하나도 없어야 한다(실제 사고와 동일) — 있으면
        //    기존 "환각 복구" 정규식이 먼저 찾아버려 이 비전 경로를 안 탄다.
        const doc = await fn('key', [{ name: '1_정림전자.pdf', text: '정림전자(주) 유병진 (주)코텍 김영달 품목내역 P550QAR01.0', file: {} }], null);
        check('callAiBackend 2회 호출(텍스트 1차 + 비전 재확인)', calls === 2, 'calls=' + calls);
        check('비전 호출에 imageParts 전달됨', lastOptsHadImage);
        check('비전으로 복구된 번호 사용', doc.bizRegNo === '1068147845', 'got=' + doc.bizRegNo);
        check('note에 비전 복구 안내 포함', (doc.note || '').indexOf('이미지로 다시 확인') !== -1, 'note=' + doc.note);
    }

    console.log('\n[3] 비전으로도 못 찾음 — 조용히 비워둔 채 기존 미확인 경로로');
    {
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                if (opts && opts.imageParts) return { ok: true, raw: JSON.stringify({ bizRegNo: '', vendorName: '' }) };
                return { ok: true, raw: JSON.stringify({ bizRegNo: '', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }]; }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: 'a.pdf', text: '이름만 있음', file: {} }], null);
        check('bizRegNo는 빈 문자열로 남음(죽지 않음)', doc.bizRegNo === '', 'got=' + JSON.stringify(doc.bizRegNo));
    }

    console.log('\n[4] 이미 이미지 기반 첨부(텍스트 레이어 자체가 없음) — 비전 재확인 또 안 함(중복 호출 방지)');
    {
        let calls = 0;
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                calls++;
                return { ok: true, raw: JSON.stringify({ bizRegNo: '', invoiceDate: '20261111', vendorName: '', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { throw new Error('이미 이미지 기반인데 또 렌더링하면 안 됨'); }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: 'scan.pdf', imageParts: [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }] }], null);
        check('callAiBackend 1회만(비전 재확인 스킵)', calls === 1, 'calls=' + calls);
        check('bizRegNo는 빈 채로 남음', doc.bizRegNo === '');
    }

    console.log('\n[5] 첨부에 file 참조가 없는 구버전 형태 — 렌더링 시도 안 하고 안전하게 넘어감');
    {
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                return { ok: true, raw: JSON.stringify({ bizRegNo: '', invoiceDate: '20261111', vendorName: '', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { throw new Error('file 참조가 없는데 렌더링을 시도하면 안 됨'); }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: 'a.pdf', text: '텍스트만, file 없음' }], null);
        check('죽지 않고 bizRegNo 빈 채로 반환', doc.bizRegNo === '');
    }

    console.log('\n[6] 비전이 실수로 우리 회사(코텍) 번호를 돌려줘도 거부');
    {
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                if (opts && opts.imageParts) return { ok: true, raw: JSON.stringify({ bizRegNo: '130-81-44628', vendorName: '(주)코텍' }) };
                return { ok: true, raw: JSON.stringify({ bizRegNo: '', invoiceDate: '20261111', vendorName: '', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }]; }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: 'a.pdf', text: '텍스트', file: {} }], null);
        check('코텍 자사 번호는 받아들이지 않음(빈 채로 남음)', doc.bizRegNo === '', 'got=' + JSON.stringify(doc.bizRegNo));
    }

    console.log('\n[7] 실제 사고 2 — AI 환각 + 구조적 패턴 없음인데 "전체 digit-stream"엔 무관한 10자리가 있음 → 비전이 이긴다(낮은 신뢰도 추측보다 우선)');
    {
        // 실측 재현: "1_정림전자 20261111.pdf" — 등록번호 자체는 원문에 없지만, 승인번호/
        // 관리번호의 숫자를 이어붙인 digit-stream 한가운데서 "6111141000"이 우연히 걸렸었다
        // (고친 전 버그). 구조적 정규식(\d{3}-?\d{2}-?\d{5}, 원문의 실제 하이픈 위치 보존)은
        // 이 노이즈에서 못 찾아야 하고, 비전이 성공하면 그 노이즈 추측은 아예 안 쓰여야 한다.
        const noisyText = '정림전자(주) 유병진 (주)코텍 김영달 승인번호: 20261111-41000096-60847705 관리번호: TX2026115753348 품목내역 P550QAR01.0';
        let calls = 0;
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                calls++;
                if (opts && opts.imageParts) {
                    return { ok: true, raw: JSON.stringify({ bizRegNo: '106-81-47845', vendorName: '정림전자(주)' }) };
                }
                // AI가 우리 회사(코텍) 번호를 협력사로 착각(환각) — 원문에 1308144628도 없음
                return { ok: true, raw: JSON.stringify({ bizRegNo: '130-81-44628', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }]; }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: '1_정림전자.pdf', text: noisyText, file: {} }], null);
        check('digit-stream 노이즈(6111141000 등)를 쓰지 않는다', doc.bizRegNo !== '6111141000', 'got=' + doc.bizRegNo);
        check('비전으로 복구된 진짜 번호를 쓴다', doc.bizRegNo === '1068147845', 'got=' + doc.bizRegNo);
        check('callAiBackend 2회(텍스트 1차 + 비전)', calls === 2, 'calls=' + calls);
    }

    console.log('\n[8] 구조적 패턴도 없고 비전도 실패 — 그제서야 digit-stream 최후 수단(낮은 신뢰도 명시)');
    {
        const noisyText = '정림전자(주) 유병진 (주)코텍 김영달 승인번호: 20261111-41000096-60847705 관리번호: TX2026115753348 품목내역 P550QAR01.0';
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                if (opts && opts.imageParts) return { ok: true, raw: JSON.stringify({ bizRegNo: '', vendorName: '' }) }; // 비전도 못 찾음
                return { ok: true, raw: JSON.stringify({ bizRegNo: '130-81-44628', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }]; }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: '1_정림전자.pdf', text: noisyText, file: {} }], null);
        check('최후 수단으로 digit-stream에서 뭔가는 채운다(빈 채로 끝나지 않음)', !!doc.bizRegNo, 'got=' + JSON.stringify(doc.bizRegNo));
        check('낮은 신뢰도임을 note에 명시', (doc.note || '').indexOf('신뢰도가 낮으니') !== -1, 'note=' + doc.note);
    }

    console.log('\n[9] 실제 사고 3 — 더존비즈온(전자세금계산서 발급대행사) 번호가 "[134-81-08473]"처럼 독립 토큰으로 찍혀 있어도 공급자로 안 씀 → 비전이 이긴다');
    {
        // 실측 재현: "1_정림전자 20261111.pdf" 원문 끝줄 "발급업무대행사업자: (주)더존비즈온[134-81-08473]".
        // 공급자 번호는 원문에 전혀 없는데, 이 대행사 번호는 구조적으로 멀쩡한 독립 토큰이라
        // (?<![\d-])...(?![\d-]) 경계 검사만으로는 못 거른다 — 알려진 "공급자일 수 없는 번호"
        // 로 따로 제외해야 한다(CLAUDE.md가 허용한 사업자번호 제외 가드레일).
        const text = '정림전자(주) 유병진 (주)코텍 김영달 품목내역 P550QAR01.0 발급업무대행사업자: (주)더존비즈온[134-81-08473]';
        let calls = 0;
        const win = makeWin(
            async function (apiKey, prompt, opts) {
                calls++;
                if (opts && opts.imageParts) return { ok: true, raw: JSON.stringify({ bizRegNo: '106-81-47845', vendorName: '정림전자(주)' }) };
                return { ok: true, raw: JSON.stringify({ bizRegNo: '130-81-44628', invoiceDate: '20261111', vendorName: '정림전자(주)', currency: 'KRW', items: ITEMS_OK, note: '' }) };
            },
            async function (file, opts) { return [{ mimeType: 'image/jpeg', data: 'ZmFrZQ==' }]; }
        );
        const fn = buildFn(win);
        const doc = await fn('key', [{ name: '1_정림전자.pdf', text: text, file: {} }], null);
        check('더존비즈온 번호(1348108473)를 공급자로 쓰지 않는다', doc.bizRegNo !== '1348108473', 'got=' + doc.bizRegNo);
        check('비전으로 복구된 진짜 번호를 쓴다', doc.bizRegNo === '1068147845', 'got=' + doc.bizRegNo);
        check('callAiBackend 2회(텍스트 1차 + 비전)', calls === 2, 'calls=' + calls);
    }

    console.log('\n' + (fail ? ('❌ ' + fail + ' 건 실패') : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
    process.exit(fail ? 1 : 0);
})();
