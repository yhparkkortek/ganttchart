// [분리됨] 원본: js/04-core-app.js 의 7095~8433행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 파일 업로드 및 유틸리티 로직 3/5
    window._aiSetAlarmFromRef = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        const _en = window._currentLang === 'en';
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find task #' + rowIndex + ', so the alarm was not changed.'
                : '⚠️ #' + rowIndex + ' 업무를 찾지 못해 알람을 변경하지 못했습니다.', 'warning');
            return;
        }
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || (_en ? '(Untitled)' : '(제목없음)');
        // 💡 ev를 그대로 넘기면 wrToggleAlarm의 Ctrl/Shift 다중선택 분기를 탈 수 있는데, 이 모달엔 그런
        //    다중선택 개념이 없으므로 null을 넘겨 항상 "이 한 업무만" 토글되게 한다.
        window.wrToggleAlarm(rowIndex, null);
        if (window.showToast) {
            window.showToast(row._알림
                ? (_en ? '✅ Alarm set for "' + label + '".' : '✅ "' + label + '" 업무에 알람을 설정했습니다.')
                : (_en ? '📌 Alarm cleared for "' + label + '".' : '📌 "' + label + '" 업무의 알람을 해제했습니다.'), 'success');
        }
    };

    // 💡 [2026-08-28 신규] "원문 메일도 봐달라"는 질문에 AI가 답을 못 하던 문제 수정 — 업무 목록엔
    //    [원문有] 표시만 있고 실제 메일 본문(row._mailRaw)은 안 넣어주고 있었다. AI가 [[ACTION:VIEW_MAIL:
    //    번호]] 태그로 "이 업무 원문을 보여달라"고 요청하면, 그 행의 _mailRaw(제목/발신/날짜/본문)를 찾아
    //    후속 프롬프트에 끼워 넣어 다시 답하게 한다(sendGanttQaMessage 참고). rowIndex가 없거나 그 업무에
    //    원문이 없으면 null 반환.
    window._aiAssistGetMailRaw = function(rowIndex) {
        const row = globalData && globalData[rowIndex];
        if (!row || !row._mailRaw) return null;
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        const mr = row._mailRaw;
        // 💡 업무 상세내용/답변(getAiContentMaxLen, 기본 500자)보다 원문 메일은 훨씬 길 수 있어(협의
        // 내용·수치가 본문 뒷부분에 있는 경우가 흔함) 별도로 더 넉넉한 하한(2000자)을 보장한다.
        const maxLen = Math.max(window.getAiContentMaxLen ? window.getAiContentMaxLen() : 500, 2000);
        const body = (mr.body2000 || '').toString().trim().slice(0, maxLen);
        return `#${rowIndex} "${label}"의 원본 메일\n제목: ${mr.subject || '-'}\n발신: ${mr.sender || '-'}\n날짜: ${mr.date || '-'}\n본문:\n${body || '(본문 없음)'}`;
    };

    // ── 💡 [2026-09-01 신규] "🌐 다른 프로젝트 조회" — 위 프롬프트의 [[ACTION:LOAD_PROJECT:번호]]
    //    규칙 참고. VIEW_MAIL과 동일한 2단계 조회 패턴: AI가 번호로 요청 → 여기서 그 프로젝트의
    //    Drive 파일을 직접 읽어(현재 열려있는 프로젝트의 globalData/tabData는 절대 건드리지 않음 —
    //    화면엔 아무 변화 없이 순수 조회만) 가벼운 텍스트 컨텍스트로 만들어 후속 프롬프트에 끼워 넣는다.
    window._aiFetchOtherProjectContext = async function(no) {
        const entry = window._aiOtherProjectRefMap && window._aiOtherProjectRefMap[no];
        if (!entry || !entry.drive_file_id) return null;
        try {
            const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entry.drive_file_id}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pd = await res.json();
            // 💡 [2026-09-01 버그 수정] "다른 프로젝트 얘기하다가 그 프로젝트 사람에게 메일 보내달라"고
            //    하면 발송은 "성공"이라고 뜨는데 실제로는 안 오는 문제 — 원인은 _aiResolveNameToEmail이
            //    항상 "지금 화면에 열려있는(현재) 프로젝트"의 주소록/담당자만 보고 이메일을 찾았기
            //    때문(다른 프로젝트 데이터는 AI에게 보여줄 요약 텍스트로만 쓰이고, 실제 이메일 조회에는
            //    전혀 연결돼 있지 않았음 — 그래서 이름이 우연히 현재 프로젝트에도 있으면 엉뚱한/오래된
            //    이메일로 "성공적으로" 보내지고, 없으면 조용히 실패했었다). 조회한 원본 데이터(pd)를
            //    캐시해두고, 아래 _aiResolveNameToEmail이 여기도 함께 뒤지도록 확장한다.
            window._aiOtherProjectDataCache = window._aiOtherProjectDataCache || {};
            window._aiOtherProjectDataCache[no] = pd;
            return window._buildOtherProjectQaContext(pd, entry);
        } catch (e) { console.warn('다른 프로젝트(#P' + no + ') 조회 실패:', e.message); return null; }
    };

    // 💡 다른 프로젝트의 저장 파일(globalData/colIdx/projectMeta/tabData)을 가볍게 요약 텍스트로 변환.
    //    현재 프로젝트용 _buildGanttQaContext처럼 DOM(rendered table)에서 읽지 않고 저장된 JSON 값만
    //    사용한다(다른 프로젝트를 화면에 렌더링하지 않고 조회만 하기 위함) — 그래서 Customer SPEC/
    //    M.C Table/Elec Parts/주소록처럼 DOM에만 의존하던 일부 탭은 여기서는 생략하고, 업무 목록/
    //    개요/담당자/주요자재처럼 tabData·projectMeta에 이미 원본 값이 있는 부분만 다룬다.
    window._buildOtherProjectQaContext = function(pd, indexEntry) {
        const gd = (pd && pd.globalData) || [];
        const ci = (pd && pd.colIdx) || {};
        const pm = (pd && pd.projectMeta) || {};
        const td = (pd && pd.tabData) || {};
        const label = (indexEntry && (indexEntry.model || indexEntry.customer || indexEntry.file_name)) || pm.고객모델명 || '(이름 없음)';
        const fld = function(key) { return (typeof ci[key] === 'number' && ci[key] !== -1) ? ci[key] : -1; };
        const cStatus = fld('status'), cPlan = fld('plan'), cStart = fld('start'), cAssignee = fld('assignee'), cContent = fld('content');
        const koMap = (typeof LANG !== 'undefined' && LANG.ko && LANG.ko.statusMap) ? LANG.ko.statusMap : {};
        const normStatus = function(raw) {
            const s = (raw || '').toString().trim(); if (!s) return '(미지정)';
            const key = Object.keys(koMap).find(function(k) { return k.toLowerCase() === s.toLowerCase(); });
            return key ? koMap[key] : s;
        };
        const taskLabel = function(row) {
            if (row._level === 0) return row._origDev || '';
            if (row._level === 1) return row._origT1 || '';
            if (row._level === 2) return row._origT2 || '';
            if (row._level === 3) return row._origT3 || '';
            return row._origT4 || '';
        };
        const rows = gd.map(function(r, i) { return { row: r, idx: i }; }).slice(1).filter(function(x) { return x.row && x.row._level !== undefined; });
        const MAX_OTHER_TASKS = 200; // 💡 다른 프로젝트 조회는 참고용이라 지금 프로젝트(300건)보다 낮은 상한으로 용량 보호
        const maxLen = window.getAiContentMaxLen ? window.getAiContentMaxLen() : 500;
        const lines = [];
        rows.slice(0, MAX_OTHER_TASKS).forEach(function(x) {
            const row = x.row;
            const taskName = taskLabel(row) || '(제목없음)';
            const status = normStatus(cStatus !== -1 ? row[cStatus] : '');
            const assignee = (cAssignee !== -1 && row[cAssignee]) ? row[cAssignee] : '미지정';
            const start = (cStart !== -1 && row[cStart]) ? row[cStart] : '';
            const plan = (cPlan !== -1 && row[cPlan]) ? row[cPlan] : '';
            const content = (cContent !== -1 && row[cContent]) ? String(row[cContent]).replace(/\s+/g, ' ').trim().slice(0, maxLen) : '';
            const dateRange = (window._fmtDateRangeShort ? window._fmtDateRangeShort(start, plan) : (plan || start)) || '-';
            let line = `- "${taskName}" | 담당:${assignee} | 상태:${status} | 기간:${dateRange}`;
            if (content) line += ` | 내용:${content}`;
            lines.push(line);
        });
        const omitted = rows.length > MAX_OTHER_TASKS ? `\n...(그 외 ${rows.length - MAX_OTHER_TASKS}건은 용량 제한으로 생략됨 — "#G숫자" 인용은 이 프로젝트에서는 쓸 수 없습니다)` : '';

        const sd = td.summary || {};
        const overview = [];
        if (sd.purpose) overview.push(`적용 목적: ${sd.purpose}`);
        if (sd.volume) overview.push(`연간 수요량: ${sd.volume}`);
        if (sd.mpDate) overview.push(`목표 양산 일정: ${sd.mpDate}`);
        if (pm.프로젝트코드) overview.push(`프로젝트 코드: ${pm.프로젝트코드}`);

        const memberFieldDefs = [['프로젝트담당자', 'PM'], ['기구담당자', '기구'], ['HW담당자', 'HW'], ['FW담당자', 'FW'],
            ['TSP담당자', 'TSP'], ['LCM담당자', 'LCM'], ['Slimming담당자', 'Slimming'], ['Cutting담당자', 'Cutting'],
            ['Module담당자', 'Module'], ['Tooling담당자', 'Tooling']];
        const memberLines = memberFieldDefs.filter(function(f) { return pm[f[0]]; }).map(function(f) { return `${f[1]}: ${pm[f[0]]}`; });

        const materialLines = ((td.projectMaterials || [])
            .filter(function(m) { return m && (m.category || m.ktkPn || m.description); })
            .map(function(m) { return `- ${m.category || '(구분없음)'} | PN:${m.ktkPn || '-'} | ${m.description || '-'}`; }));

        return `[다른 프로젝트: ${label}]\n` +
            `고객사:${pm.고객사 || '-'} / 모델:${pm.고객모델명 || '-'} / PM:${pm.프로젝트담당자 || '-'}\n` +
            `[개요]\n${overview.length ? overview.join('\n') : '(없음)'}\n` +
            `[담당자]\n${memberLines.length ? memberLines.join('\n') : '(없음)'}\n` +
            `[주요 자재]\n${materialLines.length ? materialLines.join('\n') : '(없음)'}\n` +
            `[업무 목록] (총 ${rows.length}건)\n${lines.length ? lines.join('\n') : '(등록된 업무 없음)'}${omitted}`;
    };

    // ── 💡 [2026-09-01 신규] "📤 메일 작성/발송" — 위 프롬프트의 [[MAIL_DRAFT]] 규칙 참고 ──────────
    // AI가 만든 [[MAIL_DRAFT]] 블록(수신인:/참조인:/제목:/본문:)을 구조로 쪼갠다. 형식이 살짝
    // 어긋나도(예: 참조인 줄이 아예 없음) 최대한 관대하게 파싱하고, 못 알아본 줄은 무시한다.
    window._parseMailDraftBlock = function(blockText) {
        const lines = String(blockText || '').split('\n');
        let toLine = '', ccLine = '', subject = '';
        const bodyLines = [];
        let inBody = false;
        lines.forEach(function(line) {
            const mTo = !inBody && line.match(/^\s*수신인\s*:\s*(.*)$/);
            const mCc = !inBody && line.match(/^\s*참조인\s*:\s*(.*)$/);
            const mSubj = !inBody && line.match(/^\s*제목\s*:\s*(.*)$/);
            const mBody = !inBody && line.match(/^\s*본문\s*:\s*(.*)$/);
            if (mTo) { toLine = mTo[1].trim(); return; }
            if (mCc) { ccLine = mCc[1].trim(); return; }
            if (mSubj) { subject = mSubj[1].trim(); return; }
            if (mBody) { inBody = true; if (mBody[1].trim()) bodyLines.push(mBody[1]); return; }
            if (inBody) bodyLines.push(line);
        });
        const splitNames = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return x.trim(); }).filter(Boolean); };
        return { toNames: splitNames(toLine), ccNames: splitNames(ccLine), subject: subject, body: bodyLines.join('\n').trim() };
    };

    // 💡 이름(또는 "#AD숫자"/"AD숫자") → 실제 이메일 주소. AI는 이메일을 모르는 채로 이름만 적으므로,
    //    여기서 [주소록] → [프로젝트 고정 담당자 필드] → [프로젝트 멤버-3(자유추가)] 순서로 로컬
    //    데이터에서만 찾는다(외부로 나가는 게 아니라 이미 이 프로젝트 파일 안에 있는 정보이므로 안전).
    //    못 찾으면 email:null로 반환 — 발송 전 미리보기에서 "이메일 없음"으로 표시되어 사람이 알아챈다.
    window._aiResolveNameToEmail = function(rawName) {
        const name = String(rawName || '').trim();
        if (!name) return { name: name, email: null };
        const norm = function(s) { return String(s || '').trim().toLowerCase(); };

        const adMatch = name.match(/^#?\s*AD\s*(\d+)$/i);
        if (adMatch) {
            const no = parseInt(adMatch[1], 10);
            let hit = null;
            document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
                if (hit) return;
                const noEl = tr.querySelector('.bm-no');
                if (noEl && parseInt(noEl.textContent, 10) === no) hit = tr;
            });
            if (hit) {
                const g = function(f) { const el = hit.querySelector('input[data-field="' + f + '"]'); return el ? el.value.trim() : ''; };
                const email = g('email');
                if (email) return { name: g('name') || g('nameEn') || name, email: email };
            }
            return { name: name, email: null };
        }

        let found = null;
        document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
            if (found) return;
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value.trim() : ''; };
            const nm = g('name'), nmEn = g('nameEn'), email = g('email');
            if (!email) return;
            if (norm(nm) === norm(name) || norm(nmEn) === norm(name)) found = { name: nm || nmEn, email: email };
        });
        if (found) return found;

        const pm = window.projectMeta || {};
        const fixedFields = ['프로젝트담당자', '기구담당자', 'HW담당자', 'FW담당자', 'TSP담당자', 'LCM담당자',
            'Slimming담당자', 'Cutting담당자', 'Module담당자', 'Tooling담당자'];
        for (let i = 0; i < fixedFields.length; i++) {
            const f = fixedFields[i];
            if (pm[f] && norm(pm[f]) === norm(name)) {
                const email = (pm[f + '이메일'] || '').trim();
                if (email) return { name: pm[f], email: email };
            }
        }

        const members3 = (window.tabData && window.tabData.projectMembers3) || [];
        const m3 = members3.find(function(m) { return m && norm(m.name) === norm(name) && (m.email || '').trim(); });
        if (m3) return { name: m3.name, email: m3.email.trim() };

        // 💡 [2026-09-01 신규 — 버그 수정] "다른 프로젝트 얘기하다가 메일 보내줘" 대응 — 지금 열려있는
        //    이 프로젝트에서 못 찾았으면, 이번 대화에서 [[ACTION:LOAD_PROJECT:번호]]로 실제로 조회했던
        //    다른 프로젝트들의 주소록/담당자도 마저 뒤진다(window._aiOtherProjectDataCache,
        //    _aiFetchOtherProjectContext 참고). 이걸 안 하면 다른 프로젝트에만 등록된 사람은 이메일을
        //    못 찾거나, 이름이 우연히 겹치는 현재 프로젝트의 다른 사람 이메일로 잘못 보내질 수 있었음.
        const otherCache = window._aiOtherProjectDataCache || {};
        for (const no in otherCache) {
            const pd = otherCache[no];
            if (!pd) continue;
            const otherAddr = (pd.tabData && pd.tabData.addressBook) || [];
            const addrHit = otherAddr.find(function(p) { return p && (p.email || '').trim()
                && (norm(p.name) === norm(name) || norm(p.nameEn) === norm(name)); });
            if (addrHit) return { name: addrHit.name || addrHit.nameEn || name, email: addrHit.email.trim() };

            const otherPm = pd.projectMeta || {};
            const otherFixedHit = fixedFields.find(function(f) { return otherPm[f] && norm(otherPm[f]) === norm(name) && (otherPm[f + '이메일'] || '').trim(); });
            if (otherFixedHit) return { name: otherPm[otherFixedHit], email: otherPm[otherFixedHit + '이메일'].trim() };

            const otherMembers3 = (pd.tabData && pd.tabData.projectMembers3) || [];
            const otherM3 = otherMembers3.find(function(m) { return m && norm(m.name) === norm(name) && (m.email || '').trim(); });
            if (otherM3) return { name: otherM3.name, email: otherM3.email.trim() };
        }

        return { name: name, email: null };
    };

    // 💡 파싱된 이름 목록을 실제 이메일까지 resolve해서 하나의 "발송 가능한 초안" 객체로 만든다.
    //    id는 채팅 메시지(m.mailDraftId)와 짝지어, 옛날 메시지의 [📤 보내기] 버튼이 그 사이 새로
    //    생긴 다른 초안을 잘못 보내는 걸 막는 용도.
    window._aiBuildMailDraftFromParsed = function(parsed) {
        return {
            id: 'maildraft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            to: (parsed.toNames || []).map(window._aiResolveNameToEmail),
            cc: (parsed.ccNames || []).map(window._aiResolveNameToEmail),
            subject: parsed.subject || '',
            body: parsed.body || ''
        };
    };

    // 💡 초안을 채팅 말풍선에 보여줄 마크다운으로 변환 — _mdToHtml이 raw HTML은 이스케이프하므로
    //    반드시 이미 지원되는 마크다운 문법(**굵게**, 줄바꿈)만 사용한다.
    window._aiMailDraftPreviewMd = function(draft) {
        const fmtPerson = function(p) { return p.email ? `${p.name} (${p.email})` : `${p.name} ⚠️(이메일 없음)`; };
        const toStr = draft.to.length ? draft.to.map(fmtPerson).join(', ') : '(없음)';
        let md = `📧 **메일 초안**\n- **수신인:** ${toStr}`;
        if (draft.cc.length) md += `\n- **참조인:** ${draft.cc.map(fmtPerson).join(', ')}`;
        md += `\n- **제목:** ${draft.subject || '(제목 없음)'}\n\n**본문**\n${draft.body || '(내용 없음)'}`;
        md += draft.to.some(function(p) { return !p.email; })
            ? `\n\n⚠️ 수신인 중 이메일을 찾지 못한 사람이 있습니다 — 주소록에 등록한 뒤 다시 요청해주세요.`
            : `\n\n💬 이대로 보내려면 "보내줘"라고 말씀해주시거나, 아래 [📤 이대로 보내기] 버튼을 눌러주세요.`;
        return md;
    };

    // 💡 [2026-09-01 신규] "제목/소제목은 Bold로 해줘" 같은 서식 주문을 실제 발송 메일에도 반영하기
    //    위한 변환기 — 채팅 미리보기(_aiMailDraftPreviewMd → _mdToHtml)와 같은 마크다운 문법(**굵게**,
    //    #/##소제목, - 글머리)을 그대로 지원한다. AI는 사용자가 서식을 요청하면 본문에 이 문법을 써서
    //    작성하고(위 프롬프트의 [[MAIL_DRAFT]] 규칙 참고), 여기서 실제 메일 클라이언트에서도 보이도록
    //    인라인 스타일 HTML로 바꾼다(이메일은 외부 CSS/class를 못 쓰므로 항상 style="" 인라인만 사용).
    window._aiMdToMailHtml = function(text) {
        let escaped = escapeHtml(text || '');
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // **굵게**
        const lines = escaped.split('\n');
        return lines.map(function(line) {
            const heading = line.match(/^(#{1,3})\s+(.*)$/);
            if (heading) {
                const size = heading[1].length === 1 ? '16px' : (heading[1].length === 2 ? '15px' : '14px');
                return `<div style="font-weight:bold; font-size:${size}; margin:12px 0 4px;">${heading[2]}</div>`;
            }
            const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
            if (bullet) {
                const depth = Math.floor(bullet[1].length / 2);
                return `<div style="margin:0 0 3px; padding-left:${14 + depth * 16}px;">• ${bullet[2]}</div>`;
            }
            if (line.trim() === '') return '<div style="height:8px;"></div>';
            return `<div style="margin:0 0 3px;">${line}</div>`;
        }).join('');
    };

    // 💡 실제 발송 — kortek_backend.py의 기존 /send-mail(SMTP)을 그대로 재사용(알람 메일 발송과 동일
    //    엔드포인트). 위 _aiMdToMailHtml로 **굵게**/소제목 등 서식을 실제 HTML로 바꿔서 보낸다
    //    (백엔드가 MIMEText 'html' 고정이라 이미 HTML 메일 — 이스케이프+태그 변환만 여기서 처리).
    window._aiSendMailFromDraft = async function(draft) {
        const toEmails = (draft.to || []).filter(function(p) { return p.email; }).map(function(p) { return p.email; });
        if (!toEmails.length) return { ok: false, error: '수신인 이메일을 찾지 못했습니다. 주소록에 등록한 뒤 다시 시도해주세요.' };
        const ccEmails = (draft.cc || []).filter(function(p) { return p.email; }).map(function(p) { return p.email; });
        const bodyHtml = window._aiMdToMailHtml(draft.body || '');
        try {
            const res = await fetch('http://127.0.0.1:5000/send-mail', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: toEmails.join(','), cc: ccEmails.join(','), subject: draft.subject || '(제목 없음)', body: bodyHtml })
            });
            const data = await res.json();
            return data.ok ? { ok: true } : { ok: false, error: data.error || '알 수 없는 오류' };
        } catch (e) {
            return { ok: false, error: '메일 서버에 연결할 수 없습니다(kortek_backend.bat 실행 여부를 확인해주세요). ' + e.message };
        }
    };

    // 💡 채팅의 [📤 이대로 보내기]/[❌ 취소] 버튼 클릭 핸들러 — draftId가 지금 pending 중인 초안과
    //    같을 때만 동작(그 사이 새 초안/발송으로 이미 소진됐으면 안전하게 무시하고 안내).
    window._aiSendPendingMailDraft = async function(draftId, btn) {
        const pending = window._ganttQaPendingMailDraft;
        if (!pending || pending.id !== draftId) {
            if (window.showToast) window.showToast('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', 'warning');
            window._renderGanttQaMessages();
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 발송 중...'; }
        const sendRes = await window._aiSendMailFromDraft(pending);
        window._ganttQaPendingMailDraft = null;
        window._ganttQaHistory.push({
            role: 'ai',
            text: sendRes.ok
                ? `✅ 메일을 발송했습니다. (수신: ${pending.to.filter(function(p){return p.email;}).map(function(p){return p.name;}).join(', ')})`
                : `⚠️ 메일 발송 실패: ${sendRes.error}`,
            uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        });
        window._renderGanttQaMessages();
    };
    window._aiCancelPendingMailDraft = function(draftId) {
        if (window._ganttQaPendingMailDraft && window._ganttQaPendingMailDraft.id === draftId) window._ganttQaPendingMailDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: '📌 메일 발송을 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };

    // ── 💡 [2026-09-01 신규] "📢 공지 등록" — 위 프롬프트의 [[NOTICE_DRAFT]] 규칙 참고 ──────────
    // Gantt 업무와 무관하게 독립적으로 동작(공지 탭 window._noticeItems에 바로 push)하므로 메일 초안보다
    // 단순함. [[MAIL_DRAFT]] 파서와 동일한 관대한 파싱 방식을 그대로 따른다.
    window._parseNoticeDraftBlock = function(blockText) {
        const lines = String(blockText || '').split('\n');
        let title = '', deadlineLine = '', ddayLine, recipLine;
        const contentLines = [];
        let inContent = false;
        lines.forEach(function(line) {
            const mTitle    = !inContent && line.match(/^\s*제목\s*:\s*(.*)$/);
            const mDeadline = !inContent && line.match(/^\s*기준일\s*:\s*(.*)$/);
            const mDday     = !inContent && line.match(/^\s*D-day\s*:\s*(.*)$/i);
            const mRecip    = !inContent && line.match(/^\s*수신인\s*:\s*(.*)$/);
            const mContent  = !inContent && line.match(/^\s*내용\s*:\s*(.*)$/);
            if (mTitle)    { title = mTitle[1].trim(); return; }
            if (mDeadline) { deadlineLine = mDeadline[1].trim(); return; }
            if (mDday)     { ddayLine = mDday[1].trim(); return; }
            if (mRecip)    { recipLine = mRecip[1].trim(); return; }
            if (mContent)  { inContent = true; if (mContent[1].trim()) contentLines.push(mContent[1]); return; }
            if (inContent) contentLines.push(line);
        });
        const splitNames = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return x.trim(); }).filter(Boolean); };
        const parseDays  = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return parseInt(x.trim(), 10); }).filter(function(n) { return !isNaN(n); }); };
        // 💡 기준일은 쉼표로 구분된 여러 날짜를 허용 — 날짜마다 별도 공지가 등록됨
        const deadlines = deadlineLine ? deadlineLine.split(/[,，、]/).map(function(d) { return d.trim(); }).filter(Boolean) : [];
        return {
            title: title,
            deadline: deadlines[0] || '',    // 하위호환 — 단일 날짜 경로도 유지
            deadlines: deadlines,            // 다중 날짜 배열 (0개면 빈 배열)
            alarmDays: ddayLine ? parseDays(ddayLine) : [0],
            recipientNames: recipLine !== undefined ? splitNames(recipLine) : [],
            body: contentLines.join('\n').trim()
        };
    };

    // 💡 수신인 이름 목록 → _nmCollectRecipients()와 동일한 모양의 행 배열(이메일까지 resolve됨).
    //    메일 초안과 동일하게 window._aiResolveNameToEmail(로컬 데이터만 조회, AI에겐 이메일을 안 알려줌)을 재사용.
    window._aiResolveNamesToRecipients = function(names) {
        return (names || []).map(function(n) {
            const r = window._aiResolveNameToEmail(n);
            return { name: r.name, email: r.email || '', telegramId: '', emailOn: !!r.email, tgOn: false };
        });
    };

    window._aiBuildNoticeDraftFromParsed = function(parsed) {
        const deadlines = (parsed.deadlines && parsed.deadlines.length) ? parsed.deadlines : (parsed.deadline ? [parsed.deadline] : []);
        return {
            id: 'noticedraft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            title: parsed.title || '',
            deadline: deadlines[0] || '',    // 하위호환
            deadlines: deadlines,            // 다중 날짜 배열
            alarmDays: (parsed.alarmDays && parsed.alarmDays.length ? parsed.alarmDays : [0]).slice().sort(function(a, b) { return b - a; }),
            recipients: window._aiResolveNamesToRecipients(parsed.recipientNames),
            body: parsed.body || ''
        };
    };

    window._aiNoticeDraftPreviewMd = function(draft) {
        const fmtPerson = function(p) { return p.email ? `${p.name} (${p.email})` : `${p.name} ⚠️(이메일 없음)`; };
        const recipStr = draft.recipients.length ? draft.recipients.map(fmtPerson).join(', ') : '(등록 후 직접 선택 필요)';
        const dls = (draft.deadlines && draft.deadlines.length) ? draft.deadlines : (draft.deadline ? [draft.deadline] : []);
        const dlStr = dls.length > 1 ? `${dls.join(', ')} (${dls.length}개 날짜 → 공지 ${dls.length}건 등록)` : (dls[0] || '⚠️(기준일 없음)');
        let md = `📢 **공지 초안**\n- **제목:** ${draft.title || '(제목 없음)'}\n- **기준일:** ${dlStr}\n- **알림 시점:** ${draft.alarmDays.map(function(d) { return 'D-' + d; }).join(', ')}\n- **수신 대상:** ${recipStr}`;
        md += `\n\n**내용**\n${draft.body || '(내용 없음)'}`;
        if (!dls.length) md += `\n\n⚠️ 기준일이 없어 등록할 수 없습니다 — 기준일을 알려주세요.`;
        else if (!draft.title) md += `\n\n⚠️ 제목이 없어 등록할 수 없습니다 — 제목을 알려주세요.`;
        else if (draft.recipients.some(function(p) { return !p.email; })) md += `\n\n⚠️ 수신 대상 중 이메일을 찾지 못한 사람이 있습니다.`;
        md += `\n\n💬 이대로 등록하려면 "등록해줘"라고 말씀해주시거나, 아래 [📢 이대로 등록] 버튼을 눌러주세요.`;
        return md;
    };

    // 💡 실제 등록 — window.saveNoticeItem()의 "신규 등록" 분기와 동일한 데이터 모양으로 push.
    //    recipientMode는 항상 'custom'으로 고정(AI가 만든 명단이 전역 공용 기본수신 명단을
    //    조용히 덮어쓰지 않도록 — window._nmPersistRecipientMode의 'default' 분기 참고).
    window._aiRegisterNoticeFromDraft = function(draft) {
        const dls = (draft.deadlines && draft.deadlines.length) ? draft.deadlines : (draft.deadline ? [draft.deadline] : []);
        if (!draft.title || !dls.length) return { ok: false, error: '제목 또는 기준일이 없습니다.' };
        // 💡 날짜마다 별도 공지 1건씩 등록 — 여러 날짜를 한 번에 처리
        dls.forEach(function(dl, i) {
            window._noticeItems.push({
                id: 'notice_' + Date.now() + '_' + i, title: draft.title, body: draft.body, deadline: dl,
                alarmDays: draft.alarmDays, recipients: draft.recipients, recipientMode: 'custom',
                status: 'active', sentLog: [], createdAt: new Date().toISOString().slice(0, 10)
            });
        });
        window._noticeSave();
        if (window.renderNoticeTab) window.renderNoticeTab();
        return { ok: true, count: dls.length };
    };

    window._aiRegisterPendingNoticeDraft = async function(draftId, btn) {
        const pending = window._ganttQaPendingNoticeDraft;
        if (!pending || pending.id !== draftId) {
            if (window.showToast) window.showToast('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', 'warning');
            window._renderGanttQaMessages();
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 등록 중...'; }
        const res = window._aiRegisterNoticeFromDraft(pending);
        window._ganttQaPendingNoticeDraft = null;
        window._ganttQaHistory.push({
            role: 'ai',
            text: res.ok ? `✅ "${pending.title}" 공지를 등록했습니다.${res.count > 1 ? ` (${res.count}개 날짜 → ${res.count}건 등록)` : ''}` : `⚠️ 공지 등록 실패: ${res.error}`,
            uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        });
        window._renderGanttQaMessages();
    };
    window._aiCancelPendingNoticeDraft = function(draftId) {
        if (window._ganttQaPendingNoticeDraft && window._ganttQaPendingNoticeDraft.id === draftId) window._ganttQaPendingNoticeDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: '📌 공지 등록을 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };

    // ── 💡 [2026-09-01 신규] "📌 알람 세부 설정" — 위 프롬프트의 [[ALARM_DRAFT:번호]] 규칙 참고 ──────────
    // 기존 window._aiAssistSetAlarm(단순 켜기/끄기, 확인 없이 즉시 실행)과 달리, D-day/수신 대상/제목·내용
    // 오버라이드까지 바꾸는 경우엔 실제 발송 대상이 달라질 수 있어 메일 발송과 동일하게 미리보기 확인을 거친다.
    // 언급되지 않은 필드는 undefined로 남겨 "기존 설정 유지"를 표현한다(빈 배열/빈 문자열과 구분).
    window._parseAlarmDraftBlock = function(blockText) {
        const lines = String(blockText || '').split('\n');
        let ddayLine, recipLine, titleLine, contentLine;
        const contentLines = [];
        let inContent = false;
        lines.forEach(function(line) {
            const mDday    = !inContent && line.match(/^\s*D-day\s*:\s*(.*)$/i);
            const mRecip   = !inContent && line.match(/^\s*수신인\s*:\s*(.*)$/);
            const mTitle   = !inContent && line.match(/^\s*제목\s*:\s*(.*)$/);
            const mContent = !inContent && line.match(/^\s*내용\s*:\s*(.*)$/);
            if (mDday)    { ddayLine = mDday[1].trim(); return; }
            if (mRecip)   { recipLine = mRecip[1].trim(); return; }
            if (mTitle)   { titleLine = mTitle[1].trim(); return; }
            if (mContent) { inContent = true; contentLine = ''; if (mContent[1].trim()) contentLines.push(mContent[1]); return; }
            if (inContent) contentLines.push(line);
        });
        const splitNames = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return x.trim(); }).filter(Boolean); };
        const parseDays  = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return parseInt(x.trim(), 10); }).filter(function(n) { return !isNaN(n); }); };
        return {
            alarmDays: ddayLine !== undefined ? parseDays(ddayLine) : undefined,
            recipientNames: recipLine !== undefined ? splitNames(recipLine) : undefined,
            titleOverride: titleLine !== undefined ? titleLine : undefined,
            contentOverride: contentLine !== undefined ? contentLines.join('\n').trim() : undefined
        };
    };

    // 💡 rowIndex가 실제로 "알람을 걸 수 있는" 업무인지(존재하는지 + 완료 예정일이 있는지) 확인.
    //    ⚠️ window.collectAlarmItems()는 "이미 _알림이 켜진" 행만 돌려주므로(아직 한 번도 알람을 켠 적
    //    없는 업무는 제외됨) 그 결과를 그대로 재사용하면 안 된다 — 여기서는 collectAlarmItems() 안의
    //    완료예정일/업무명 추출 로직만 그대로 가져와 _알림 상태와 무관하게 직접 계산한다.
    window._aiGetAlarmEligibleRowInfo = function(rowIndex) {
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        if (!row || row._level === undefined) return null;
        const ci = window.colIdx || {};
        let dueRaw = String(row[ci.plan] || '').trim();
        if ((!dueRaw || dueRaw === '-') && row._calcPlanTs && window.formatTsToYMD) dueRaw = window.formatTsToYMD(row._calcPlanTs);
        if (!dueRaw || dueRaw === '-') return null;
        const dueDate = new Date(dueRaw);
        if (isNaN(dueDate)) return null;
        const origByLevel = row._level === 0 ? row._origDev : (row._level === 1 ? row._origT1 : (row._level === 2 ? row._origT2 : (row._level === 3 ? row._origT3 : row._origT4)));
        let wbsColIdx = (row._level === 0) ? ci.devStage : (row._level === 1 ? ci.taskType1 : (row._level === 2 ? ci.taskType2 : (row._level === 3 ? ci.taskType3 : ci.taskType4)));
        if ((wbsColIdx === undefined || wbsColIdx === -1) && ci.wbs !== -1) wbsColIdx = ci.wbs;
        let taskName = (origByLevel || '') || (wbsColIdx !== undefined && wbsColIdx > -1 ? row[wbsColIdx] : '') || '';
        taskName = taskName.toString().trim().replace(/^🌐\s*/, '') || '-';
        return { taskName: row._알림제목오버라이드 || taskName };
    };

    // 💡 위 정보로 대상 업무를 검증 — 여기서 걸러지면 채팅에 초안(pending state)을 아예 만들지 않고
    //    바로 오류 안내만 붙인다.
    window._aiBuildAlarmDraftFromParsed = function(rowIndex, parsed) {
        const info = window._aiGetAlarmEligibleRowInfo(rowIndex);
        if (!info) {
            const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
            return { ok: false, reason: (!row || row._level === undefined) ? 'not-found' : 'no-due-date' };
        }
        return {
            ok: true,
            id: 'alarmdraft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            rowIdx: rowIndex,
            taskName: info.taskName,
            alarmDays: parsed.alarmDays,       // undefined = 기존 설정 유지
            recipients: parsed.recipientNames !== undefined ? window._aiResolveNamesToRecipients(parsed.recipientNames) : undefined,
            titleOverride: parsed.titleOverride,
            contentOverride: parsed.contentOverride
        };
    };

    window._aiAlarmDraftPreviewMd = function(draft) {
        const fmtPerson = function(p) { return p.email ? `${p.name} (${p.email})` : `${p.name} ⚠️(이메일 없음)`; };
        let md = `📌 **알람 설정 초안 — "${draft.taskName}"**`;
        md += draft.alarmDays !== undefined
            ? `\n- **알림 시점:** ${draft.alarmDays.length ? draft.alarmDays.slice().sort(function(a, b) { return b - a; }).map(function(d) { return 'D-' + d; }).join(', ') : '(없음)'}`
            : `\n- **알림 시점:** (기존 설정 유지)`;
        md += draft.recipients !== undefined
            ? `\n- **수신 대상:** ${draft.recipients.length ? draft.recipients.map(fmtPerson).join(', ') : '(없음)'}`
            : `\n- **수신 대상:** (기존 설정 유지)`;
        if (draft.titleOverride !== undefined) md += `\n- **제목 변경:** ${draft.titleOverride || '(원래 업무명으로 되돌림)'}`;
        if (draft.contentOverride !== undefined) md += `\n- **내용 변경:** ${draft.contentOverride || '(원래 업무 내용으로 되돌림)'}`;
        if (draft.recipients && draft.recipients.some(function(p) { return !p.email; })) md += `\n\n⚠️ 수신 대상 중 이메일을 찾지 못한 사람이 있습니다.`;
        md += `\n\n💬 이대로 적용하려면 "적용해줘"라고 말씀해주시거나, 아래 [📌 이대로 적용] 버튼을 눌러주세요.`;
        return md;
    };

    // 💡 실제 적용 — window._asPersistTitleContentOverride/saveAlarmSchedule과 동일한 row 속성들을
    //    직접 채운다(알람 일정 모달을 거치지 않고도 결과는 완전히 동일). 언급 안 된 필드는 건드리지 않음.
    window._aiApplyAlarmDraft = function(draft) {
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[draft.rowIdx] : null;
        if (!row) return { ok: false, error: '해당 업무를 더 이상 찾을 수 없습니다.' };
        row._알림 = true;
        if (draft.alarmDays !== undefined) row._알림일정 = draft.alarmDays.slice();
        if (draft.recipients !== undefined) {
            row._알림수신자모드 = 'custom';
            row._알림수신자 = draft.recipients;
        }
        if (draft.titleOverride !== undefined) {
            if (draft.titleOverride) row._알림제목오버라이드 = draft.titleOverride; else delete row._알림제목오버라이드;
        }
        if (draft.contentOverride !== undefined) {
            if (draft.contentOverride) row._알림내용오버라이드 = draft.contentOverride; else delete row._알림내용오버라이드;
        }
        logChange(draft.rowIdx, -1, '알림 설정', '알람 세부 설정 적용', 'AI 문답으로 설정');
        renderTable(globalData);
        applyFilters();
        if (window.paintRowSelection) window.paintRowSelection();
        const alarmPanel = document.getElementById('tab-alarm');
        if (alarmPanel && alarmPanel.classList.contains('active') && window.renderAlarmTab) window.renderAlarmTab();
        return { ok: true };
    };

    window._aiApplyPendingAlarmDraft = async function(draftId, btn) {
        const pending = window._ganttQaPendingAlarmDraft;
        if (!pending || pending.id !== draftId) {
            if (window.showToast) window.showToast('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', 'warning');
            window._renderGanttQaMessages();
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 적용 중...'; }
        const res = window._aiApplyAlarmDraft(pending);
        window._ganttQaPendingAlarmDraft = null;
        window._ganttQaHistory.push({
            role: 'ai',
            text: res.ok ? `✅ "${pending.taskName}" 업무의 알람 설정을 적용했습니다.` : `⚠️ 알람 설정 적용 실패: ${res.error}`,
            uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        });
        window._renderGanttQaMessages();
    };
    window._aiCancelPendingAlarmDraft = function(draftId) {
        if (window._ganttQaPendingAlarmDraft && window._ganttQaPendingAlarmDraft.id === draftId) window._ganttQaPendingAlarmDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: '📌 알람 설정을 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };

    // ── 💡 [2026-09-03 신규] Gantt 수정 초안(GANTT_EDIT_DRAFT) / 새 행 추가 초안(GANTT_ADD_DRAFT) ──────────
    //    알람 세부 설정(ALARM_DRAFT)·메일 초안(MAIL_DRAFT)과 동일한 "초안→확인→적용" 2단계 왕복 패턴.

    window._ganttQaPendingEditDraft = null; // 현재 pending 중인 수정 초안 (1건만 유지)
    window._ganttQaPendingAddDraft  = null; // 현재 pending 중인 추가 초안 (1건만 유지)

    // ── GANTT_EDIT_DRAFT 파서 ──
    window._parseGanttEditDraftBlock = function(blockText) {
        const lines = String(blockText || '').split('\n');
        let taskName, assignee, startDate, endDate, status;
        const contentLines = []; let inContent = false;
        lines.forEach(function(line) {
            if (inContent) { contentLines.push(line); return; }
            const m = line.match(/^\s*(업무명|담당|시작일|완료일|상태|내용)\s*:\s*(.*)$/);
            if (!m) return;
            const key = m[1].trim(); const val = m[2].trim();
            if (key === '업무명') taskName = val;
            else if (key === '담당') assignee = val;
            else if (key === '시작일') startDate = val;
            else if (key === '완료일') endDate = val;
            else if (key === '상태') status = val;
            else if (key === '내용') { inContent = true; if (val) contentLines.push(val); }
        });
        return { taskName, assignee, startDate, endDate, status, content: inContent ? contentLines.join('\n').trim() : undefined };
    };

    window._aiBuildGanttEditDraft = function(rowIndex, parsed) {
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        if (!row || row._level === undefined) return { ok: false };
        const lv = row._level;
        const currentLabel = (lv === 0 ? row._origDev : lv === 1 ? row._origT1 : lv === 2 ? row._origT2 : lv === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        return { ok: true, id: 'ganttEdit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), rowIdx: rowIndex, currentLabel, taskName: parsed.taskName, assignee: parsed.assignee, startDate: parsed.startDate, endDate: parsed.endDate, status: parsed.status, content: parsed.content };
    };

    window._aiGanttEditDraftPreviewMd = function(draft) {
        let md = `✏️ **Gantt 수정 초안 — "${draft.currentLabel}"**`;
        if (draft.taskName !== undefined) md += `\n- **업무명:** ${draft.taskName}`;
        if (draft.assignee !== undefined) md += `\n- **담당자:** ${draft.assignee}`;
        if (draft.startDate !== undefined) md += `\n- **시작일:** ${draft.startDate}`;
        if (draft.endDate !== undefined) md += `\n- **완료일:** ${draft.endDate}`;
        if (draft.status !== undefined) md += `\n- **상태:** ${draft.status}`;
        if (draft.content !== undefined) md += `\n- **내용:** ${String(draft.content).slice(0, 80)}${String(draft.content).length > 80 ? '...' : ''}`;
        md += `\n\n💬 이대로 반영하려면 "적용해줘"라고 말씀해주시거나, 아래 [✏️ 이대로 적용] 버튼을 눌러주세요.`;
        return md;
    };

    window._aiApplyGanttEditDraft = function(draft) {
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[draft.rowIdx] : null;
        if (!row || row._level === undefined) return { ok: false, error: '해당 업무를 더 이상 찾을 수 없습니다.' };
        const ci = window.colIdx || {};
        if (draft.taskName !== undefined && draft.taskName) {
            const lv = row._level;
            row._origDev = ''; row._origT1 = ''; row._origT2 = ''; row._origT3 = ''; row._origT4 = '';
            if (lv === 0) row._origDev = draft.taskName; else if (lv === 1) row._origT1 = draft.taskName; else if (lv === 2) row._origT2 = draft.taskName; else if (lv === 3) row._origT3 = draft.taskName; else row._origT4 = draft.taskName;
        }
        if (draft.assignee !== undefined && ci.assignee !== undefined && ci.assignee !== -1) row[ci.assignee] = draft.assignee;
        if (draft.startDate !== undefined && ci.start !== undefined && ci.start !== -1) { row[ci.start] = draft.startDate; row._explicitStartTs = draft.startDate ? new Date(draft.startDate).getTime() : null; row._startForced = !!draft.startDate; }
        if (draft.endDate !== undefined && ci.plan !== undefined && ci.plan !== -1) { row[ci.plan] = draft.endDate; row._explicitPlanTs = draft.endDate ? new Date(draft.endDate).getTime() : null; row._planForced = !!draft.endDate; }
        if (draft.status !== undefined && ci.status !== undefined && ci.status !== -1) row[ci.status] = draft.status;
        if (draft.content !== undefined && ci.content !== undefined && ci.content !== -1) row[ci.content] = draft.content;
        logChange(draft.rowIdx, -1, '업무 수정', `"${draft.currentLabel}" AI 문답으로 수정`, 'AI 문답');
        window.recalculateSchedules();
        return { ok: true };
    };

    window._aiApplyPendingGanttEditDraft = function(draftId, btn) {
        const pending = window._ganttQaPendingEditDraft;
        if (!pending || pending.id !== draftId) { if (window.showToast) window.showToast('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', 'warning'); window._renderGanttQaMessages(); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 적용 중...'; }
        const res = window._aiApplyGanttEditDraft(pending);
        window._ganttQaPendingEditDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: res.ok ? `✅ "${pending.currentLabel}" 업무 수정을 적용했습니다.` : `⚠️ 수정 실패: ${res.error}`, uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };
    window._aiCancelPendingGanttEditDraft = function(draftId) {
        if (window._ganttQaPendingEditDraft && window._ganttQaPendingEditDraft.id === draftId) window._ganttQaPendingEditDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: '✏️ 수정을 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };

    // ── GANTT_ADD_DRAFT 파서 ──
    window._parseGanttAddDraftBlock = function(blockText) {
        const lines = String(blockText || '').split('\n');
        let position, taskName, level, assignee, startDate, endDate, status;
        const contentLines = []; let inContent = false;
        lines.forEach(function(line) {
            if (inContent) { contentLines.push(line); return; }
            const m = line.match(/^\s*(위치|업무명|레벨|담당|시작일|완료일|상태|내용)\s*:\s*(.*)$/);
            if (!m) return;
            const key = m[1].trim(); const val = m[2].trim();
            if (key === '위치') position = parseInt(val, 10);
            else if (key === '업무명') taskName = val;
            else if (key === '레벨') level = parseInt(val, 10);
            else if (key === '담당') assignee = val;
            else if (key === '시작일') startDate = val;
            else if (key === '완료일') endDate = val;
            else if (key === '상태') status = val;
            else if (key === '내용') { inContent = true; if (val) contentLines.push(val); }
        });
        return { position: isNaN(position) ? null : position, taskName: taskName || '새로운 업무', level: isNaN(level) ? 1 : Math.max(0, Math.min(4, level)), assignee: assignee || '', startDate: startDate || '', endDate: endDate || '', status: status || '진행', content: contentLines.join('\n').trim() };
    };

    window._aiGanttAddDraftPreviewMd = function(draft) {
        const lvNames = ['대분류(Lv0)', '소요1(Lv1)', '소요2(Lv2)', '소요3(Lv3)', '소요4(Lv4)'];
        let md = `➕ **새 행 추가 초안**\n- **업무명:** ${draft.taskName}\n- **레벨:** ${lvNames[draft.level] || draft.level}`;
        if (draft.assignee) md += `\n- **담당자:** ${draft.assignee}`;
        if (draft.startDate) md += `\n- **시작일:** ${draft.startDate}`;
        if (draft.endDate) md += `\n- **완료일:** ${draft.endDate}`;
        if (draft.status) md += `\n- **상태:** ${draft.status}`;
        if (draft.content) md += `\n- **내용:** ${String(draft.content).slice(0, 80)}${String(draft.content).length > 80 ? '...' : ''}`;
        md += `\n- **삽입 위치:** ${draft.position !== null ? '#G' + draft.position + ' 아래' : '마지막'}`;
        md += `\n\n💬 이대로 추가하려면 "추가해줘"라고 말씀해주시거나, 아래 [➕ 이대로 추가] 버튼을 눌러주세요.`;
        return md;
    };

    window._aiApplyGanttAddDraft = function(draft) {
        const gd = typeof globalData !== 'undefined' ? globalData : null;
        if (!gd || gd.length < 1) return { ok: false, error: '데이터 없음' };
        const ci = window.colIdx || {};
        const insertAfterIdx = (draft.position !== null && draft.position >= 1 && draft.position < gd.length) ? draft.position : gd.length - 1;
        const refRow = gd[insertAfterIdx] || gd[1];
        const newRow = new Array((gd[0] || []).length).fill('');
        if (refRow) {
            const skipCols = [ci.no, ci.bogo, ci.start, ci.plan, ci.period, ci.dur1, ci.dur2, ci.dur3, ci.dur4, ci.chart, ci.content, ci.answer, ci.devStage, ci.taskType1, ci.taskType2, ci.taskType3, ci.taskType4];
            for (let i = 0; i < newRow.length; i++) { if (skipCols.includes(i)) continue; newRow[i] = refRow[i] || ''; }
        }
        const lv = draft.level;
        newRow._level = lv; newRow._origDev = ''; newRow._origT1 = ''; newRow._origT2 = ''; newRow._origT3 = ''; newRow._origT4 = '';
        if (lv === 0) newRow._origDev = draft.taskName; else if (lv === 1) newRow._origT1 = draft.taskName; else if (lv === 2) newRow._origT2 = draft.taskName; else if (lv === 3) newRow._origT3 = draft.taskName; else newRow._origT4 = draft.taskName;
        if (ci.assignee !== undefined && ci.assignee !== -1 && draft.assignee) newRow[ci.assignee] = draft.assignee;
        if (ci.status !== undefined && ci.status !== -1) newRow[ci.status] = draft.status || '진행';
        if (ci.content !== undefined && ci.content !== -1 && draft.content) newRow[ci.content] = draft.content;
        newRow._explicitStartTs = null; newRow._explicitPlanTs = null; newRow._startForced = false; newRow._planForced = false; newRow._finalDuration = 1;
        if (draft.startDate && ci.start !== undefined && ci.start !== -1) { newRow[ci.start] = draft.startDate; newRow._explicitStartTs = new Date(draft.startDate).getTime() || null; newRow._startForced = true; }
        if (draft.endDate && ci.plan !== undefined && ci.plan !== -1) { newRow[ci.plan] = draft.endDate; newRow._explicitPlanTs = new Date(draft.endDate).getTime() || null; newRow._planForced = true; }
        if (ci.period !== undefined && ci.period !== -1) newRow[ci.period] = '1';
        if (lv === 1 && ci.dur1 !== undefined && ci.dur1 !== -1) newRow[ci.dur1] = '1';
        if (lv === 2 && ci.dur2 !== undefined && ci.dur2 !== -1) newRow[ci.dur2] = '1';
        if (lv === 3 && ci.dur3 !== undefined && ci.dur3 !== -1) newRow[ci.dur3] = '1';
        if (lv === 4 && ci.dur4 !== undefined && ci.dur4 !== -1) newRow[ci.dur4] = '1';
        gd.splice(insertAfterIdx + 1, 0, newRow);
        logChange(insertAfterIdx + 1, -1, '없음', '행 추가됨 (AI 문답으로 추가)');
        window.recalculateSchedules();
        return { ok: true };
    };

    window._aiApplyPendingGanttAddDraft = function(draftId, btn) {
        const pending = window._ganttQaPendingAddDraft;
        if (!pending || pending.id !== draftId) { if (window.showToast) window.showToast('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', 'warning'); window._renderGanttQaMessages(); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 추가 중...'; }
        const res = window._aiApplyGanttAddDraft(pending);
        window._ganttQaPendingAddDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: res.ok ? `✅ "${pending.taskName}" 업무를 새로 추가했습니다.` : `⚠️ 추가 실패: ${res.error}`, uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };
    window._aiCancelPendingGanttAddDraft = function(draftId) {
        if (window._ganttQaPendingAddDraft && window._ganttQaPendingAddDraft.id === draftId) window._ganttQaPendingAddDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: '➕ 행 추가를 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };

    // 💡 [2026-09-03 확장] 기존 SET_ALARM/CLEAR_ALARM 처리에 Gantt 직접 조작 태그 6종을 추가.
    //    한 답변에 여러 태그가 올 수 있도록 replace+루프 방식으로 전환 — 처리 결과는 텍스트 끝에 모아 붙임.
    window._applyGanttQaActions = function(text) {
        const results = [];

        // SET_ALARM (한 답변에 여러 행 가능)
        text = text.replace(/\[\[ACTION:SET_ALARM:(\d+)\]\]/g, function(_, n) {
            const res = window._aiAssistSetAlarm(parseInt(n, 10));
            if (!res.ok) { results.push('⚠️ 알람을 설정하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(res.alreadyOn ? `📌 "${res.taskName}" 업무는 이미 알람이 켜져 있었습니다.` : `✅ "${res.taskName}" 업무에 알람을 설정했습니다.`);
            return '';
        });

        // CLEAR_ALARM
        text = text.replace(/\[\[ACTION:CLEAR_ALARM:(\d+)\]\]/g, function(_, n) {
            const res = window._aiAssistClearAlarm(parseInt(n, 10));
            if (!res.ok) { results.push('⚠️ 알람을 해제하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(res.alreadyOff ? `📌 "${res.taskName}" 업무는 이미 알람이 꺼져 있었습니다.` : `✅ "${res.taskName}" 업무의 알람을 해제했습니다.`);
            return '';
        });

        // DELETE_ROW — 즉시 실행 (Undo로 복구 가능)
        text = text.replace(/\[\[ACTION:DELETE_ROW:(\d+)\]\]/g, function(_, n) {
            const res = window._aiAssistDeleteRow(parseInt(n, 10));
            if (!res.ok) { results.push('⚠️ 행을 삭제하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(`🗑️ "${res.taskName}" 업무 (#G${n})를 삭제했습니다. (되돌리려면 Ctrl+Z)`);
            return '';
        });

        // SET_STATUS — 상태 변경
        text = text.replace(/\[\[ACTION:SET_STATUS:(\d+):([^\]]+)\]\]/g, function(_, n, status) {
            const res = window._aiAssistSetStatus(parseInt(n, 10), status.trim());
            if (!res.ok) { results.push('⚠️ 상태를 변경하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(`✅ "${res.taskName}" 상태: **${res.from || '(없음)'} → ${res.to}**`);
            return '';
        });

        // TOGGLE_KEY — 일정 잠금 토글
        text = text.replace(/\[\[ACTION:TOGGLE_KEY:(\d+)\]\]/g, function(_, n) {
            const res = window._aiAssistToggleKey(parseInt(n, 10));
            if (!res.ok) { results.push('⚠️ 잠금 상태를 변경하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(`✅ "${res.taskName}" 일정: ${res.locked ? '🔒 고정으로 설정' : '🔓 자동으로 해제'}`);
            return '';
        });

        // SET_LEVEL — WBS 레벨 변경
        text = text.replace(/\[\[ACTION:SET_LEVEL:(\d+):(\d+)\]\]/g, function(_, n, lv) {
            const res = window._aiAssistSetLevel(parseInt(n, 10), parseInt(lv, 10));
            if (!res.ok) { results.push('⚠️ 레벨을 변경하지 못했습니다 (#G' + n + ').'); return ''; }
            if (res.sameLevel) results.push(`📌 "${res.taskName}" 업무는 이미 레벨 ${lv}입니다.`);
            else results.push(`✅ "${res.taskName}" 레벨: **Lv${res.from} → Lv${res.to}**`);
            return '';
        });

        // MOVE_ROW — N칸 이동
        text = text.replace(/\[\[ACTION:MOVE_ROW:(\d+):(UP|DOWN)(?::(\d+))?\]\]/gi, function(_, n, dir, steps) {
            const res = window._aiAssistMoveRow(parseInt(n, 10), dir.toUpperCase(), steps ? parseInt(steps, 10) : 1);
            if (!res.ok) { results.push('⚠️ 행을 이동하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(`✅ "${res.taskName}" 업무를 ${dir.toUpperCase() === 'UP' ? '위' : '아래'}로 ${steps || 1}칸 이동했습니다.`);
            return '';
        });

        // MOVE_ROW_BEFORE — 특정 행 앞에 배치
        text = text.replace(/\[\[ACTION:MOVE_ROW_BEFORE:(\d+):(\d+)\]\]/g, function(_, src, tgt) {
            const res = window._aiAssistMoveRowBefore(parseInt(src, 10), parseInt(tgt, 10));
            if (!res.ok) { results.push('⚠️ 행 순서를 변경하지 못했습니다 (#G' + src + ' → #G' + tgt + ').'); return ''; }
            results.push(`✅ "${res.srcName}" 업무를 "${res.tgtName}" 업무 앞으로 이동했습니다.`);
            return '';
        });

        text = text.trim();
        if (results.length) text += '\n\n' + results.join('\n');
        return text;
    };

    // 💡 callAiBackend 응답에서 실제 답변 텍스트만 꺼내는 공통 로직 — 원문 메일 후속 조회(위 VIEW_MAIL
    //    처리) 때 두 번째 호출에도 그대로 재사용하기 위해 별도 함수로 뺐다(기존엔 sendGanttQaMessage
    //    안에 한 번만 인라인으로 있었음).
    window._extractGanttQaAiText = function(result) {
        return (result.data.result && result.data.result.candidates && result.data.result.candidates[0]
            && result.data.result.candidates[0].content && result.data.result.candidates[0].content.parts
            && result.data.result.candidates[0].content.parts[0] && result.data.result.candidates[0].content.parts[0].text) || '(빈 응답)';
    };

    window.sendGanttQaMessage = async function() {
        const input = document.getElementById('gantt-qa-input');
        if (!input) return;
        const question = input.value.trim();
        if (!question) return;

        const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!apiKey) { alert('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.'); return; }

        const priorHistory = window._ganttQaHistory.slice(); // 이번 질문/답변을 넣기 전 시점의 대화만 컨텍스트로 사용
        window._ganttQaHistory.push({ role: 'user', text: question });
        input.value = '';
        input.disabled = true;
        const sendBtn = document.getElementById('gantt-qa-send-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳'; }
        window._ganttQaHistory.push({ role: 'ai', text: '⏳ 답변 생성 중...', pending: true });
        window._renderGanttQaMessages();

        try {
            const prompt = await window._buildGanttQaPrompt(question, priorHistory);
            // 💡 위 window._withTimeout 참고 — GAS 호출(callAiBackend)이 네트워크 문제 등으로 응답도
            //    오류도 없이 멈춰버리면 "⏳ 답변 생성 중..."이 영원히 안 바뀌어 "응답 없음"으로 보인다.
            //    60초 안에 안 끝나면 오류로 처리해서 사용자가 재시도할 수 있게 한다.
            const result = await window._withTimeout(window.callAiBackend(apiKey, prompt, {}), 60000, '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
            if (!result.ok) throw result.error || new Error('알 수 없는 오류');
            let text = window._extractGanttQaAiText(result);

            // 💡 [2026-08-28 신규] "원문 메일도 봐줘" 대응 — AI가 [[ACTION:VIEW_MAIL:번호]] 태그로
            //    특정 업무의 원문을 요청하면(위 프롬프트의 "📧 원문 메일" 규칙), 그 태그를 사용자에게
            //    그대로 보여주는 대신 원문을 조회해 후속 프롬프트에 끼워 넣고 한 번 더 물어봐서, 사용자
            //    눈에는 "바로 원문 내용을 근거로 답한 것"처럼 보이게 한다(SET_ALARM처럼 즉시 실행되는
            //    액션이 아니라, 답을 만들기 위한 추가 조회이므로 왕복이 한 번 더 필요함).
            const mailRowIdxs = Array.from(text.matchAll(/\[\[ACTION:VIEW_MAIL:(\d+)\]\]/g)).map(function(m) { return parseInt(m[1], 10); });
            if (mailRowIdxs.length) {
                const mailTexts = mailRowIdxs.map(window._aiAssistGetMailRaw).filter(Boolean);
                if (mailTexts.length) {
                    const followupPrompt = await window._buildGanttQaPrompt(question, priorHistory, mailTexts);
                    const result2 = await window._withTimeout(window.callAiBackend(apiKey, followupPrompt, {}), 60000, '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
                    if (result2.ok) text = window._extractGanttQaAiText(result2);
                    else text = text.replace(/\[\[ACTION:VIEW_MAIL:\d+\]\]/g, '').trim() + '\n\n⚠️ 원문 메일을 불러오는 중 오류가 발생했습니다.';
                } else {
                    text = text.replace(/\[\[ACTION:VIEW_MAIL:\d+\]\]/g, '').trim() + '\n\n⚠️ 해당 업무의 원문 메일을 찾지 못했습니다.';
                }
            }

            // 💡 [2026-09-01 신규] "🌐 다른 프로젝트 조회" 대응 — VIEW_MAIL과 동일한 2단계 왕복 패턴.
            //    AI가 [[ACTION:LOAD_PROJECT:번호]]로 지금 안 열려있는 다른 프로젝트 데이터를 요청하면,
            //    그 프로젝트 파일을 Drive에서 직접 읽어(화면엔 아무 변화 없음 — 순수 조회) 후속
            //    프롬프트에 끼워 넣고 한 번 더 물어봐서, 사용자 눈에는 곧바로 그 데이터를 근거로
            //    답한 것처럼 보이게 한다. 여러 프로젝트를 한 번에 요청했으면 전부 병렬로 가져온다.
            const otherProjectNos = Array.from(text.matchAll(/\[\[ACTION:LOAD_PROJECT:(\d+)\]\]/g)).map(function(m) { return parseInt(m[1], 10); });
            if (otherProjectNos.length) {
                const otherProjectTexts = (await Promise.all(otherProjectNos.map(window._aiFetchOtherProjectContext))).filter(Boolean);
                if (otherProjectTexts.length) {
                    const followupPrompt2 = await window._buildGanttQaPrompt(question, priorHistory, null, otherProjectTexts);
                    const result3 = await window._withTimeout(window.callAiBackend(apiKey, followupPrompt2, {}), 60000, '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
                    if (result3.ok) text = window._extractGanttQaAiText(result3);
                    else text = text.replace(/\[\[ACTION:LOAD_PROJECT:\d+\]\]/g, '').trim() + '\n\n⚠️ 다른 프로젝트 데이터를 불러오는 중 오류가 발생했습니다.';
                } else {
                    text = text.replace(/\[\[ACTION:LOAD_PROJECT:\d+\]\]/g, '').trim() + '\n\n⚠️ 해당 프로젝트를 찾지 못했습니다(삭제되었거나 접근 권한이 없을 수 있습니다).';
                }
            }

            text = window._applyGanttQaActions(text.trim());

            // 💡 [2026-09-01 신규] "📤 메일 작성/발송" — 위 프롬프트 규칙 참고. 이번 턴에 새 초안이
            //    생겼는지(mailDraftIdThisTurn), 확정 발송을 시도했는지(sendResultNote)를 모두 여기서
            //    처리하고 결과만 답변 텍스트에 반영한다(실제 발송은 window._ganttQaPendingMailDraft에
            //    저장해둔 "코드가 이미 이메일까지 resolve해둔" 구조화 데이터로만 하고, AI가 CONFIRM
            //    턴에 다시 적어 보낸 텍스트는 절대 신뢰하지 않음 — 사람이 본 초안과 실제 발송 내용이
            //    100% 같아야 하므로).
            let mailDraftIdThisTurn = null;
            const mDraft = text.match(/\[\[MAIL_DRAFT\]\]([\s\S]*?)\[\[\/MAIL_DRAFT\]\]/);
            if (mDraft) {
                const parsed = window._parseMailDraftBlock(mDraft[1]);
                const draft = window._aiBuildMailDraftFromParsed(parsed);
                window._ganttQaPendingMailDraft = draft;
                mailDraftIdThisTurn = draft.id;
                text = text.replace(mDraft[0], window._aiMailDraftPreviewMd(draft)).trim();
            }
            const mSendConfirm = text.match(/\[\[ACTION:SEND_MAIL:CONFIRM\]\]/);
            if (mSendConfirm) {
                text = text.replace(mSendConfirm[0], '').trim();
                if (!window._ganttQaPendingMailDraft) {
                    text += '\n\n⚠️ 아직 확정할 메일 초안이 없습니다. 먼저 메일 작성을 요청해주세요.';
                } else {
                    const pending = window._ganttQaPendingMailDraft;
                    const sendRes = await window._aiSendMailFromDraft(pending);
                    text += sendRes.ok
                        ? `\n\n✅ 메일을 발송했습니다. (수신: ${pending.to.filter(function(p){return p.email;}).map(function(p){return p.name;}).join(', ')})`
                        : `\n\n⚠️ 메일 발송 실패: ${sendRes.error}`;
                    window._ganttQaPendingMailDraft = null; // 성공/실패 모두 소진 — 같은 초안이 중복 발송되지 않게
                }
            }

            // 💡 [2026-09-01 신규] "📢 공지 등록" — 위 프롬프트의 [[NOTICE_DRAFT]] 규칙 참고. 메일과
            //    동일한 초안→확인 왕복 패턴(Gantt 업무와 무관하게 항상 만들 수 있음).
            let noticeDraftIdThisTurn = null;
            const mNotice = text.match(/\[\[NOTICE_DRAFT\]\]([\s\S]*?)\[\[\/NOTICE_DRAFT\]\]/);
            if (mNotice) {
                const parsedNotice = window._parseNoticeDraftBlock(mNotice[1]);
                const noticeDraft = window._aiBuildNoticeDraftFromParsed(parsedNotice);
                window._ganttQaPendingNoticeDraft = noticeDraft;
                noticeDraftIdThisTurn = noticeDraft.id;
                text = text.replace(mNotice[0], window._aiNoticeDraftPreviewMd(noticeDraft)).trim();
            }
            const mRegisterConfirm = text.match(/\[\[ACTION:REGISTER_NOTICE:CONFIRM\]\]/);
            if (mRegisterConfirm) {
                text = text.replace(mRegisterConfirm[0], '').trim();
                if (!window._ganttQaPendingNoticeDraft) {
                    text += '\n\n⚠️ 아직 확정할 공지 초안이 없습니다. 먼저 공지 등록을 요청해주세요.';
                } else {
                    const pendingNotice = window._ganttQaPendingNoticeDraft;
                    const regRes = window._aiRegisterNoticeFromDraft(pendingNotice);
                    text += regRes.ok
                        ? `\n\n✅ "${pendingNotice.title}" 공지를 등록했습니다.${regRes.count > 1 ? ` (${regRes.count}개 날짜 → ${regRes.count}건 등록)` : ''}`
                        : `\n\n⚠️ 공지 등록 실패: ${regRes.error}`;
                    window._ganttQaPendingNoticeDraft = null;
                }
            }

            // 💡 [2026-09-01 신규] "📌 알람 세부 설정" — 위 프롬프트의 [[ALARM_DRAFT:번호]] 규칙 참고.
            //    대상 업무가 애초에 알람을 걸 수 없는 상태(존재하지 않거나 완료 예정일이 없음)면 초안
            //    자체를 만들지 않고(pending state 없음) 바로 오류 안내만 붙인다.
            let alarmDraftIdThisTurn = null;
            const mAlarmDraft = text.match(/\[\[ALARM_DRAFT:(\d+)\]\]([\s\S]*?)\[\[\/ALARM_DRAFT\]\]/);
            if (mAlarmDraft) {
                const parsedAlarm = window._parseAlarmDraftBlock(mAlarmDraft[2]);
                const alarmDraft = window._aiBuildAlarmDraftFromParsed(parseInt(mAlarmDraft[1], 10), parsedAlarm);
                if (!alarmDraft.ok) {
                    text = text.replace(mAlarmDraft[0], alarmDraft.reason === 'no-due-date'
                        ? '⚠️ 이 업무는 완료 예정일이 없어 알람을 설정할 수 없습니다.'
                        : '⚠️ 지정한 업무를 찾지 못해 알람을 설정하지 못했습니다.').trim();
                } else {
                    window._ganttQaPendingAlarmDraft = alarmDraft;
                    alarmDraftIdThisTurn = alarmDraft.id;
                    text = text.replace(mAlarmDraft[0], window._aiAlarmDraftPreviewMd(alarmDraft)).trim();
                }
            }
            const mApplyConfirm = text.match(/\[\[ACTION:APPLY_ALARM:CONFIRM\]\]/);
            if (mApplyConfirm) {
                text = text.replace(mApplyConfirm[0], '').trim();
                if (!window._ganttQaPendingAlarmDraft) {
                    text += '\n\n⚠️ 아직 확정할 알람 설정 초안이 없습니다. 먼저 알람 설정을 요청해주세요.';
                } else {
                    const pendingAlarm = window._ganttQaPendingAlarmDraft;
                    const applyRes = window._aiApplyAlarmDraft(pendingAlarm);
                    text += applyRes.ok
                        ? `\n\n✅ "${pendingAlarm.taskName}" 업무의 알람 설정을 적용했습니다.`
                        : `\n\n⚠️ 알람 설정 적용 실패: ${applyRes.error}`;
                    window._ganttQaPendingAlarmDraft = null;
                }
            }

            // 💡 [2026-09-03 신규] "✏️ Gantt 수정 초안" — [[GANTT_EDIT_DRAFT:번호]] 파싱 → pending 저장 → 미리보기
            let ganttEditDraftIdThisTurn = null;
            const mGanttEdit = text.match(/\[\[GANTT_EDIT_DRAFT:(\d+)\]\]([\s\S]*?)\[\[\/GANTT_EDIT_DRAFT\]\]/);
            if (mGanttEdit) {
                const parsedGEdit = window._parseGanttEditDraftBlock(mGanttEdit[2]);
                const gEditDraft = window._aiBuildGanttEditDraft(parseInt(mGanttEdit[1], 10), parsedGEdit);
                if (!gEditDraft.ok) {
                    text = text.replace(mGanttEdit[0], '⚠️ 해당 업무 행을 찾지 못해 수정 초안을 만들 수 없습니다.').trim();
                } else {
                    window._ganttQaPendingEditDraft = gEditDraft;
                    ganttEditDraftIdThisTurn = gEditDraft.id;
                    text = text.replace(mGanttEdit[0], window._aiGanttEditDraftPreviewMd(gEditDraft)).trim();
                }
            }
            const mApplyEditConfirm = text.match(/\[\[ACTION:APPLY_GANTT_EDIT:CONFIRM\]\]/);
            if (mApplyEditConfirm) {
                text = text.replace(mApplyEditConfirm[0], '').trim();
                if (!window._ganttQaPendingEditDraft) {
                    text += '\n\n⚠️ 아직 확정할 Gantt 수정 초안이 없습니다. 먼저 수정 내용을 말씀해주세요.';
                } else {
                    const pendingGEdit = window._ganttQaPendingEditDraft;
                    const applyGEditRes = window._aiApplyGanttEditDraft(pendingGEdit);
                    text += applyGEditRes.ok
                        ? `\n\n✅ "${pendingGEdit.currentLabel}" 업무 수정을 적용했습니다.`
                        : `\n\n⚠️ 수정 실패: ${applyGEditRes.error}`;
                    window._ganttQaPendingEditDraft = null;
                }
            }

            // 💡 [2026-09-03 신규] "➕ 새 행 추가 초안" — [[GANTT_ADD_DRAFT]] 파싱 → pending 저장 → 미리보기
            let ganttAddDraftIdThisTurn = null;
            const mGanttAdd = text.match(/\[\[GANTT_ADD_DRAFT\]\]([\s\S]*?)\[\[\/GANTT_ADD_DRAFT\]\]/);
            if (mGanttAdd) {
                const parsedGAdd = window._parseGanttAddDraftBlock(mGanttAdd[1]);
                const gAddDraft = { ok: true, id: 'ganttAdd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...parsedGAdd };
                window._ganttQaPendingAddDraft = gAddDraft;
                ganttAddDraftIdThisTurn = gAddDraft.id;
                text = text.replace(mGanttAdd[0], window._aiGanttAddDraftPreviewMd(gAddDraft)).trim();
            }
            const mApplyAddConfirm = text.match(/\[\[ACTION:APPLY_GANTT_ADD:CONFIRM\]\]/);
            if (mApplyAddConfirm) {
                text = text.replace(mApplyAddConfirm[0], '').trim();
                if (!window._ganttQaPendingAddDraft) {
                    text += '\n\n⚠️ 아직 확정할 새 행 추가 초안이 없습니다. 먼저 추가 내용을 말씀해주세요.';
                } else {
                    const pendingGAdd = window._ganttQaPendingAddDraft;
                    const applyGAddRes = window._aiApplyGanttAddDraft(pendingGAdd);
                    text += applyGAddRes.ok
                        ? `\n\n✅ "${pendingGAdd.taskName}" 업무를 새로 추가했습니다.`
                        : `\n\n⚠️ 추가 실패: ${applyGAddRes.error}`;
                    window._ganttQaPendingAddDraft = null;
                }
            }

            window._ganttQaHistory.pop(); // "⏳ 답변 생성 중..." placeholder 제거
            // 💡 uid/question을 함께 저장 — 아래 👍/👎 피드백(window.saveGanttQaFeedback)이 이 답변을
            //    질문과 묶어서 기록하고, 나중에 [🤖 일괄개선]이 "무슨 질문에 어떻게 잘못 답했는지"를
            //    AI에게 다시 보여줄 수 있게 한다.
            window._ganttQaHistory.push({ role: 'ai', text: text.trim(), uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), question: question, mailDraftId: mailDraftIdThisTurn, noticeDraftId: noticeDraftIdThisTurn, alarmDraftId: alarmDraftIdThisTurn, ganttEditDraftId: ganttEditDraftIdThisTurn, ganttAddDraftId: ganttAddDraftIdThisTurn });
        } catch (e) {
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: '⚠️ 오류: ' + (e && e.message ? e.message : e), error: true });
        } finally {
            window._renderGanttQaMessages();
            input.disabled = false;
            input.focus();
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '전송'; }
        }
    };

    // ── 💡 [2026-08-31 신규] AI 문답 피드백(👍/👎) + AI 프롬프트 자동개선 요청 ─────────────
    //    AI 프로젝트 요약의 피드백/개선 시스템(saveProjectSummaryFeedback / triggerProjectSummaryPromptImprove /
    //    showPsImprovePreviewModal / applyImprovedPsPrompt)과 완전히 동일한 설계를 그대로 재사용하되,
    //    요약은 "리포트 1건"을 평가하는 반면 문답은 "채팅 메시지 하나하나"를 평가한다는 차이만 있다.
    //    diff 유틸(_simpleLineDiff/renderPromptDiffHtml)·관리자 비밀번호(verifyAdminPassword)는
    //    이미 있는 범용 함수를 그대로 재사용한다.
    const _QAF_KEY = 'gantt_qa_feedback';
    window._lastQaFeedbackUid = null; // 방금 저장한 피드백의 대상 메시지 uid (개선 요청 시 코멘트를 채워넣을 대상)

    window._qaFeedbackFor = function(uid) {
        if (!uid) return null;
        const log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
        return log.find(function(x) { return x.uid === uid; }) || null;
    };

    window.saveGanttQaFeedback = function(uid, rating) {
        const msg = (window._ganttQaHistory || []).find(function(m) { return m.uid === uid; });
        if (!msg) return;
        let log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
        let entry = log.find(function(x) { return x.uid === uid; });
        if (!entry) {
            entry = { uid: uid, date: new Date().toISOString(), promptVersion: window._ganttQaPromptVersion || 1, question: msg.question || '', answer: msg.text || '', userComment: '', rating: rating, improved: false };
            log.unshift(entry);
            if (log.length > 200) log = log.slice(0, 200);
        } else {
            entry.rating = rating; // 재평가(마음이 바뀐 경우) — 기존 코멘트/기록은 유지
        }
        localStorage.setItem(_QAF_KEY, JSON.stringify(log));

        if (rating === 'good') window._lastQaFeedbackUid = null;
        else window._lastQaFeedbackUid = uid;

        if (window.showToast && rating === 'good') window.showToast('👍 피드백이 저장되었습니다.', 'info');
        window._renderGanttQaMessages(); // 버튼 활성 표시 + "💡 의견" 링크 노출 갱신
    };

    // ── 💡 개선 요청 코멘트 입력 모달 (AI 요약의 ps-improve-comment-modal과 별도 — id 충돌 방지) ──
    window.openQaImproveCommentModal = function(uid) {
        window._lastQaFeedbackUid = uid;
        let modal = document.getElementById('gantt-qa-improve-comment-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-improve-comment-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9250; background:rgba(255,218,185,0.22);';
            modal.innerHTML = `
            <div id="gantt-qa-improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
                <div id="gantt-qa-improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ 어떤 부분이 문제였나요?</span>
                    <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-improve-comment-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div style="padding:18px;">
                    <textarea id="gantt-qa-improve-comment-input" placeholder="예: 데이터에 있는 값인데도 '데이터에서 확인되지 않습니다'라고 답함 (선택 입력)"
                        style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button onclick="window.submitQaImproveComment()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 요청</button>
                        <button onclick="document.getElementById('gantt-qa-improve-comment-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:9px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">✖ 취소</button>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('gantt-qa-improve-comment-box', 'gantt-qa-improve-comment-drag');
            window._bindClickToFront('gantt-qa-improve-comment-modal');
        }
        document.getElementById('gantt-qa-improve-comment-input').value = '';
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('gantt-qa-improve-comment-modal');
    };

    window.submitQaImproveComment = function() {
        const comment = document.getElementById('gantt-qa-improve-comment-input').value.trim();
        document.getElementById('gantt-qa-improve-comment-modal').style.display = 'none';

        if (window._lastQaFeedbackUid) {
            const log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
            const it = log.find(function(x) { return x.uid === window._lastQaFeedbackUid; });
            if (it) { it.userComment = comment; localStorage.setItem(_QAF_KEY, JSON.stringify(log)); }
        }
        window.triggerGanttQaPromptImprove('instant', comment);
    };

    // 💡 다운스트림 코드가 의존하는 데이터 삽입 자리(${...})가 개선된 프롬프트에도 살아있는지 검사
    //    (AI 요약의 validateProjectSummaryPromptStructure와 동일한 목적)
    window.validateGanttQaPromptStructure = function(promptText) {
        const requiredPlaceholders = ['${todayStr}', '${projectLine}', '${overviewText}', '${memberText}', '${materialText}',
            '${customerSpecText}', '${mcTableText}', '${elecPartsText}', '${addressText}', '${totalTasks}', '${taskListText}',
            '${mailSection}', '${recentLogsText}', '${historyText}', '${question}'];
        const missing = [];
        requiredPlaceholders.forEach(function(p) {
            if (promptText.indexOf(p) === -1) missing.push('플레이스홀더: ' + p);
        });
        return missing; // 빈 배열이면 이상 없음
    };

    window.triggerGanttQaPromptImprove = async function(mode, instantComment) {
        const currentPrompt = localStorage.getItem('gantt_qa_prompt') || window._defaultGanttQaPromptTemplate || '';
        const apiKey = window.getActiveAiKey();
        let casesText = '';
        let targetUids = [];

        if (mode === 'instant') {
            const log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
            const fb = window._lastQaFeedbackUid ? log.find(function(x) { return x.uid === window._lastQaFeedbackUid; }) : null;
            targetUids = fb ? [fb.uid] : [];
            casesText = `[케이스 1]\n질문: ${(fb && fb.question) || ''}\nAI 답변: ${(fb && fb.answer) || ''}\n\n사용자 코멘트: ${instantComment || '(없음)'}`;
        } else {
            // 💡 배치 모드 — 지금까지 쌓인 👎 피드백(improved:false) 케이스를 모아 한 번에 개선 요청
            const log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
            const pending = log.filter(function(x) { return x.rating === 'bad' && !x.improved; }).slice(0, 10);
            targetUids = pending.map(function(x) { return x.uid; });
            if (!pending.length) {
                alert('⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 AI 답변 아래 👎 버튼을 눌러 케이스를 쌓아주세요.');
                return;
            }
            casesText = pending.map(function(fb, i) {
                return `[케이스 ${i + 1}] (${fb.date ? fb.date.slice(0, 10) : ''})\n질문: ${fb.question || ''}\nAI 답변: ${fb.answer || ''}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
            }).join('\n\n---\n\n');
        }

        const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱/치환하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 아래 플레이스홀더는 정확히 이 이름 그대로 유지해야 합니다(삭제/이름변경/오타 금지, 정확히 한 번 이상씩): \${todayStr} \${projectLine} \${overviewText} \${memberText} \${materialText} \${customerSpecText} \${mcTableText} \${elecPartsText} \${addressText} \${totalTasks} \${taskListText} \${mailSection} \${recentLogsText} \${historyText} \${question}\n2. [[ACTION:SET_ALARM:번호]] / [[ACTION:CLEAR_ALARM:번호]] / [[ACTION:VIEW_MAIL:번호]] 태그 형식과 그 사용 규칙 설명은 그대로 유지하세요(이 정확한 문자열 패턴을 다른 코드가 정규식으로 찾아서 실제 알람 설정/원문 조회 기능을 실행합니다).\n표현/지시문/설명 등 나머지는 자유롭게 개선해도 됩니다.`;

        const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 "AI 문답(Gantt 프로젝트에 대해 자유 질문에 답하는 챗봇)" 프롬프트와, 이 프롬프트로 답변했을 때 사용자가 "나쁨"으로 평가한 사례입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

        if (window.showToast) window.showToast('🤖 AI 개선 요청 중...', 'info');
        try {
            const callResult = await window.callAiBackend(apiKey, improvePrompt);
            if (!callResult.ok) throw callResult.error;
            const data = callResult.data;
            const text = data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            const cleaned = text.replace(/```[a-z]*|```/gi, '').trim();
            const analysisMatch = cleaned.match(/===ANALYSIS===([\s\S]*?)===PROMPT===/);
            const promptMatch   = cleaned.match(/===PROMPT===([\s\S]*?)(===END===|$)/);
            const analysis = analysisMatch ? analysisMatch[1].trim() : '';
            const improvedPrompt = promptMatch ? promptMatch[1].trim() : '';
            const isTruncated = !/===END===/.test(cleaned);

            if (!improvedPrompt) throw new Error('AI 응답 형식을 해석하지 못했습니다.');
            const structIssues = window.validateGanttQaPromptStructure(improvedPrompt);
            window.showQaImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
        } catch (e) {
            alert('❌ AI 개선 요청 실패: ' + (e && e.message ? e.message : e));
        }
    };

    // ── 💡 개선 결과 미리보기 모달 (diff 유틸은 AI 요약과 공유, 모달 자체는 별도) ──────────
    window.showQaImprovePreviewModal = function(analysis, improvedPrompt, targetUids, originalPrompt, isTruncated, structIssues) {
        let modal = document.getElementById('gantt-qa-improve-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-improve-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="gantt-qa-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="gantt-qa-improve-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 프롬프트 개선 제안 (AI 문답)</span>
                    <button onclick="document.getElementById('gantt-qa-improve-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div id="gantt-qa-improve-truncate-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404;"></div>
                <div id="gantt-qa-improve-struct-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#ffe3e3; border:1px solid #e03131; border-radius:6px; font-size:12px; color:#c92a2a;"></div>
                <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔍 문제점 분석</div>
                        <div id="gantt-qa-improve-analysis-text" style="font-size:12px; color:#333; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; padding:10px; white-space:pre-wrap; line-height:1.6;"></div>
                    </div>
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔀 변경사항 (원본 대비)
                            <span style="font-weight:normal; color:#999;">(빨강=삭제, 초록=추가)</span>
                        </div>
                        <div id="gantt-qa-improve-diff-view" style="max-height:220px; overflow-y:auto; font-size:11.5px; font-family:'Malgun Gothic',monospace; border:1px solid #e6e9ef; border-radius:6px; line-height:1.5; background:#fff;"></div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column;">
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">✏️ 개선된 프롬프트 (수정 가능)</div>
                        <textarea id="gantt-qa-improve-prompt-textarea" style="flex:1; min-height:200px; font-size:12px; font-family:'Malgun Gothic',monospace; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:vertical; line-height:1.6;"></textarea>
                    </div>
                </div>
                <div style="padding:12px 16px; display:flex; gap:8px; border-top:1px solid #eee;">
                    <button onclick="window.applyImprovedQaPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 채택</button>
                    <button onclick="document.getElementById('gantt-qa-improve-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:10px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">❌ 무시</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('gantt-qa-improve-box', 'gantt-qa-improve-drag');
            window._bindClickToFront('gantt-qa-improve-modal');
        }

        const warnBar = document.getElementById('gantt-qa-improve-truncate-warning');
        warnBar.textContent = '⚠️ AI 응답이 중간에 잘렸을 수 있습니다 (종료 마커 없음). 채택 전 아래 프롬프트 끝부분을 꼭 확인하세요.';
        warnBar.style.display = isTruncated ? 'block' : 'none';

        const structBar = document.getElementById('gantt-qa-improve-struct-warning');
        if (structIssues && structIssues.length) {
            structBar.innerHTML = '🚨 다른 코드가 의존하는 필수 요소가 빠진 것 같습니다: <b>' + structIssues.join(', ') + '</b>';
            structBar.style.display = 'block';
        } else {
            structBar.style.display = 'none';
        }

        document.getElementById('gantt-qa-improve-diff-view').innerHTML = window.renderPromptDiffHtml(originalPrompt || '', improvedPrompt);
        document.getElementById('gantt-qa-improve-analysis-text').textContent = analysis;
        document.getElementById('gantt-qa-improve-prompt-textarea').value = improvedPrompt;
        modal._targetUids = targetUids || [];
        modal.style.display = 'block';
        window.bringModalToFront('gantt-qa-improve-modal');
    };

    // ── 💡 개선 프롬프트 채택 ───────────────────────────────────────────────
    window.applyImprovedQaPrompt = async function() {
        const text = document.getElementById('gantt-qa-improve-prompt-textarea').value.trim();
        if (!text) { alert('프롬프트가 비어있습니다.'); return; }

        if (!window.verifyAdminPassword('🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert('❌ 비밀번호 인증 실패. 채택이 취소되었습니다.');
            return;
        }

        const oldPrompt = localStorage.getItem('gantt_qa_prompt') || window._defaultGanttQaPromptTemplate || '';
        window._ganttQaPromptVersion = (window._ganttQaPromptVersion || 1) + 1;
        localStorage.setItem('gantt_qa_prompt_version', String(window._ganttQaPromptVersion));
        localStorage.setItem('gantt_qa_prompt', text);

        // ✅ 변경 이력 저장 — 이력 테이블(showQaPromptLogs)은 gantt_qa_prompt_logs를 읽으므로, 버전
        //    스냅샷(versions)만 남기고 이 로그를 빼먹으면 AI 개선으로 채택한 버전이 이력 화면에 안 보인다.
        let qaLogs = JSON.parse(localStorage.getItem('gantt_qa_prompt_logs') || '[]');
        qaLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + ' (AI개선 채택 v' + window._ganttQaPromptVersion + ')',
            oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
            newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        });
        if (qaLogs.length > 20) qaLogs = qaLogs.slice(-20);
        localStorage.setItem('gantt_qa_prompt_logs', JSON.stringify(qaLogs));
        window.saveQaPromptVersionSnapshot(text, 'AI개선 채택 v' + window._ganttQaPromptVersion);

        const modal = document.getElementById('gantt-qa-improve-modal');
        const uids = (modal && modal._targetUids) || [];
        if (uids.length) {
            const log = JSON.parse(localStorage.getItem(_QAF_KEY) || '[]');
            uids.forEach(function(uid) {
                const it = log.find(function(x) { return x.uid === uid; });
                if (it) it.improved = true;
            });
            localStorage.setItem(_QAF_KEY, JSON.stringify(log));
        }

        if (window.isDriveConnected && window.saveGanttQaPromptToDrive) {
            const ok = await window.saveGanttQaPromptToDrive(text);
            if (ok) {
                localStorage.removeItem('gantt_qa_prompt_pending_push');
                alert('✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v' + window._ganttQaPromptVersion + ')');
            } else {
                localStorage.setItem('gantt_qa_prompt_pending_push', '1');
                alert('⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.');
            }
        } else {
            localStorage.setItem('gantt_qa_prompt_pending_push', '1');
            alert('✅ 개선된 프롬프트가 채택되었습니다. (v' + window._ganttQaPromptVersion + ')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)');
        }
        modal.style.display = 'none';
        if (document.getElementById('gantt-qa-prompt-textarea')) document.getElementById('gantt-qa-prompt-textarea').value = text;
    };

    window.clearGanttQaChat = function() {
        if (window._ganttQaHistory.length && !confirm('대화 내용을 모두 지울까요?')) return;
        window._ganttQaHistory = [];
        window._ganttQaPendingMailDraft = null; // 💡 대화를 지우면 남아있던 메일 초안도 함께 무효화
        window._ganttQaPendingNoticeDraft = null; // 💡 공지 초안도 함께 무효화
        window._ganttQaPendingAlarmDraft = null; // 💡 알람 세부 설정 초안도 함께 무효화
        window._aiOtherProjectDataCache = {}; // 💡 이전 대화에서 조회했던 다른 프로젝트 데이터도 함께 비움
        window._renderGanttQaMessages();
    };

    window.openGanttQaModal = function() {
        let modal = document.getElementById('gantt-qa-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9150; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="gantt-qa-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:380px;">
                <div id="gantt-qa-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>💬 AI 문답</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.openGanttQaPromptModal()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" title="AI 문답 프롬프트 편집" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s;">📝 프롬프트</button>
                        <button onclick="document.getElementById('gantt-qa-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                    </div>
                </div>
                <div style="padding:8px 18px 0; font-size:10.5px; color:#999;">현재 열려있는 프로젝트의 Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · 주소록(이름/부서/직함) 데이터를 근거로 답변합니다. (대화는 저장되지 않습니다)</div>
                <div id="gantt-qa-messages" style="overflow-y:auto; flex:1; padding:12px 16px;"></div>
                <div style="padding:10px 14px; border-top:1px solid #eee; display:flex; gap:8px; align-items:stretch;">
                    <textarea id="gantt-qa-input" rows="3" placeholder="이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)" style="flex:1; resize:none; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:12.5px; font-family:inherit; line-height:1.4;" onkeydown="if(event.key==='Enter' &amp;&amp; !event.shiftKey){ event.preventDefault(); window.sendGanttQaMessage(); }"></textarea>
                    <button onclick="window.clearGanttQaChat()" onmouseover="this.style.background='#f8d4d4'; this.style.borderColor='#e59a9a';" onmouseout="this.style.background='#fdecec'; this.style.borderColor='#f0b8b8';" title="현재 대화 내용을 모두 지웁니다" style="padding:0 12px; background:#fdecec; color:#b03a3a; border:1px solid #f0b8b8; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🗑️ 대화삭제</button>
                    <button id="gantt-qa-send-btn" onclick="window.sendGanttQaMessage()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:0 16px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">전송</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('gantt-qa-box', 'gantt-qa-drag');
            window._bindClickToFront('gantt-qa-modal');
        }
        window._renderGanttQaMessages();
        modal.style.display = 'block';
        window.bringModalToFront('gantt-qa-modal');
        setTimeout(function() { const inp = document.getElementById('gantt-qa-input'); if (inp) inp.focus(); }, 50);
    };

    // ═══════════════════════════════════════════════════════════
    // 📝 [2026-08-31 신규] AI 문답 프롬프트 편집 모달 — AI 프로젝트 요약 프롬프트 편집 모달과 동일한
    //    잠금(관리자 비밀번호)/저장(팀 공용 Drive)/초기화 개념을 그대로 적용. 이력 뷰어·피드백 기반
    //    "일괄개선"은 AI 문답엔 👍👎 피드백 수집 자체가 없어서 제외했다(필요해지면 나중에 추가).
    // ═══════════════════════════════════════════════════════════
    window._ganttQaPromptVersion = parseInt(localStorage.getItem('gantt_qa_prompt_version') || '1', 10);

    window.openGanttQaPromptModal = async function() {
        let modal = document.getElementById('gantt-qa-prompt-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-prompt-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="gantt-qa-prompt-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="gantt-qa-prompt-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>📝 AI 문답 — 프롬프트 편집</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.showQaPromptLogs()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">🕒 이력</button>
                        <button onclick="document.getElementById('gantt-qa-prompt-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                    </div>
                </div>
                <div id="gantt-qa-prompt-notice" style="margin:10px 18px 0; padding:8px 12px; font-size:11px; color:#495057; background:#eef3f8; border-radius:6px; line-height:1.5;"></div>
                <div id="gantt-qa-prompt-meta" style="padding:4px 18px 0; font-size:10.5px; color:#aaa;"></div>
                <div style="flex:1; padding:10px 18px; overflow:hidden; display:flex; flex-direction:column;">
                    <textarea id="gantt-qa-prompt-textarea" readonly style="flex:1; width:100%; resize:none; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:12px; font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic'; line-height:1.5; background:#f8f9fa; color:#555;"></textarea>
                    <input id="gantt-qa-save-memo" type="text" maxlength="40" placeholder="💬 이번 저장 메모 (선택, 예: 추론 허용 문구 추가 v1)"
                        style="display:none; width:100%; margin-top:8px; padding:7px 10px; border:1px solid #ced4da; border-radius:6px; font-size:12px; box-sizing:border-box; flex-shrink:0;">
                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="gantt-qa-prompt-unlock-btn" onclick="window.unlockGanttQaPrompt()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="비밀번호 필요" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔒 수정하기</button>
                    <button id="gantt-qa-prompt-save-btn" onclick="window.saveGanttQaPromptFromModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">저장</button>
                    <button id="gantt-qa-prompt-reset-btn" onclick="window.resetGanttQaPromptInModal()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; min-width:120px; padding:8px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">🔄 기본값으로 초기화</button>
                    <button onclick="window.triggerGanttQaPromptImprove('batch')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" title="쌓인 👎 피드백 케이스를 모아 한 번에 프롬프트 개선" style="flex:1; min-width:120px; padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🤖 일괄개선</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('gantt-qa-prompt-box', 'gantt-qa-prompt-drag');
            window._bindClickToFront('gantt-qa-prompt-modal');
        }

        // 💡 열 때마다 팀 공용(Drive) 최신본을 한 번 받아와서 로컬 캐시를 최신 상태로 맞춘 뒤 표시
        if (window.isDriveConnected && window.loadGanttQaPromptFromDrive) {
            await window.loadGanttQaPromptFromDrive();
        }
        const current = localStorage.getItem('gantt_qa_prompt') || window._defaultGanttQaPromptTemplate || '';
        document.getElementById('gantt-qa-prompt-textarea').value = current;
        const meta = window._ganttQaPromptDriveMeta;
        const metaEl = document.getElementById('gantt-qa-prompt-meta');
        if (metaEl) metaEl.textContent = (meta && meta.updatedBy) ? `마지막 수정: ${meta.updatedBy} · ${meta.updatedAt}` : '';

        // 💡 팀 공용 프롬프트를 실수로 건드리지 않도록, 다른 프롬프트 편집창과 동일하게 열 때마다 잠금 상태로 초기화
        document.getElementById('gantt-qa-prompt-textarea').readOnly = true;
        document.getElementById('gantt-qa-prompt-textarea').style.background = '#f8f9fa';
        document.getElementById('gantt-qa-prompt-textarea').style.color = '#555';
        document.getElementById('gantt-qa-prompt-unlock-btn').style.display = 'block';
        document.getElementById('gantt-qa-prompt-save-btn').style.display = 'none';
        document.getElementById('gantt-qa-prompt-reset-btn').style.display = 'none';
        const memoEl0 = document.getElementById('gantt-qa-save-memo');
        if (memoEl0) memoEl0.style.display = 'none';
        const notice = document.getElementById('gantt-qa-prompt-notice');
        notice.style.background = '#eef3f8';
        notice.style.color = '#495057';
        notice.textContent = window.isDriveConnected
            ? '💡 팀 공용(드라이브) 프롬프트입니다. 수정하려면 관리자 비밀번호가 필요합니다.'
            : '⚠️ 구글 드라이브 미연동 상태 — 이 PC에만 저장되며 팀과 공유되지 않습니다. 수정하려면 관리자 비밀번호가 필요합니다.';

        modal.style.display = 'block';
        window.bringModalToFront('gantt-qa-prompt-modal');
    };

    window.unlockGanttQaPrompt = function() {
        const success = verifyAdminPassword('🔒 프롬프트 수정을 위해 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)');
        if (!success) { alert('❌ 비밀번호 인증 실패. 프롬프트 수정이 취소되었습니다.'); return; }

        document.getElementById('gantt-qa-prompt-textarea').readOnly = false;
        document.getElementById('gantt-qa-prompt-textarea').style.background = '#fffde7';
        document.getElementById('gantt-qa-prompt-textarea').style.color = '#333';
        document.getElementById('gantt-qa-prompt-unlock-btn').style.display = 'none';
        document.getElementById('gantt-qa-prompt-save-btn').style.display = 'block';
        document.getElementById('gantt-qa-prompt-reset-btn').style.display = 'block';
        const memoEl = document.getElementById('gantt-qa-save-memo');
        if (memoEl) memoEl.style.display = 'block';
        const notice = document.getElementById('gantt-qa-prompt-notice');
        notice.textContent = '✏️ 프롬프트를 자유롭게 수정하세요. "${todayStr}"·"${taskListText}"·"${question}" 처럼 "${...}"로 표시된 자리는 실제 답변 생성 시 데이터로 자동 치환되니 그대로 유지하세요(지우거나 철자를 바꾸면 그 자리엔 데이터 대신 글자 그대로 나갑니다).';
        notice.style.color = '#0056b3';
        notice.style.background = '#e7f1ff';
    };

    window.saveGanttQaPromptFromModal = async function() {
        const text = document.getElementById('gantt-qa-prompt-textarea').value.trim();
        if (!text) { alert('프롬프트 내용이 비어있습니다.'); return; }

        // ✅ 변경 이력 저장 (AI 요약/AI 업무분석 프롬프트 편집과 동일한 이력 기능)
        const oldPrompt = localStorage.getItem('gantt_qa_prompt') || window._defaultGanttQaPromptTemplate || '';
        if (oldPrompt !== text) {
            let logs = JSON.parse(localStorage.getItem('gantt_qa_prompt_logs') || '[]');
            logs.push({
                time: new Date().toLocaleString('ko-KR'),
                userName: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
                newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
            });
            if (logs.length > 20) logs = logs.slice(-20);
            localStorage.setItem('gantt_qa_prompt_logs', JSON.stringify(logs));

            window._ganttQaPromptVersion = (window._ganttQaPromptVersion || 1) + 1;
            localStorage.setItem('gantt_qa_prompt_version', String(window._ganttQaPromptVersion));
            const memoEl = document.getElementById('gantt-qa-save-memo');
            const memo = memoEl && memoEl.value.trim() ? ': ' + memoEl.value.trim() : '';
            window.saveQaPromptVersionSnapshot(text, '수동 저장 v' + window._ganttQaPromptVersion + memo);
            if (memoEl) memoEl.value = '';
        }

        localStorage.setItem('gantt_qa_prompt', text);

        // 💡 드라이브 미연동/업로드 실패 시 "아직 못 올린 로컬 변경"으로 표시 — 나중에 드라이브가 연결됐을
        //    때 loadGanttQaPromptFromDrive()가 옛 버전으로 덮어쓰지 않고 먼저 올리게 함(다른 두 프롬프트와 동일)
        if (window.isDriveConnected && window.saveGanttQaPromptToDrive) {
            const ok = await window.saveGanttQaPromptToDrive(text);
            if (ok) localStorage.removeItem('gantt_qa_prompt_pending_push');
            else localStorage.setItem('gantt_qa_prompt_pending_push', '1');
            if (window.showToast) window.showToast(ok ? '✏️ 프롬프트를 팀 공용으로 저장했습니다.' : '⚠️ 로컬엔 저장됐지만 팀 공용(Drive) 저장은 실패했습니다.', ok ? 'info' : 'error');
        } else {
            localStorage.setItem('gantt_qa_prompt_pending_push', '1');
            if (window.showToast) window.showToast('✏️ 이 PC에만 저장했습니다 (Drive 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다).', 'info');
        }
    };

    window.resetGanttQaPromptInModal = function() {
        if (!confirm('편집 중인 내용을 버리고 기본 프롬프트로 되돌릴까요?')) return;
        // 💡 리셋도 되돌릴 수 있도록, 리셋 전 현재 프롬프트를 스냅샷으로 남김
        const current = localStorage.getItem('gantt_qa_prompt');
        if (current) window.saveQaPromptVersionSnapshot(current, '기본값 초기화 전 백업');
        document.getElementById('gantt-qa-prompt-textarea').value = window._defaultGanttQaPromptTemplate || '';
    };

    // ── 💡 프롬프트 변경 이력 모달 — AI 요약/AI 업무분석의 표준 패턴(단일 ✕, 드래그 가능,
    //    배경 비차단)을 그대로 따름 ──────────────────────────────────────────────
    window.saveQaPromptVersionSnapshot = function(promptText, note) {
        window._ganttQaPromptVersion = (window._ganttQaPromptVersion || 1);
        let versions = JSON.parse(localStorage.getItem('gantt_qa_prompt_versions') || '[]');
        versions.push({
            version: window._ganttQaPromptVersion,
            time: new Date().toLocaleString('ko-KR'),
            userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + (note ? ' (' + note + ')' : ''),
            prompt: promptText
        });
        if (versions.length > 20) versions = versions.slice(-20);
        localStorage.setItem('gantt_qa_prompt_versions', JSON.stringify(versions));
    };

    window.showQaPromptLogs = function() {
        let logs = JSON.parse(localStorage.getItem('gantt_qa_prompt_logs') || '[]');
        let versions = JSON.parse(localStorage.getItem('gantt_qa_prompt_versions') || '[]');
        if (logs.length === 0) { alert('프롬프트 변경 이력이 없습니다.'); return; }

        let logModal = document.getElementById('gantt-qa-prompt-log-modal');
        if (!logModal) {
            logModal = document.createElement('div');
            logModal.id = 'gantt-qa-prompt-log-modal';
            logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; pointer-events:none; background:none; align-items:center; justify-content:center;';
            logModal.innerHTML = `
                <div id="gantt-qa-prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                    <div id="gantt-qa-prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                        <span>🕒 AI 문답 — 프롬프트 변경 이력</span>
                        <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-prompt-log-modal').style.display='none'"
                            style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                                   color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                            onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                            title="닫기">✕</button>
                    </div>
                    <div id="gantt-qa-prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                    <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                        <button onclick="window.clearQaPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                        <button onclick="document.getElementById('gantt-qa-prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">닫기</button>
                    </div>
                </div>`;
            document.body.appendChild(logModal);
            window._makeDraggable('gantt-qa-prompt-log-box', 'gantt-qa-prompt-log-drag');
            window._bindClickToFront('gantt-qa-prompt-log-modal');
        }

        // 💡 [2026-08-31 버그 수정] table-layout이 auto(기본값)이던 상태에서 "변경일시"/"수정자" 칸에
        //    white-space:nowrap을 걸어두니, 칸이 좁아질 때 그 글자가 줄바꿈되는 대신 칸 경계를 넘어
        //    옆 칸(다음 열) 위에 겹쳐 보이는 버그가 있었음("...8:20박용훈"처럼 시각과 이름이 붙어 보임).
        //    table-layout:fixed + colgroup으로 각 열 너비를 고정폭 비율로 미리 확보해서, 브라우저가
        //    내용 길이에 따라 열 너비를 제멋대로 줄이지 못하게 막는다.
        let html = '<table style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px;"><colgroup><col style="width:14%;"><col style="width:11%;"><col style="width:33%;"><col style="width:33%;"><col style="width:9%;"></colgroup>';
        html += '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">변경일시</th><th style="padding:8px;border:1px solid #dee2e6;">수정자</th><th style="padding:8px;border:1px solid #dee2e6;">변경 전 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">변경 후 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">복원</th></tr>';
        [...logs].reverse().forEach((log) => {
            const matched = versions.find(v => v.time === log.time);
            const restoreBtn = matched
                ? `<button onclick="window.restoreQaPromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 복원</button>`
                : `<span style="font-size:10px; color:#ccc;">-</span>`;
            html += `<tr>
                <td style="padding:8px;border:1px solid #dee2e6;color:#6c757d; word-break:break-word;">${log.time}</td>
                <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#0056b3; word-break:break-word;">${log.userName}</td>
                <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#dc3545;word-break:break-all;">${log.oldPrompt}</td>
                <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#0f5132;word-break:break-all;">${log.newPrompt}</td>
                <td style="padding:8px;border:1px solid #dee2e6;text-align:center;">${restoreBtn}</td>
            </tr>`;
        });
        html += '</table>';

        document.getElementById('gantt-qa-prompt-log-content').innerHTML = html;
        logModal.style.display = 'flex';
        window.bringModalToFront('gantt-qa-prompt-log-modal');
    };

    // 💡 특정 버전으로 복원 — 즉시 저장하지 않고 편집창에 불러와서 검토 후 저장하도록 유도
    window.restoreQaPromptVersion = function(version) {
        const versions = JSON.parse(localStorage.getItem('gantt_qa_prompt_versions') || '[]');
        const target = versions.find(v => v.version === version);
        if (!target) { alert('해당 버전을 찾을 수 없습니다.'); return; }

        document.getElementById('gantt-qa-prompt-log-modal').style.display = 'none';
        const textarea = document.getElementById('gantt-qa-prompt-textarea');
        if (textarea) textarea.value = target.prompt;
        alert('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 저장] 버튼을 눌러야 최종 반영됩니다.');
    };

    window.clearQaPromptLogs = function() {
        if (!confirm('프롬프트 변경 이력을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
        localStorage.removeItem('gantt_qa_prompt_logs');
        localStorage.removeItem('gantt_qa_prompt_versions');
        document.getElementById('gantt-qa-prompt-log-modal').style.display = 'none';
        alert('✅ 이력이 삭제되었습니다.');
    };

    // ═══════════════════════════════════════════════════════════
    // ⚙️ [2026-08-27 신규] AI 도구 설정 — "업무 상세내용/답변을 AI에게 보낼 때 최대 몇 자까지
    //    보여줄지"를 사용자가 직접 정하게 함. 원래 250자로 하드코딩돼 있어서 UPS 송장번호·PWM 수치처럼
    //    문장 뒷부분에 있는 세부 내용이 잘려나가 "요약이 부실하다"는 문제로 이어졌었음(AI 문답에서 발견,
    //    AI 요약도 같은 원인으로 부실할 수 있어 둘 다 이 설정 값을 공유해서 씀).
    // ═══════════════════════════════════════════════════════════
    window._AI_CONTENT_MAXLEN_DEFAULT = 500;
    window.getAiContentMaxLen = function() {
        const v = parseInt(localStorage.getItem('gantt_ai_content_maxlen'), 10);
        return (v && v >= 50) ? v : window._AI_CONTENT_MAXLEN_DEFAULT;
    };
    window.setAiContentMaxLen = function(v) {
        localStorage.setItem('gantt_ai_content_maxlen', String(v));
    };

    // 💡 [2026-08-27 신규] AI 업무분석(메일 분석)이 Gemini에게 보내는 메일 본문 최대 글자 수 — 원래
    //    토큰·응답시간 보호를 위해 2000자로 하드코딩돼 있던 값(analyzeBtn 클릭 시/msCallGemini 자동수집
    //    둘 다 동일)을 위 업무 상세내용 설정과 같은 방식으로 사용자가 직접 조절할 수 있게 함.
    window._AI_MAIL_MAXLEN_DEFAULT = 2000;
    window.getAiMailMaxLen = function() {
        const v = parseInt(localStorage.getItem('gantt_ai_mail_maxlen'), 10);
        return (v && v >= 500) ? v : window._AI_MAIL_MAXLEN_DEFAULT;
    };
