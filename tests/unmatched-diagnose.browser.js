/* tests/unmatched-diagnose.browser.js — 📭 미분류가 왜 남았는지 한 줄씩 (2026-11-23)
   앱 탭 콘솔(F12)에 붙여넣으면 표가 나온다. **아무것도 쓰지 않는다**(판정만 다시 계산).
   열: 제목 · 업무있음(AI 분석 성공) · 오류 · 지금 규칙 판정(결정론만, AI 없음) · 그 이유 · 보관함에 이미 있음 · 처음 미분류 사유(AI 근거).
   결과 객체는 window.__unmatchedDiag 에도 남는다 — copy(JSON.stringify(window.__unmatchedDiag)) 로 복사. */
(async function () {
    const rows = (window._msResults || []).filter(r => r && !r.project && !r.registered);
    const cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
    const out = rows.map(r => {
        const mail = { subject: r.subject || '', sender: r.sender || '', body: r.body || '', refs: r.refs || [] };
        let j = null, err = '';
        try { j = window.mailRouteJudge(mail, cands, null); } catch (e) { err = e.message; }
        const pre = window.mailRoutePreJudge ? window.mailRoutePreJudge(mail, cands) : null;
        return {
            제목: (r.subject || '').slice(0, 60),
            업무있음: !!r.task,
            오류: r.error || err || '',
            지금판정: j ? (j.decision + ':' + j.basis) : '?',
            확정: pre ? (pre.target.model || pre.target.file_name) : '',
            이유: j ? String(j.reason || '').slice(0, 80) : '',
            보관함에있음: !!(window._msMailAlreadyInInbox && window._msMailAlreadyInInbox(r)),
            처음사유: String(r.matchReason || '').slice(0, 80),
            본문길이: (r.body || '').length,
            날짜: (r.date || '').slice(0, 16)
        };
    });
    const sum = {};
    out.forEach(o => { const k = !o.업무있음 ? 'AI분석실패(업무없음)' : (o.확정 ? (o.보관함에있음 ? '확정·이미보관함' : '확정(재판정하면 배치됨)') : o.지금판정); sum[k] = (sum[k] || 0) + 1; });
    window.__unmatchedDiag = { 후보프로젝트: cands.length, 합계: sum, 줄: out, 규칙: window.MAIL_ROUTING_RULE_V };
    console.log('📭 미분류 진단 — ' + rows.length + '건 · 후보 ' + cands.length + '개 · 규칙 ' + window.MAIL_ROUTING_RULE_V, sum);
    console.table(out);
    return window.__unmatchedDiag;
})();
