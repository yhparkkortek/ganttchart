/* ============================================================================
   📎 메일 배분 결정론 근거층(js/61) — 순수 로직 하네스 (2026-11-08)

       node tests/mail-evidence.test.js          (회사 PC — 집 PC 엔 node 가 없다)
       브라우저: tests/mail-evidence.browser.js  (진짜 앱의 감싸인 함수로 같은 시나리오)

   ⚠️ 가짜는 **바깥 경계에만**: localStorage, js/15b·15c 의 원본 두 함수(`_msBuildProjectMatchSection`
      → 문자열, `_msResolveAiProjectMatch` → 상/중/0 의 **실제 계약대로** 태그를 만드는 모양만),
      `_msExtractCodeTokens`(원본과 같은 정규식). 검사 대상은 js/61 의 진짜 함수다.
   ⚠️ 스텁은 호출 순서가 아니라 **task 의 필드 값**으로 갈린다.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const win = {}; global.window = win;
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
win.localStorage = global.localStorage;
win._t = (ko) => ko;
win._mailEvidenceNoAutoSweep = true;
win._msExtractCodeTokens = (text) => { const f = new Set(); const re = /#\s?(\d{4,7})\b/g; let m; while ((m = re.exec(String(text || '')))) f.add(m[1]); return Array.from(f); };
win._msParseSenderEmail = (s) => { const m = String(s || '').match(/[\w.+-]+@[\w.-]+\.\w+/); return m ? m[0].toLowerCase() : ''; };
// 원본 두 함수의 **계약**(js/15b/15c)
win._msBuildProjectMatchSection = (cands) => '\n--- 후보 ' + cands.length + '개 ---';
win._msResolveAiProjectMatch = (task, cands) => {
    const conf = task['매칭신뢰도'], idx = parseInt(task['주매칭프로젝트번호'], 10);
    if (!conf || !idx) return null;
    const picked = cands[idx - 1]; if (!picked) return null;
    return conf === '상' ? { status: 'matched', candidates: [picked], extraCandidates: [], matchBasis: task['매칭근거'] || '', confidence: conf }
                        : { status: 'ambiguous', candidates: [picked], extraCandidates: [], matchBasis: task['매칭근거'] || '', confidence: conf };
};
let signalCalls = 0;
win._tpAppendMailSignal = () => { signalCalls++; };
win._projectIndexCache = { data: null };
const ISSUES = []; win._issueLog = (e) => ISSUES.push(e);

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', '61-mail-evidence.js'), 'utf8'), { filename: '61-mail-evidence.js' });
const P = win.MAIL_EVIDENCE_POLICY;

let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 400) : '')); } }
const C = [
    { drive_file_id: 'A', file_name: 'LNW_STELLAR32.json', model: 'STELLAR32', customer: 'LNW', keywords: ['STELLAR32', 'STELLAR-32', '502319', 'LNW'] },
    { drive_file_id: 'B', file_name: 'LNW_OBSIDIAN27.json', model: 'OBSIDIAN', customer: 'LNW', keywords: ['OBSIDIAN', '502888', 'LNW'] },
    { drive_file_id: 'C', file_name: 'AMUSNET43.json', model: 'AMUSNET 43', customer: 'AMUSNET', keywords: ['AMUSNET', 'AMUSNET 43'] },
];
const raw = (subject, sender, fileName) => ({ subject, sender, fileName: fileName || ('m_' + Math.random().toString(36).slice(2)) });
function reset() { for (const k of Object.keys(store)) delete store[k]; ISSUES.length = 0; }
function resolveWith(subject, sender, body, task) {
    win._mailParsedRaw = { subject, sender };
    const prompt = win._msBuildProjectMatchSection(C, subject + '\n' + sender + '\n' + body);
    return { prompt, tag: win._msResolveAiProjectMatch(task, C) };
}

console.log('\n[1] 제목 정규화 — Re:/Fw:/답장: 반복·[n] 을 떼고 같은 스레드로 본다');
ok('Re: FW: [외부] 제목 → 제목', win._meNormSubject('RE: Fw: [외부] STELLAR32 회로 검토 요청') === 'stellar32 회로 검토 요청', win._meNormSubject('RE: Fw: [외부] STELLAR32 회로 검토 요청'));
ok('답장[2]: 회신: → 같은 값', win._meNormSubject('답장[2]: 회신: 승인원 제출') === win._meNormSubject('승인원  제출'));
ok('너무 짧으면 빈 값', win._meNormSubject('Re: ok') === '');
ok('토큰 정규화 — 하이픈·공백·대소문자 무시', win._meNormToken('STELLAR-32 ') === 'stellar32');

console.log('\n[2] 설치 — 원본 두 함수를 감쌌고, 원본 결과 위에 덧붙인다');
const inst = win._mailEvidenceInstall();
ok('이미 감싸져 있다(로드 때)', win._msBuildProjectMatchSection._meWrapped && win._msResolveAiProjectMatch._meWrapped && win._tpAppendMailSignal._meWrapped, inst);
reset();
let r = resolveWith('아무 제목', 'x@ext.com', '본문', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '매칭근거': 'AI' });
ok('근거가 없으면 프롬프트는 원본 그대로 · 판정도 그대로(상→matched)', r.prompt === '\n--- 후보 3개 ---' && r.tag.status === 'matched' && r.tag.evidence === 'agree', r);

console.log('\n[3] 기록 — 확정 배분 훅(_tpAppendMailSignal) 이 기록을 남기고 원본도 부른다');
reset();
win._tpAppendMailSignal('B', {}, raw('OBSIDIAN 27 BOM 검토', '"Kim" <kim@customer.com>', 'f1'));
ok('기록 1건 + 원본 호출', win._mailEvidenceHistory().length === 1 && signalCalls === 1, win._mailEvidenceHistory());
win._tpAppendMailSignal('B', {}, raw('OBSIDIAN 27 BOM 검토', 'kim@customer.com', 'f1'));
ok('같은 메일·같은 프로젝트는 한 번만', win._mailEvidenceHistory().length === 1);
ok('제목·발신자 둘 다 없으면 안 적는다', win.mailEvidenceRecord('A', '', { subject: 'Re:', sender: '' }, 'x') === false);

console.log('\n[4] (b) 오배송 방지 — AI "상" 이 A 인데 스레드 기록은 B → 대기 + 둘 다 후보');
reset();
win.mailEvidenceRecord('B', 'LNW_OBSIDIAN27.json', raw('OBSIDIAN 27 BOM 검토', 'kim@customer.com', 'f1'), 'placed');
r = resolveWith('Re: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '첨부 확인 부탁드립니다', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '매칭근거': 'LNW 라서' });
ok('프롬프트에 📎 근거 — 2번(OBSIDIAN) 스레드 1건', /📎/.test(r.prompt) && /2번\(OBSIDIAN\)/.test(r.prompt) && /스레드 1건/.test(r.prompt), r.prompt);
ok('matched → ambiguous(충돌) · 후보 [A, B] · 신뢰도 중', r.tag.status === 'ambiguous' && r.tag.evidence === 'conflict' && r.tag.candidates.map((c) => c.drive_file_id).join() === 'A,B' && r.tag.confidence === '중', r.tag);
ok('근거 문구가 matchBasis 에 남는다(보관함 카드에 보인다)', /근거 충돌/.test(r.tag.matchBasis) && /AI 라서|LNW 라서/.test(r.tag.matchBasis), r.tag.matchBasis);
ok('이슈 로그에 evidence_conflict', ISSUES.some((e) => e.kind === 'evidence_conflict'));
ok('AI 가 고른 쪽에도 고유 키워드가 있으면 내리지 않는다(둘 다 근거)', (() => {
    const t = resolveWith('Re: OBSIDIAN 27 BOM 검토', 'kim@customer.com', 'STELLAR32 관련 BOM 도 같이', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1 }).tag;
    return t.status === 'matched';
})());

console.log('\n[5] (c-1) 승격 — AI "중" 이 B, 스레드 기록도 B, 다투는 후보 없음 → matched 상');
reset();
win.mailEvidenceRecord('B', 'LNW_OBSIDIAN27.json', raw('OBSIDIAN 27 BOM 검토', 'kim@customer.com', 'f1'), 'placed');
r = resolveWith('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '회신', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2, '매칭근거': '애매' });
ok('ambiguous → matched · evidence=promote', r.tag.status === 'matched' && r.tag.evidence === 'promote' && r.tag.confidence === '상', r.tag);
r = resolveWith('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '회신', { '매칭신뢰도': '하', '주매칭프로젝트번호': 2 });
ok('"하" 는 승격하지 않는다', r.tag.status === 'ambiguous' && !r.tag.evidence, r.tag);
P.promote = false;
r = resolveWith('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '회신', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2 });
ok('promote 를 끄면 그대로 대기', r.tag.status === 'ambiguous');
P.promote = true;

console.log('\n[6] (c-2) 제안 — AI 0 인데 관리번호가 한 후보에만 등록 → 그 후보로 대기');
reset();
r = resolveWith('견적 문의', 'new@vendor.com', '관리번호 #502888 건 단가 회신 요청', { '매칭신뢰도': '하', '주매칭프로젝트번호': 0, '매칭근거': '모름' });
ok('null → ambiguous(suggest) B', r.tag && r.tag.status === 'ambiguous' && r.tag.evidence === 'suggest' && r.tag.candidates[0].drive_file_id === 'B', r.tag);
r = resolveWith('견적 문의', 'new@vendor.com', '#502888 과 #502319 둘 다', { '매칭신뢰도': '하', '주매칭프로젝트번호': 0 });
ok('두 후보에 근거가 갈리면 제안하지 않는다(미분류 유지)', r.tag === null, r.tag);

console.log('\n[7] 발신자 기록 — 외부 발신자만, 건수·비율 문턱');
reset();
for (let i = 0; i < 4; i++) win.mailEvidenceRecord('C', 'AMUSNET43.json', raw('주제 ' + i, 'lee@amusnet.bg', 'g' + i), 'placed');
let ev = win.mailEvidenceFor({ subject: '새 주제', sender: 'lee@amusnet.bg', body: '' }, C);
ok('4/4 → 강한 근거(C)', ev.per[2].senderStrong && ev.strongIdx.join() === '2', ev.per[2]);
win.mailEvidenceRecord('A', 'LNW_STELLAR32.json', raw('딴 주제', 'lee@amusnet.bg', 'g9'), 'placed');
ev = win.mailEvidenceFor({ subject: '새 주제', sender: 'lee@amusnet.bg', body: '' }, C);
ok('4/5 = 0.8 < 0.85 → 약한 근거', !ev.per[2].senderStrong && ev.per[2].sender === 4, ev.per[2]);
reset();
for (let i = 0; i < 6; i++) win.mailEvidenceRecord('A', 'LNW_STELLAR32.json', raw('사내 ' + i, 'park@kortek.co.kr', 'h' + i), 'placed');
ev = win.mailEvidenceFor({ subject: '새 주제', sender: 'park@kortek.co.kr', body: '' }, C);
ok('사내 발신자는 기록이 많아도 근거가 아니다(모든 프로젝트를 다룬다)', !ev.per[0].senderStrong && ev.per[0].sender === 0, ev.per[0]);

console.log('\n[8] 고유 키워드 — 공용어(여러 후보에 걸림)는 근거에서 뺀다, 하이픈·공백 무시');
reset();
ev = win.mailEvidenceFor({ subject: 'stellar-32 패널', sender: 'x@y.com', body: 'LNW 전체 공지' }, C);
ok('STELLAR-32 → A 토큰 적중, LNW 는 A·B 둘 다라 제외', ev.per[0].tokens.length === 1 && /stellar/i.test(ev.per[0].tokens[0]) && ev.per[1].tokens.length === 0, ev.per.map((e) => e.tokens));
ok('토큰만으로는 "강한 근거" 가 아니다(승격 안 함)', !ev.per[0].strong);

console.log('\n[9] 되돌림 — 재배치 큐에 넣으면 그 스레드 기록이 지워진다');
reset();
win.mailEvidenceRecord('A', 'LNW_STELLAR32.json', raw('잘못 간 메일', 'z@ext.com', 'w1'), 'placed');
let pushed = 0; win._pushReassignQueue = () => { pushed++; };
win._mailEvidenceInstall();
win._pushReassignQueue({ fromProjectId: 'A', mailRaw: { subject: 'RE: 잘못 간 메일', sender: 'z@ext.com', fileName: 'w1' } });
ok('기록 0건 · 원본 큐 함수도 불렸다', win._mailEvidenceHistory().length === 0 && pushed === 1, win._mailEvidenceHistory());

console.log('\n[10] 미분류 큐 훑기 — AI 없이, 근거 한 곳이면 보관함 대기로');
reset();
win.mailEvidenceRecord('B', 'LNW_OBSIDIAN27.json', raw('OBSIDIAN 금형 일정', 'kim@customer.com', 'q0'), 'placed');
const INBOX = [];
win.TaskInbox = { load: () => INBOX, add: (task, meta) => INBOX.unshift({ task, meta, mailRaw: meta.mailRaw }) };
win._msLoadProjectIndex = async () => C;
win._msFilterCandidateProjects = (l) => l;
win._msProjectTagLabel = (t) => t.candidates[0].model;
let saved = 0; win._msSaveQueueToStorage = () => { saved++; };
win._msResults = [
    { fileName: 'q1', subject: 'Re: OBSIDIAN 금형 일정', sender: 'kim@customer.com', body: '…', project: null, _projectTag: null, task: { '업무명': 'x' } },
    { fileName: 'q2', subject: '전혀 다른 건', sender: 'nobody@ext.com', body: '…', project: null, _projectTag: null, task: { '업무명': 'y' } },
    { fileName: 'q3', subject: '이미 매칭', sender: 'a@b.c', body: '', project: 'X', _projectTag: { status: 'matched' }, task: {} },
    { fileName: 'q4', subject: 'AI 실패', sender: 'a@b.c', body: '', project: null, _projectTag: null, task: null },
];
(async () => {
    const out = await win.mailEvidenceSweep();
    ok('2건 봤고 1건 제안', out.looked === 2 && out.suggested === 1, out);
    ok('q1 에 태그·라벨·근거가 붙고 보관함에 들어갔다', win._msResults[0]._projectTag && win._msResults[0]._projectTag.evidence === 'suggest' && win._msResults[0].project === 'OBSIDIAN' && INBOX.length === 1 && INBOX[0].mailRaw.fileName === 'q1', win._msResults[0]);
    ok('q2 는 그대로 미분류(확인 도장만)', !win._msResults[1]._projectTag && win._msResults[1]._evidenceChecked);
    ok('큐를 저장했다', saved === 1);
    const again = await win.mailEvidenceSweep();
    ok('두 번째 훑기는 다시 보지 않는다', again.looked === 0, again);

    console.log('\n[11] 집계·킬스위치');
    const st = win.mailEvidenceStats();
    ok('집계에 conflict/promote/suggest 가 쌓였다', st.sweep_suggested >= 1, st);
    store[P.offKey] = '1';
    const r2 = resolveWith('RE: OBSIDIAN 금형 일정', 'kim@customer.com', '', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2 });
    ok('off → 프롬프트 원본 · 판정 원본(중은 대기)', r2.prompt === '\n--- 후보 3개 ---' && r2.tag.status === 'ambiguous' && !r2.tag.evidence, r2);
    delete store[P.offKey];

    console.log('\n[12] 돌연변이 — 스레드 문턱을 올리면 승격이 사라진다(하네스가 그 차이를 본다)');
    reset();
    win.mailEvidenceRecord('B', 'LNW_OBSIDIAN27.json', raw('OBSIDIAN 27 BOM 검토', 'kim@customer.com', 'f1'), 'placed');
    P.threadMin = 2;
    const r3 = resolveWith('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '회신', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2 });
    ok('(돌연변이) threadMin=2 → 대기 그대로', r3.tag.status === 'ambiguous' && !r3.tag.evidence, r3.tag);
    P.threadMin = 1;

    console.log('\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    process.exit(fail ? 1 : 0);
})();
