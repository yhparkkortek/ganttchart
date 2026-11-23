/* tests/rejudge-dryrun.browser.js — 🧭 대기 재판정 "배치하지 않고 판정만" 진단 (2026-11-23)
   앱 탭 콘솔(F12)에 붙여넣으면 결과 표가 나온다. **아무것도 쓰지 않는다**(보관함 저장·프로젝트 배치 없음).
   mailRouteRejudgePending 과 같은 입력(보관함 '대기' + 지금 색인 + 저장된 AI 판정)으로 판정만 하고,
   배치 직전에 걸러지는 조건(날짜확인필요·대상 id 없음)과 판정 중 오류를 센다. */
(async function () {
    const out = { looked: 0, byDecision: {}, wouldPlace: 0, skipDate: 0, noTargetId: 0, judgeErrors: [], samples: [] };
    const cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
    out.candidates = cands.length;
    const pend = window.TaskInbox.load().filter(it => it.status === '대기' && it.task);
    for (const it of pend) {
        out.looked++;
        const mr = it.mailRaw || {};
        const mail = { subject: mr.subject || it.task['업무명'] || '', sender: mr.sender || '', body: mr.body2000 || it.task['상세내용'] || '', refs: mr.refs || [] };
        const mp = it.matchedProject; let aiTag = null;
        if (mp && mp.candidates && mp.candidates.length) {
            const live = mp.candidates.map(c => cands.find(x => x.drive_file_id === c.drive_file_id)).filter(Boolean);
            const conf = mp.routing ? mp.routing.aiConfidence : mp.confidence;
            if (live.length) aiTag = { status: (conf === '상' && live.length === 1) ? 'matched' : 'ambiguous', candidates: live, confidence: conf || '', matchBasis: mp.matchBasis || '' };
        }
        let j;
        try { j = window.mailRouteJudge(mail, cands, aiTag); }
        catch (e) { out.judgeErrors.push((mail.subject || '').slice(0, 40) + ' :: ' + e.message); continue; }
        const k = j.decision + ':' + j.basis; out.byDecision[k] = (out.byDecision[k] || 0) + 1;
        if (j.decision !== 'auto') continue;
        if (!j.target || !j.target.drive_file_id) { out.noTargetId++; continue; }
        const t = it.task;
        if (String(t['시작일'] || '').includes('날짜확인필요') || String(t['완료일'] || '').includes('날짜확인필요')) { out.skipDate++; continue; }
        out.wouldPlace++;
        if (out.samples.length < 5) out.samples.push((mail.subject || '').slice(0, 40) + ' → ' + j.target.file_name);
    }
    out.version = (document.querySelector('script[src*="74-mail-routing"]') || {}).src;
    out.autoMode = !!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled());
    console.log('🧭 재판정 진단(배치 안 함):', JSON.stringify(out, null, 2));
    return out;
})();
