/* ============================================================================
   🗂 잡무 프로젝트(MAIL_ROUTING_CATCHALL)로 간 자동 배치는 근거가 아니다 — 하네스 (2026-11-25)

       node tests/mail-catchall-evidence.test.js

   실사고: UL 'Draft 성적서 전달 건'(STELLAR32 건)이 옛 규칙('kortek' 낱말)으로 KORTEK_개발업무에 자동 배치됐고,
   같은 발신자의 다음 메일 'UL Draft report 확인 요청의 건' 이 그 기록을 근거로 삼을 수 있었다.
   검사 대상은 진짜 js/61 · js/74. 가짜는 경계(localStorage·nasAppFile·타이머)뿐.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const store = {};
const ctx = {};
ctx.window = ctx;
ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
ctx.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {} }), body: { appendChild() {} } };
ctx.addEventListener = () => {}; ctx.setInterval = () => 0; ctx.setTimeout = () => 0; ctx.clearTimeout = () => {}; ctx.clearInterval = () => {};
ctx.fetch = async () => ({ ok: false }); ctx.console = { log() {}, info() {}, warn() {}, error() {} };
ctx.nasAppFile = { get: async () => null, put: async () => ({ ok: true }) };
ctx._t = (ko) => ko;
ctx._mailEvidenceNoAutoSweep = true;
ctx._appUserKey = 'tester';   // 없으면 js/74 record() 가 아무것도 안 적는다(첫 실행에서 [4] 첫 항목이 그 덕에 거짓 통과했다)
ctx._msParseSenderEmail = (s) => { const m = String(s || '').match(/[\w.+-]+@[\w.-]+\.\w+/); return m ? m[0].toLowerCase() : ''; };
vm.createContext(ctx);
for (const f of ['61-mail-evidence.js', '74-mail-routing.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });

let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 300) : '')); } }

const ST = { drive_file_id: 'ST', file_name: 'LNW_STELLAR32_32.0.json', model: 'STELLAR32', customer: 'LNW>STELLAR32', keywords: ['STELLAR32', 'E159083'] };
const CA = { drive_file_id: 'CA', file_name: 'KORTEK_개발업무.json', model: '개발업무', customer: 'KORTEK>개발업무', keywords: ['개발업무', 'agile'] };
const OB = { drive_file_id: 'OB', file_name: 'LNW_OBSIDIAN27.json', model: 'OBSIDIAN', customer: 'LNW>OBSIDIAN', keywords: ['OBSIDIAN'] };
const C = [ST, CA, OB];
const UL = '"Kim, Jayden" <Jayden.Kim@ul.com>';

console.log('\n[1] 판정 함수 — 후보 목록 · 파일 이름 둘 다로 잡무를 알아본다');
ok('후보 id 로', ctx._mailRouteIsCatchAllRecord('CA', '', C) === true);
ok('후보에 없어도 파일 이름으로', ctx._mailRouteIsCatchAllRecord('zz', 'KORTEK_개발업무.json', []) === true);
ok('보통 프로젝트는 아니다', ctx._mailRouteIsCatchAllRecord('ST', 'LNW_STELLAR32_32.0.json', C) === false);

console.log('\n[2] js/61 발신자 근거 — 잡무로 간 기록은 세지 않는다');
const P = ctx.MAIL_EVIDENCE_POLICY;
for (let i = 0; i < Math.max(3, P.senderMin || 3); i++) ctx.mailEvidenceRecord('CA', CA.file_name, { subject: 'UL 건 ' + i, sender: UL, fileName: 'ca' + i }, 'auto');
let ev = ctx.mailEvidenceFor({ subject: 'UL Draft report 확인 요청의 건', sender: UL, body: '' }, C);
ok('잡무 후보의 발신자 근거 0', ev.per[1].sender === 0 && !ev.per[1].senderStrong, ev.per[1]);
ok('발신자 기록 총수에서도 빠진다', ev.per[0].senderTotal === 0, ev.per[0]);
ok('강한 근거가 하나도 없다', ev.strongIdx.length === 0, ev.strongIdx);
for (let i = 0; i < Math.max(3, P.senderMin || 3); i++) ctx.mailEvidenceRecord('ST', ST.file_name, { subject: 'UL 성적서 ' + i, sender: UL, fileName: 'st' + i }, 'auto');
ev = ctx.mailEvidenceFor({ subject: 'UL Draft report 확인 요청의 건', sender: UL, body: '' }, C);
ok('보통 프로젝트로 간 기록은 그대로 센다(STELLAR32 강함)', ev.per[0].senderStrong === true && ev.per[0].senderShare === 1, ev.per[0]);

console.log('\n[3] js/61 스레드 근거 — 잡무 자동 배치는 빼고, 사람이 넣은 것은 센다');
ctx.mailEvidenceRecord('CA', CA.file_name, { subject: 'EMC 3m chamber 사용 협조', sender: 'a@kortek.co.kr', fileName: 't1' }, 'auto');
ev = ctx.mailEvidenceFor({ subject: 'RE: EMC 3m chamber 사용 협조', sender: 'b@kortek.co.kr', body: '' }, C);
ok('자동 배치 스레드는 근거 아님', ev.per[1].thread === 0, ev.per[1]);
ctx.mailEvidenceRecord('CA', CA.file_name, { subject: 'EMC 3m chamber 사용 협조', sender: 'a@kortek.co.kr', fileName: 't2' }, 'human');
ev = ctx.mailEvidenceFor({ subject: 'RE: EMC 3m chamber 사용 협조', sender: 'b@kortek.co.kr', body: '' }, C);
ok('사람이 넣은 스레드는 근거', ev.per[1].thread === 1, ev.per[1]);

console.log('\n[4] js/74 스레드 규칙(threadTarget) — 팀 공용 기록');
const S1 = 'Draft 성적서 전달 건 32반제품 모니터';
ctx._mailRoutePlaced('CA', CA.file_name, { _routing: { basis: 'family', decision: 'auto' } }, { subject: S1, sender: UL, key: 'k1' }, 'auto');
let j = ctx.mailRouteJudge({ subject: 'RE: ' + S1, sender: UL, body: '', refs: [] }, C, null);
ok('잡무 자동 배치는 스레드로 따라가지 않는다', !(j.basis === 'thread' && j.target && j.target.drive_file_id === 'CA'), j);
const S2 = '시험 장비 예약 협조 요청 건입니다';
ctx._mailRoutePlaced('CA', CA.file_name, { _routing: { basis: 'family', decision: 'auto' } }, { subject: S2, sender: UL, key: 'k2' }, 'human');
j = ctx.mailRouteJudge({ subject: 'RE: ' + S2, sender: UL, body: '', refs: [] }, C, null);
ok('사람이 잡무에 넣은 스레드는 따라간다', j.basis === 'thread' && j.target && j.target.drive_file_id === 'CA', j);
const S3 = '패널 승인원 회신 요청드립니다';
ctx._mailRoutePlaced('OB', OB.file_name, { _routing: { basis: 'identifier', decision: 'auto' } }, { subject: S3, sender: UL, key: 'k3' }, 'auto');
j = ctx.mailRouteJudge({ subject: 'RE: ' + S3, sender: UL, body: '', refs: [] }, C, null);
ok('보통 프로젝트 자동 배치 스레드는 그대로', j.basis === 'thread' && j.target && j.target.drive_file_id === 'OB', j);

console.log('\n[5] 범용어 — 형태 이름(btn)·문서 종류(환경 대응)는 단서가 아니다 (2026-11-25 실측)');
const UN = { drive_file_id: 'UN', file_name: 'UNIDESA_BTN_14.0.json', model: 'BTN', customer: 'UNIDESA>BTN', keywords: ['UNIDESA'] };
const CI = { drive_file_id: 'CI', file_name: 'LNW_Cosmic iDeck_18.5.json', model: 'Cosmic 18.5', customer: 'LNW>Cosmic iDeck', keywords: ['Cosmic 18.5', '환경 대응', 'ROHS'] };
const CU = { drive_file_id: 'CU', file_name: 'LNW_Cosmic_Upright Profile_49.0.json', model: 'Cosmic Upright 49', customer: 'LNW>Cosmic_Upright Profile', keywords: ['Cosmic Upright 49', 'ANEMONE-8V'] };   // 실제 색인처럼 Cosmic 이 둘이어야 'cosmic' 이 고유어가 안 된다
const C5 = [ST, UN, CI, CU];
j = ctx.mailRouteJudge({ subject: 'RE: Light & Wonder Sustainability Data Request', sender: 'kimdh@kortek.co.kr', body: 'Dual MVD, TOPPER, BTN 3종 재활용률 BOM 정리', refs: [] }, C5, null);
ok('본문의 BTN 으로 UNIDESA>BTN 에 안 간다', !(j.target && j.target.drive_file_id === 'UN'), j);
j = ctx.mailRouteJudge({ subject: "[환경 대응 의뢰서] Cosmic Dual Main Top Cover Assy'", sender: 'x@kortek.co.kr', body: '', refs: [] }, C5, null);
ok('"환경 대응" 하나로 Cosmic iDeck 에 안 간다', !(j.target && j.target.drive_file_id === 'CI'), j);
j = ctx.mailRouteJudge({ subject: '[환경 대응 의뢰서] LNW _Cosmic 18.5" iDeck', sender: 'x@kortek.co.kr', body: '', refs: [] }, C5, null);
ok('모델(Cosmic 18.5)이 적힌 건 그대로 간다', !!(j.target && j.target.drive_file_id === 'CI'), j);

console.log('\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
