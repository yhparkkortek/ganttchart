/* ============================================================================
   📎 메일 배분 근거층(js/61) — 진짜 앱에서 돌리는 하네스 (2026-11-08)
   앱(kortek_pm.html)을 열고 콘솔에 붙여넣는다. AI 키·NAS 불필요.

   가짜는 **후보 목록**(project_index 대신 세 개를 직접 만든다)과 **AI 응답(task 필드)** 뿐.
   감싸인 진짜 `_msBuildProjectMatchSection`(js/15c) 와 `_msResolveAiProjectMatch`(js/15b) 를 지난다.
   끝나면 기록·집계 localStorage 를 원래대로 되돌린다.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 300) : '')); } }
    var P = window.MAIL_EVIDENCE_POLICY;
    if (!P || !window.mailEvidenceFor) { console.error('js/61 이 로드되지 않았다'); return; }
    var keep = {}; [P.historyKey, P.statsKey, P.offKey].forEach(function (k) { keep[k] = localStorage.getItem(k); });
    var C = [
        { drive_file_id: 'tA', file_name: 'T_STELLAR32.json', model: 'STELLAR32', customer: 'LNW', keywords: ['STELLAR32', '502319', 'LNW'] },
        { drive_file_id: 'tB', file_name: 'T_OBSIDIAN27.json', model: 'OBSIDIAN', customer: 'LNW', keywords: ['OBSIDIAN', '502888', 'LNW'] },
        { drive_file_id: 'tC', file_name: 'T_AMUSNET43.json', model: 'AMUSNET 43', customer: 'AMUSNET', keywords: ['AMUSNET'] }
    ];
    function go(subject, sender, body, task) {
        window._mailParsedRaw = { subject: subject, sender: sender };
        var prompt = window._msBuildProjectMatchSection(C, subject + '\n' + sender + '\n' + body);
        return { prompt: prompt, tag: window._msResolveAiProjectMatch(task, C) };
    }
    try {
        localStorage.removeItem(P.historyKey); localStorage.removeItem(P.statsKey); localStorage.removeItem(P.offKey);
        ok('진짜 두 함수가 감싸여 있다', window._msBuildProjectMatchSection._meWrapped && window._msResolveAiProjectMatch._meWrapped && window._tpAppendMailSignal && window._tpAppendMailSignal._meWrapped);
        var r = go('아무 제목', 'x@ext.com', 'STELLAR32 패널 사양 회신 드립니다', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '매칭근거': 'AI', '근거인용': ['STELLAR32 패널 사양 회신 드립니다'] });
        ok('기록 없음(토큰 적중만) → 📎 약한 근거 1줄 · 상 + 인용 검증 통과 → matched(cited)', /1번\(STELLAR32\).*고유 키워드/.test(r.prompt) && r.tag.status === 'matched' && r.tag.evidence === 'cited', r.tag);
        ok('프롬프트에 📜 근거인용 지시가 있다', /근거인용/.test(r.prompt));
        r = go('아무 제목', 'x@ext.com', 'STELLAR32 패널 사양 회신 드립니다', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '매칭근거': 'AI' });
        ok('📜 인용이 없으면 상이라도 대기(unverified)', r.tag.status === 'ambiguous' && r.tag.evidence === 'unverified', r.tag);
        r = go('아무 제목', 'x@ext.com', 'STELLAR32 패널 사양 회신 드립니다', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '근거인용': ['본문에 없는 문장을 지어냈습니다 환각'] });
        ok('📜 인용 문장이 본문에 없으면(환각) 대기', r.tag.status === 'ambiguous' && /본문에 없음/.test(r.tag.matchBasis), r.tag);
        r = go('LNW 27 UHD 견적', 'x@ext.com', 'LNW 27 UHD 견적 요청드립니다', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '근거인용': ['LNW 27 UHD 견적 요청드립니다'] });
        ok('📜 인용은 있지만 LNW 는 형제 후보에도 있어 특정 못 함 → 대기', r.tag.status === 'ambiguous' && /형제/.test(r.tag.matchBasis), r.tag);
        ok('원본 프롬프트가 후보 3개를 번호로 나열한다(진짜 15c)', /1\. STELLAR32/.test(r.prompt) && /3\. AMUSNET 43/.test(r.prompt));
        window.mailEvidenceRecord('tB', 'T_OBSIDIAN27.json', { subject: 'OBSIDIAN 27 BOM 검토', sender: 'kim@customer.com', fileName: 'tf1' }, 'placed');
        r = go('Re: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '첨부 확인', { '매칭신뢰도': '상', '주매칭프로젝트번호': 1, '매칭근거': 'LNW 라서' });
        ok('📎 근거가 프롬프트에 실렸다(2번 OBSIDIAN 스레드 1건)', /📎/.test(r.prompt) && /2번\(OBSIDIAN\)/.test(r.prompt), r.prompt.slice(-400));
        ok('(b) AI 상=A vs 기록=B → 대기 + 후보 [A,B]', r.tag.status === 'ambiguous' && r.tag.evidence === 'conflict' && r.tag.candidates.length === 2, r.tag);
        r = go('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '회신', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2, '매칭근거': '애매' });
        ok('(c-1) AI 중=B + 기록 B → 승격 matched', r.tag.status === 'matched' && r.tag.evidence === 'promote', r.tag);
        r = go('견적 문의', 'new@vendor.com', '관리번호 #502888 단가 회신', { '매칭신뢰도': '하', '주매칭프로젝트번호': 0, '매칭근거': '모름' });
        ok('(c-2) AI 0 + 관리번호 한 후보 → 그 후보로 대기(suggest)', r.tag && r.tag.evidence === 'suggest' && r.tag.candidates[0].drive_file_id === 'tB', r.tag);
        ok('원본 15c 의 관리번호 힌트도 같이 들어 있다', /관리번호 우선 근거/.test(r.prompt));
        r = go('견적', 'new@vendor.com', '#502888 과 #502319', { '매칭신뢰도': '하', '주매칭프로젝트번호': 0 });
        ok('근거가 둘로 갈리면 제안 없음(null)', r.tag === null, r.tag);
        var st = window.mailEvidenceStats();
        ok('집계 conflict/promote/suggest 각 1 · unverified 3 · cited 1', st.conflict === 1 && st.promote === 1 && st.suggest === 1 && st.unverified === 3 && st.cited === 1, st);
        localStorage.setItem(P.offKey, '1');
        r = go('RE: OBSIDIAN 27 BOM 검토', 'kim@customer.com', '', { '매칭신뢰도': '중', '주매칭프로젝트번호': 2 });
        ok('킬스위치 → 판정 원본(대기)', r.tag.status === 'ambiguous' && !r.tag.evidence);
    } finally {
        Object.keys(keep).forEach(function (k) { if (keep[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, keep[k]); });
        window._mailParsedRaw = null;
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
