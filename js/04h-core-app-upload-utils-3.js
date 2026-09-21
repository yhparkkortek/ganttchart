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
            return await window._buildOtherProjectQaContext(pd, entry);
        } catch (e) { console.warn('다른 프로젝트(#P' + no + ') 조회 실패:', e.message); return null; }
    };

    // ── 💡 [2026-09-07 신규] "AI 문답에서 프로젝트를 직접 골라서 물어보기" ──────────────────────────
    //    위 _aiFetchOtherProjectContext(AI가 스스로 [[ACTION:LOAD_PROJECT:번호]]로 요청하는 자동 경로)와
    //    달리, 사람이 채팅창 상단 드롭다운으로 미리 프로젝트를 지정해두면 AI의 번호 매칭 판단을 거치지
    //    않고 그 프로젝트 데이터를 곧바로 첫 프롬프트에 실어 보낸다 — 왕복이 1번으로 줄어(자동경로는
    //    "번호만 응답" 1번 + "실제 답변" 1번, 총 2번 AI 호출) 지연시간·실패 지점이 절반이 된다.
    //    같은 프로젝트를 다시 물으면 이번 대화 세션 안에서는(_aiOtherProjectDataCache 재사용) 다시
    //    Drive에서 읽지 않는다 — 자동 경로(_aiFetchOtherProjectContext)는 매번 새로 읽으므로 여기서만
    //    캐시를 추가로 검사한다(둘 다 같은 캐시 객체를 쓰지만 키가 문자열 drive_file_id라 서로 충돌하지 않음).
    window._aiFetchManualTargetContext = async function(entry) {
        if (!entry || !entry.drive_file_id) return null;
        window._aiOtherProjectDataCache = window._aiOtherProjectDataCache || {};
        const cached = window._aiOtherProjectDataCache[entry.drive_file_id];
        if (cached) return await window._buildOtherProjectQaContext(cached, entry);
        try {
            const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${entry.drive_file_id}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pd = await res.json();
            window._aiOtherProjectDataCache[entry.drive_file_id] = pd;
            return await window._buildOtherProjectQaContext(pd, entry);
        } catch (e) { console.warn('[AI 문답] 선택한 프로젝트(' + (entry.file_name || entry.label || '') + ') 조회 실패:', e.message); return null; }
    };

    // ── 💡 [2026-09-14 신규] "AI 문답에서 SAP 언급 시 자동으로 현재 SAP 화면 조회" ──────────────────
    //    로컬 백엔드(kortek_backend.py, 127.0.0.1:5000)의 /sap-fetch가 실제 SAP GUI Scripting을
    //    수행한다 — 이 함수는 그 결과를 가져와 문자열로 반환할 뿐, 브라우저에서 SAP에 직접 접속하지
    //    않는다(브라우저 JS는 애초에 Windows COM에 접근할 수 없음). 비밀번호를 전혀 주고받지 않는다:
    //    사용자가 평소처럼 SAP GUI에 로그인해서 원하는 화면을 열어둔 상태에서만 동작한다.
    //    실패해도(백엔드 꺼짐/SAP GUI 안 열림 등) null을 반환해 AI 문답 자체는 계속 진행되고,
    //    프롬프트의 "🏭 SAP 조회 규칙"이 그 경우 AI가 "가져오지 못했다"고 솔직히 답하게 지시한다.
    // 💡 [2026-09-15 신규, 같은 날 복수 자재 지원 + 사용처(역전개) 지원 추가] question 인자를
    //    받아 "BOM"과 자재번호(5~8자리 숫자)가 같이 언급되면 그냥 "지금 SAP GUI 화면"을 읽는
    //    대신 그 자재의 BOM 화면(ZPP038)으로 직접 찾아가서 읽어온다(sap_bridge_32.py의
    //    _navigate_to_bom_screen — 실사용 SAP GUI "기록 및 재생" 매크로로 확보한 정확한
    //    컨트롤) — 사람이 미리 그 화면을 열어둘 필요가 없어진다(MM03 문서 열기의 자재번호
    //    직접조회와 같은 설계). 자재번호가 2개 이상 언급되면("SAP에서 502572,502573,502574
    //    BOM 보여줘") 전부 모아서 같이 보내 ZPP038의 "복수 선택" 팝업으로 한 번에 조회한다
    //    ("BOM 복수 열람.vbs" 매크로로 확보). "역전개"/"사용처"가 언급되면(정방향 BOM 전개의
    //    반대 — 이 자재가 "어디에 쓰이는지" 조회) CS15("단일레벨 사용처리스트")로 이동한다
    //    ("BOM 역전개(사용처리스트).vbs" 매크로로 확보 — 단, 이 매크로엔 자재번호 입력 단계가
    //    안 보여서 필드 ID는 추측이다, `_navigate_to_where_used_screen`의 주석 참고). 두
    //    트리거가 동시에 매치되면 "역전개/사용처"를 우선한다(더 구체적인 요청으로 간주).
    //    아무 키워드도 없거나 자재번호를 못 찾으면 기존처럼 "지금 화면"을 그대로 읽는다
    //    (하위호환 — question을 안 넘기고 호출해도 동일).
    // 💡 [2026-09-15 버그수정] "104446 사용처 조회해줘"처럼 "SAP"란 단어 없이 사용처/역전개/BOM +
    //    자재번호만 말하면, 아래 메인 AI 호출 경로(`sendGanttQaMessage`)의 게이트가
    //    `/sap/i.test(question)`만 보고 있어서 이 함수(`_aiFetchSapContext`) 자체가 아예 호출되지
    //    않았다 — 그 결과 안의 사용처/BOM 감지 로직까지 도달을 못 해, AI가 SAP를 전혀 조회하지
    //    않고 간트 데이터에서만 자재번호를 찾다가 "데이터에서 확인되지 않습니다"라고 답하는 실사용
    //    버그가 있었다(위 "💬 AI 문답" 절의 "당연히 될 줄 알았는데 안 된다" 패턴과 동일 — 사용자는
    //    "SAP"를 붙일 필요가 있는 줄 몰랐음). 이 함수 내부(바로 아래)의 사용처/BOM 감지 조건과
    //    동일한 조건을 게이트에도 적용해, "SAP"를 굳이 말하지 않아도 인식되게 한다.
    window._questionMentionsSapIntent = function(question) {
        if (!question) return false;
        if (/sap/i.test(question)) return true;
        if (/(역전개|사용처)/.test(question) && /\b\d{5,8}\b/.test(question)) return true;
        if (/bom/i.test(question) && /\b\d{5,8}\b/.test(question)) return true;
        return false;
    };

    // 📐 [2026-09-15 신규] "BOM 조회 전에 옵션(Explosion type/Show price/Location Information)을
    //    먼저 물어보고, 복수(ZPP038)/단일(ZPP033) 트랜잭션도 워딩으로 판정해달라"는 사용자 요청 —
    //    실제 ZPP038 초기화면 캡처(빨간 박스로 두 섹션을 표시)를 보여주며 요청함. 사용처(역전개)의
    //    "다중/일괄/복수" 워딩 라우팅(wantsBatchWhereUsed)과 같은 패턴을 재사용하되, BOM은 "애매하면
    //    조회 전에 한번 물어봐줘"까지 요구돼서(사용처는 절대 안 물어봄) 여러 턴에 걸친 draft
    //    상태머신(_ganttQaApprovalDraft/_ganttQaSapDocClarify와 동일한 설계)이 하나 더 필요하다.
    //    아래 sendGanttQaMessage의 BOM draft 블록이 이 값들을 채운 뒤, 정확히 그 자재 조합에 대해
    //    딱 한 번만 소비되는 "예약된 옵션"(_ganttQaBomResolvedOptions)을 여기 남겨두면, 이 함수의
    //    bomMatch 분기가 그 값을 읽어 /sap-bom에 실어 보내고 즉시 비운다(1회성 — 재사용 금지, 다음
    //    BOM 질문은 다시 옵션을 물어봐야 하므로).
    window._ganttQaBomDraft = null; // {materials, originalQuestion, useSingleTcode, explosion, showPrice, showLocation, stage:'tcode'|'options'}
    window._ganttQaBomResolvedOptions = null; // {materialsKey, useSingleTcode, explosion, showPrice, showLocation} — 1회성

    window._ganttQaExtractBomTrigger = function(question) {
        if (!question) return null;
        if (/(역전개|사용처)/.test(question)) return null; // 사용처 조회가 더 구체적인 요청이면 그쪽에 양보(기존 bomMatch와 동일 우선순위)
        if (!/bom/i.test(question)) return null;
        const nums = question.match(/\b\d{5,8}\b/g) || [];
        if (!nums.length) return null;
        return { materials: nums };
    };

    // "단일 레벨, 가격 표시, 위치 정보 안 함"류 자유 답변을 느슨하게 파싱 — 언급 안 된 항목은
    // undefined로 남겨 "아직 모름"과 "아니오"를 구분한다(호출부가 필요에 따라 기본값을 채움).
    window._ganttQaParseBomOptionReply = function(text) {
        const out = {};
        if (!text) return out;
        if (/(다중|multi)/i.test(text)) out.explosion = 'multi';
        else if (/(단일|single)/i.test(text)) out.explosion = 'single';
        const priceSeg = (text.match(/가격[^,，\n]*/) || text.match(/price[^,，\n]*/i) || [])[0];
        if (priceSeg) out.showPrice = !/(x|아니오|제외|안\s*함|no\b|미표시|없음)/i.test(priceSeg);
        const locSeg = (text.match(/(로케이션|위치|location)[^,，\n]*/i) || [])[0];
        if (locSeg) out.showLocation = !/(x|아니오|제외|안\s*함|no\b|미표시|없음)/i.test(locSeg);
        // 🆕 [2026-09-17 신규] 레이아웃 코드는 "/CHKIM STD"처럼 공백이 들어간 값도 있어서
        // 쉼표/공백 경계로 자르면 안 됨 — 드롭다운이 항상 따옴표로 감싸 합성하므로 그 패턴을
        // 그대로 찾는다(자유 텍스트로 직접 타이핑하는 경우도 같은 형식을 요구 — 이 값은
        // 드롭다운이 주 사용처라 자유 텍스트 지원은 부차적).
        const layoutSeg = text.match(/레이아웃\s*[:：]?\s*"([^"]+)"/) || text.match(/layout\s*[:：]?\s*"([^"]+)"/i);
        if (layoutSeg) out.layout = layoutSeg[1];
        return out;
    };

    // 🔽 [2026-09-16 변경, 사용자 요청 "이미 하드코딩된 객관식 문의는 전부 드롭다운으로"]
    // 원래는 자유 텍스트로 "단일 레벨, 가격 표시, 위치 정보 안 함"처럼 타이핑해서 답해야
    // 했는데, 이것도 정해진 선택지(전개 방식 2개/Show price 예·아니오/Location 예·아니오)뿐인
    // 객관식 질문이라 드롭다운 대상이다 — 다만 3개 질문의 선택지가 서로 달라서(전개 방식은
    // 단일/다중, 나머지 둘은 예/아니오) 기존 "모든 항목이 같은 options를 공유하는" 다중
    // 드롭다운으로는 못 담았다 — 그래서 각 항목이 자기만의 options를 가질 수 있도록
    // _ganttQaRenderChoiceDropdownHtml을 확장한 뒤 이 함수에서 그 형태로 사용한다.
    // buildAnswerText가 합성하는 문자열("단일 레벨, 가격 표시, 위치 정보 안 함")은 기존
    // _ganttQaParseBomOptionReply가 파싱하는 정확히 그 문구 패턴 그대로라, 파서 쪽은 전혀
    // 안 건드려도 된다(드롭다운은 입력 방식만 바꾸고 처리 로직은 그대로 재사용한다는 원칙).
    // 🆕 [2026-09-17 신규, 사용자 요청] "ALV 레이아웃을 /STD_MC로 하드코딩하지 말고 매번
    // 물어봐달라" — 사용자가 실제 SAP "레이아웃 선택" 팝업에 있는 전체 목록(팀이 실제로
    // 쓰는 개인/공용 레이아웃 60여 개)을 그대로 줘서, 그 목록을 드롭다운 선택지로 그대로
    // 옮김(추측 아님 — 코드/설명 둘 다 사용자가 붙여넣은 원문 그대로). 값이 비어있으면
    // (=드롭다운에서 아무것도 안 고르면) 기존 기본값 "/STD_MC"로 자동 폴백하므로, 굳이
    // 고르지 않아도 예전과 동일하게 동작한다 — 이 목록에 없는 레이아웃이 나중에 더 생기면
    // 이 배열에 `{value, label}` 형태로 추가하면 됨.
    window._SAP_BOM_LAYOUT_OPTIONS = [
        { value: '/CDH', label: '/CDH — BOM전개 MC가' },
        { value: '/CH_1', label: '/CH_1 — BOM 전개-재고' },
        { value: '/CHKIM STD', label: '/CHKIM STD — BOM전개' },
        { value: '/CJJ', label: '/CJJ — BOM전개 표준화율산출' },
        { value: '/CWJ1', label: '/CWJ1 — BOM전개' },
        { value: '/CWJ2', label: '/CWJ2 — BOM전개/표준화율' },
        { value: '/DHEVAN', label: '/DHEVAN — MC Table' },
        { value: '/DY', label: '/DY — BOM전개단가' },
        { value: '/HAN', label: '/HAN — BOM전개' },
        { value: '/HC', label: '/HC — BOM전개단가' },
        { value: '/HHJ', label: '/HHJ — BOM전개' },
        { value: '/HU', label: '/HU — BOM전개' },
        { value: '/HY', label: '/HY — BOM전개' },
        { value: '/HY2', label: '/HY2 — BOM전개' },
        { value: '/HY3', label: '/HY3 — BOM전개단가' },
        { value: '/HY4', label: '/HY4 — BOM전개단가-MC산출용전개편' },
        { value: '/JH', label: '/JH — BOM전개' },
        { value: '/JH2', label: '/JH2 — BOM전개단가' },
        { value: '/JHM', label: '/JHM — BOM전개 소요량' },
        { value: '/JKB1', label: '/JKB1 — BOM전개' },
        { value: '/JMS', label: '/JMS — BOM전개' },
        { value: '/JMS 2', label: '/JMS 2 — BOM전개 Board' },
        { value: '/JYP_MC', label: '/JYP_MC — 표준MC' },
        { value: '/KDK_BOM', label: '/KDK_BOM — BOM전개' },
        { value: '/KDY', label: '/KDY — BOM전개' },
        { value: '/KH', label: '/KH — BOM 전개 순서변경' },
        { value: '/KH2', label: '/KH2 — BOM전개' },
        { value: '/KH3', label: '/KH3 — BOM 전개-재고' },
        { value: '/KMS-LT', label: '/KMS-LT — BOM전개' },
        { value: '/KPI_BOM', label: '/KPI_BOM — BOM전개' },
        { value: '/L', label: '/L — BOM전개' },
        { value: '/LEE_MC', label: '/LEE_MC — MC' },
        { value: '/LJH_TEST', label: '/LJH_TEST — BOM전개' },
        { value: '/LKY', label: '/LKY — BOM전개' },
        { value: '/LOC', label: '/LOC — LOC' },
        { value: '/LSH', label: '/LSH — BOM전개-간' },
        { value: '/LSH MC', label: '/LSH MC — MC' },
        { value: '/MJ', label: '/MJ — BOM MC' },
        { value: '/PJKR', label: '/PJKR — 표준품사' },
        { value: '/PP', label: '/PP — BOM전개' },
        { value: '/PP4', label: '/PP4 — BOM전개' },
        { value: '/PSW', label: '/PSW — 박석원' },
        { value: '/S1', label: '/S1 — BOM전개-간' },
        { value: '/SEOK_BOM1', label: '/SEOK_BOM1 — BOM전개' },
        { value: '/SEOK_설치지점_재', label: '/SEOK_설치지점_재 — BOM전개' },
        { value: '/SGKIM', label: '/SGKIM — BOM전개' },
        { value: '/SH', label: '/SH — BOM전개' },
        { value: '/SHIN', label: '/SHIN — BOM전개' },
        { value: '/SHKIM', label: '/SHKIM — BOM전개' },
        { value: '/SJ', label: '/SJ — BOM전개' },
        { value: '/SSS1', label: '/SSS1 — BOM/편집' },
        { value: '/ST', label: '/ST — BOM 전개-재고' },
        { value: '/STD_MC', label: '/STD_MC — 임시 저장 (기본값)' },
        { value: '/YJM', label: '/YJM — BOM전개_단가' },
        { value: '/백준기', label: '/백준기 — BOM전개단가-GANTT' },
        { value: '/장정범', label: '/장정범 — 장정범' }
    ];

    window._ganttQaShowBomOptionsDropdown = function(materials) {
        const _en = window._currentLang === 'en';
        const matLabel = materials.join(', ');
        const id = 'bom-options-' + Date.now();
        window._ganttQaPendingChoiceDropdown = {
            id: id, multi: true,
            items: [
                {
                    label: _en ? '1) Explosion type' : '1) 전개 방식(Explosion type)',
                    options: [
                        { value: 'single', label: _en ? 'Single level' : '단일 레벨' },
                        { value: 'multi', label: _en ? 'Multi level' : '다중 레벨' }
                    ]
                },
                {
                    label: _en ? '2) Show price?' : '2) Show price(표준가격)',
                    options: [
                        { value: 'yes', label: _en ? 'Yes' : '예 (표시)' },
                        { value: 'no', label: _en ? 'No' : '아니오 (표시 안 함)' }
                    ]
                },
                {
                    label: _en ? '3) Location Information?' : '3) Location Information(재고위치)',
                    options: [
                        { value: 'yes', label: _en ? 'Yes' : '예 (표시)' },
                        { value: 'no', label: _en ? 'No' : '아니오 (표시 안 함)' }
                    ]
                },
                {
                    label: _en ? '4) ALV layout (optional)' : '4) 레이아웃(ALV Layout, 선택사항)',
                    options: window._SAP_BOM_LAYOUT_OPTIONS
                }
            ],
            buildAnswerText: function(selections) {
                const parts = [];
                if (selections[0]) parts.push(selections[0] === 'multi' ? '다중 레벨' : '단일 레벨');
                if (selections[1]) parts.push('가격 ' + (selections[1] === 'yes' ? '표시' : '표시 안 함'));
                if (selections[2]) parts.push('위치 정보 ' + (selections[2] === 'yes' ? '표시' : '안 함'));
                // 🆕 레이아웃 코드에 공백이 들어간 것도 있어서(예: "/CHKIM STD") 쉼표/공백
                // 기반 파싱과 안 겹치게 따옴표로 감싸서 합성 — _ganttQaParseBomOptionReply가
                // 같은 따옴표 패턴으로 파싱함.
                if (selections[3]) parts.push(`레이아웃: "${selections[3]}"`);
                return parts.join(', ');
            }
        };
        window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: id, text: window._t(
            `📐 자재 "${matLabel}"의 BOM을 조회하기 전에 아래에서 옵션을 선택해주세요(레이아웃을 고르지 않으면 기본값 "/STD_MC"가 적용됩니다).`,
            `📐 Before looking up the BOM for material(s) "${matLabel}", please choose the options below (if you skip the layout, the default "/STD_MC" is used).`
        )});
    };

    // 🔽 [2026-09-16 변경, 위와 동일한 이유] "단일 조회를 말씀하셨는데 자재가 여러 개라 단일/복수
    // 트랜잭션 중 뭘 쓸지" 되묻는 질문도 단일/복수 둘 중 하나뿐인 객관식이라 드롭다운으로 바꿈.
    window._ganttQaShowBomTcodeDropdown = function(materialsCount) {
        const _en = window._currentLang === 'en';
        const id = 'bom-tcode-' + Date.now();
        window._ganttQaPendingChoiceDropdown = {
            id: id, multi: false,
            options: [
                { value: 'single', label: _en ? 'One at a time (ZPP033)' : '자재별 개별 조회 (ZPP033)' },
                { value: 'multi', label: _en ? 'All at once (ZPP038)' : '한 번에 복수 조회 (ZPP038)' }
            ],
            buildAnswerText: function(sel) { return sel[0] === 'multi' ? '복수' : '단일'; }
        };
        window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: id, text: window._t(
            `자재가 ${materialsCount}개인데 "단일" 조회를 말씀하셨어요 — 아래에서 골라주세요.`,
            `You mentioned a "single" lookup but there are ${materialsCount} materials — please choose below.`
        )});
    };

    // 🛒 [2026-09-15 신규] "구매오더 요청" — AI 문답 창에 전자세금계산서/견적서 PDF를 첨부하면
    //    항목을 추출해 "연구소 구매오더,기타출고 제안 BDC Upload양식"(사용자 제공
    //    Z38MMR060.xls) 엑셀을 만들고, ZMMR060에 업로드→F8→협력사/세금코드/단가 입력까지
    //    자동화한 뒤 **저장 직전에 멈춰 사람 확인을 받는다**(사용자와 명시적으로 합의한
    //    설계 — 실제 SAP 저장은 되돌리기 번거로운 재무적 커밋이라 확인 없이 자동 실행하지
    //    않음). CLAUDE.md "🛒 구매오더 요청" 절 참고.
    // 임시코드 표(920101~900501) — 사용자가 제공한 표 그대로. AI가 품목 설명을 보고 가장
    // 가까운 코드를 제안하는 데 쓰인다(애매하면 사람이 확인/정정).
    window._PO_TEMP_CODE_TABLE = [
        { code: '900101', desc: '개발용 Panel(Open Cell, LCM)' },
        { code: '900102', desc: '개발용 Panel Mock Up(BLU 등)' },
        { code: '900103', desc: '개발용 Panel 기타부품(Pol, Sheet, 기타)' },
        { code: '900201', desc: '개발용 A/W' },
        { code: '900202', desc: '개발용 PCB' },
        { code: '900203', desc: '개발용 PBM 및 회로부품' },
        { code: '900301', desc: '개발용 TSP' },
        { code: '900302', desc: '개발용 전장부품' },
        { code: '900401', desc: '개발용 Glass' },
        { code: '900402', desc: '개발용 Frame(Sheet metal, Cover, Back, BKT)' },
        { code: '900403', desc: '개발용 기구 Mock Up(Mold 물)' },
        { code: '900404', desc: '개발용 기구 기타부품(Foam tape, Screw, 기타)' },
        { code: '900501', desc: '개발용 포장부품' },
    ];
    // 목적 표(P01~P05) — 사용자가 제공한 표 그대로.
    window._PO_PURPOSE_TABLE = [
        { code: 'P01', desc: '유상샘플' },
        { code: 'P02', desc: '무상샘플' },
        { code: 'P03', desc: 'E3 자재' },
        { code: 'P04', desc: '내부검토용' },
        { code: 'P05', desc: '기타' },
    ];

    // 첨부(PDF)는 지금은 "구매오더 요청" 용도가 유일하다 — 첨부가 있는 채로 메시지를
    // 보내면 항상 이 흐름을 탄다. 다른 첨부 용도가 추가되면 이 가정을 재검토할 것.
    window._ganttQaPendingAttachments = []; // [{name, text}]

    // 파일 선택(📎 버튼)과 드래그앤드롭 둘 다 공유하는 실제 처리 로직 — PDF만 받아
    // 텍스트를 추출해 대기 목록에 쌓는다.
    window._ganttQaProcessAttachedFiles = async function(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        if (typeof window._pcExtractPdfText !== 'function') {
            if (window.showToast) window.showToast(window._t('⚠️ PDF 읽기 기능을 아직 불러오지 못했습니다 — 잠시 후 다시 시도해주세요.', '⚠️ The PDF reader hasn\'t loaded yet — please try again in a moment.'), 'warning');
            return;
        }
        for (const file of files) {
            if (!/\.pdf$/i.test(file.name)) {
                if (window.showToast) window.showToast(window._t(`⚠️ "${file.name}"은(는) PDF가 아니라 건너뜁니다.`, `⚠️ Skipping "${file.name}" — not a PDF.`), 'warning');
                continue;
            }
            try {
                const text = await window._pcExtractPdfText(file);
                window._ganttQaPendingAttachments.push({ name: file.name, text: text || '' });
            } catch (e) {
                if (window.showToast) window.showToast(window._t(`⚠️ "${file.name}" 읽기 실패: `, `⚠️ Failed to read "${file.name}": `) + (e && e.message ? e.message : e), 'warning');
            }
        }
        window._ganttQaRenderAttachmentStrip();
    };

    window._ganttQaHandleFileSelect = async function(inputEl) {
        const files = inputEl.files;
        await window._ganttQaProcessAttachedFiles(files);
        inputEl.value = ''; // 같은 파일을 다시 골라도 change 이벤트가 발생하도록 초기화
    };

    // 📎 [2026-09-16 신규, 사용자 요청] 드래그앤드롭 — 모달 어디에 놓아도(메시지 영역/입력창
    // 등) 받도록 모달 박스 전체에 걸어둔다. 드래그 중엔 점선 테두리로 시각적 표시.
    // 🐛 [2026-09-16 실사용 버그수정] `stopPropagation()`이 빠져있어서, 드롭 이벤트가 이
    // 모달을 지나 `js/04f-core-app-upload-utils-1.js`의 **페이지 전체를 덮는 전역
    // "drop" 리스너**(엑셀 파일을 드래그하면 그걸 "프로젝트 로드"로 처리하는 기존 기능,
    // "페이지 어디에 드롭해도 엑셀 로드가 동작하도록" 의도적으로 window 레벨에 걸려있음)
    // 까지 올라가버려서, PDF를 놓아도 "프로젝트를 새로 불러오려는 것"으로 오인해 그
    // 기능의 안내 팝업("팀 비밀번호가 아직 동기화되지 않았습니다")이 뜨는 사고가 있었다 —
    // `22d`/`22e`(Panel 데이터시트/Elec Parts 드롭존)가 이미 같은 이유로 `stopPropagation()`
    // 을 쓰고 있던 것과 동일한 함정. 세 핸들러 모두에 추가해서 이 모달의 드롭존이 전역
    // 리스너로 새지 않게 막는다.
    window._ganttQaHandleDragOver = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const box = document.getElementById('gantt-qa-box');
        if (box) box.style.outline = '3px dashed #7cc494';
    };
    window._ganttQaHandleDragLeave = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const box = document.getElementById('gantt-qa-box');
        if (box) box.style.outline = 'none';
    };
    window._ganttQaHandleDrop = async function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const box = document.getElementById('gantt-qa-box');
        if (box) box.style.outline = 'none';
        const files = ev.dataTransfer && ev.dataTransfer.files;
        await window._ganttQaProcessAttachedFiles(files);
    };

    window._ganttQaRemoveAttachment = function(idx) {
        window._ganttQaPendingAttachments.splice(idx, 1);
        window._ganttQaRenderAttachmentStrip();
    };

    window._ganttQaRenderAttachmentStrip = function() {
        const strip = document.getElementById('gantt-qa-attach-strip');
        if (!strip) return;
        const list = window._ganttQaPendingAttachments || [];
        if (!list.length) { strip.style.display = 'none'; strip.innerHTML = ''; return; }
        strip.style.display = 'flex';
        strip.innerHTML = list.map(function(a, i) {
            return `<span style="display:inline-flex; align-items:center; gap:5px; background:#fff8e6; border:1px solid #ffe08a; color:#7a5210; border-radius:5px; padding:3px 8px; font-size:11px;">
                📎 ${escapeHtml(a.name)}
                <span onclick="window._ganttQaRemoveAttachment(${i})" style="cursor:pointer; font-weight:bold; color:#b03a3a;">✕</span>
            </span>`;
        }).join('');
    };

    // 여러 턴에 걸치는 "여러 턴 draft" 패턴(승인원 표지/BOM 옵션과 동일한 설계) —
    // {stage, materialsSourceNames, bizRegNo, invoiceDate, vendorName, items:[{desc,qty,unitPrice,tempCode}],
    //  projectCode, buyerEmpId, reason, purpose, excelPath, receiver}
    window._ganttQaPoDraft = null;

    window._ganttQaPoOptionsTableText = function() {
        const tempLines = window._PO_TEMP_CODE_TABLE.map(function(r) { return `${r.code} ${r.desc}`; }).join('\n');
        const purposeLines = window._PO_PURPOSE_TABLE.map(function(r) { return `${r.code} ${r.desc}`; }).join('\n');
        return { tempLines, purposeLines };
    };

    // 🔽 [2026-09-16 신규, 사용자 요청] AI 문답이 정해진 목록(객관식) 중에서 고르게 하는 질문은
    // 자유 텍스트 입력 대신 드롭다운으로 물어본다 — 표를 채팅에 길게 나열하고 코드/문구를
    // 정확히 타이핑해야 했던 기존 방식은 오타·형식 실수(예: "P1"을 "P01"로 인식 못함) 위험이
    // 있었다. "구매오더 요청"의 목적(P01~P05)/임시코드(900101~900501) 선택부터 적용 —
    // 앞으로 새 객관식 질문을 추가할 때도 이 헬퍼를 재사용할 것(CLAUDE.md "🔽 AI 문답
    // 객관식 질문" 절 참고). **선택값을 처리하는 새 로직을 따로 만들지 않는다** — 드롭다운은
    // 순전히 입력 방식만 바꾸는 것이고, 선택하면 사람이 타이핑했을 법한 문자열을 합성해
    // 입력창에 넣고 기존 sendGanttQaMessage()를 그대로 호출한다 — 그러면 그 문자열을 해석
    // 하는 기존 단계별 파서(코드 정규화/유효성 검사 등)가 아무 수정 없이 그대로 처리한다.
    window._ganttQaPendingChoiceDropdown = null; // {id, multi, options:[{value,label}], items?:[{label}], buildAnswerText(selections)}

    window._ganttQaRenderChoiceDropdownHtml = function(draft) {
        const _en = window._currentLang === 'en';
        const opts = (draft.options || []).map(function(o) { return `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`; }).join('');
        if (draft.multi) {
            // 💡 [2026-09-16 확장, 사용자 요청] 항목마다 선택지가 다른 경우(예: BOM 옵션 —
            // "전개 방식"은 단일/다중, "Show price"는 예/아니오로 서로 다름)를 지원하기 위해
            // 각 항목이 자기만의 options를 가질 수 있게 함 — 없으면 기존처럼 draft.options를
            // 공유한다(PO 임시코드 선택처럼 모든 항목이 같은 표를 쓰는 기존 용도는 그대로 동작).
            const rows = draft.items.map(function(it, i) {
                const rowOpts = (it.options ? it.options.map(function(o) { return `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`; }).join('') : opts);
                return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
                    <span style="font-size:11.5px; color:#555; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
                    <select id="qa-choice-${draft.id}-${i}" style="font-size:11.5px; padding:3px 6px; border:1px solid #ccc; border-radius:5px; max-width:55%;">
                        <option value="">${_en ? '(choose)' : '(선택)'}</option>
                        ${rowOpts}
                    </select>
                </div>`;
            }).join('');
            return `<div style="margin-top:6px; padding:8px; background:#fff; border:1px solid #dee2e6; border-radius:6px;">
                ${rows}
                <div style="display:flex; justify-content:flex-end; margin-top:4px;">
                    <button onclick="window._ganttQaSubmitChoiceDropdown('${draft.id}')" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer;">${_en ? '✅ Confirm' : '✅ 선택 완료'}</button>
                </div>
            </div>`;
        }
        return `<div style="margin-top:6px;">
            <select id="qa-choice-${draft.id}-0" onchange="window._ganttQaSubmitChoiceDropdown('${draft.id}')" style="font-size:11.5px; padding:5px 8px; border:1px solid #ccc; border-radius:6px; width:100%;">
                <option value="">${_en ? '(choose one)' : '(선택해주세요)'}</option>
                ${opts}
            </select>
        </div>`;
    };

    window._ganttQaSubmitChoiceDropdown = function(id) {
        const draft = window._ganttQaPendingChoiceDropdown;
        if (!draft || draft.id !== id) return;
        const count = draft.multi ? draft.items.length : 1;
        const selections = [];
        for (let i = 0; i < count; i++) {
            const sel = document.getElementById(`qa-choice-${id}-${i}`);
            selections.push(sel ? sel.value : '');
        }
        if (selections.every(function(v) { return !v; })) return; // 아무 것도 안 고르면 무시
        const answerText = draft.buildAnswerText(selections);
        if (!answerText) return;
        window._ganttQaPendingChoiceDropdown = null;
        const input = document.getElementById('gantt-qa-input');
        if (!input) return;
        input.value = answerText;
        window.sendGanttQaMessage();
    };

    // ✅ [2026-09-16 신규, 사용자 요청] "확인/저장해줘/보내줘/취소"처럼 정해진 표가 아니라 그때
    // 그때 다른 짧은 확인성 답변(1~3개)을 기대하는 질문은 드롭다운(위 선택지 헬퍼, 표가 있는
    // 객관식용)이 아니라 **메일/공지/알람 초안이 이미 쓰고 있던 "이대로 보내기/취소" 버튼과
    // 완전히 같은 스타일**의 클릭 버튼으로 답할 수 있게 한다 — 사용자가 "확인, 저장해줘,
    // 보내줘, 기타... 클릭해서 대답하는 방식으로 해달라"고 요청, PO 품목 확인 단계("확인"
    // 이라고 답해주세요)를 구체적 예시로 듦. 메일 초안 등은 이미 이 버튼 패턴이 있었지만
    // SAP/구매오더 쪽의 "짧은 문구로 답해달라"는 질문들엔 아직 없었다(CLAUDE.md "⚡ AI 문답
    // 확인성 질문" 절 참고). **선택값을 처리하는 새 로직을 따로 만들지 않는다** — 버튼을
    // 누르면 그 버튼의 문구를 그대로 입력창에 채우고 기존 sendGanttQaMessage()를 호출할
    // 뿐이라, 타이핑으로 같은 문구를 직접 쳐서 보내는 것과 100% 동일하게 처리된다(기존
    // 단계별 파서/AI 판단 로직 무수정). 자유 텍스트 입력은 버튼과 무관하게 항상 그대로
    // 가능(정정 등 표에 없는 답이 필요한 경우를 위해).
    window._ganttQaPendingConfirmButtons = null; // {id, buttons:[{label, value, style:'confirm'|'cancel'|'neutral'}]}

    window._ganttQaRenderConfirmButtonsHtml = function(draft) {
        const btns = draft.buttons.map(function(b) {
            const isConfirm = b.style === 'confirm';
            const isCancel = b.style === 'cancel';
            const bg = isConfirm ? '#e6f6ea' : (isCancel ? '#f8f9fa' : '#e7f3ff');
            const border = isConfirm ? '#a8dab8' : (isCancel ? '#ccc' : '#a5c8f0');
            const color = isConfirm ? '#1f7a3d' : (isCancel ? '#555' : '#1971c2');
            const hoverBg = isConfirm ? '#c9ecd3' : (isCancel ? '#e9ecef' : '#d3e8fd');
            const hoverBorder = isConfirm ? '#7cc494' : (isCancel ? '#ccc' : '#7cb3ea');
            return `<button onclick="window._ganttQaSubmitConfirmButton('${draft.id}', '${escapeHtml(b.value).replace(/'/g, "\\'")}')" onmouseover="this.style.background='${hoverBg}'; this.style.borderColor='${hoverBorder}';" onmouseout="this.style.background='${bg}'; this.style.borderColor='${border}';" style="font-size:11.5px; padding:5px 12px; border:1px solid ${border}; background:${bg}; color:${color}; border-radius:6px; font-weight:${isConfirm ? 'bold' : 'normal'}; cursor:pointer; transition:background .15s, border-color .15s;">${escapeHtml(b.label)}</button>`;
        }).join('');
        return `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px; flex-wrap:wrap;">${btns}</div>`;
    };

    window._ganttQaSubmitConfirmButton = function(id, value) {
        const draft = window._ganttQaPendingConfirmButtons;
        if (!draft || draft.id !== id) return;
        window._ganttQaPendingConfirmButtons = null;
        const input = document.getElementById('gantt-qa-input');
        if (!input) return;
        input.value = value;
        window.sendGanttQaMessage();
    };

    // 호출부 공용 헬퍼 — text와 buttons를 넘기면 draft 등록 + choiceDropdown과 동일한 패턴으로
    // 히스토리에 confirmButtonsId를 실어 푸시까지 한 번에 처리(호출부가 매번 id를 직접 만들
    // 필요 없게).
    window._ganttQaShowConfirmButtons = function(text, buttons) {
        const id = 'qa-confirm-' + Date.now();
        window._ganttQaPendingConfirmButtons = { id: id, buttons: buttons };
        window._ganttQaHistory.push({ role: 'ai', confirmButtonsId: id, text: text });
    };

    // 📋 [2026-09-16 신규, 사용자 요청] "이전 내용(복사 붙여넣기) 이어서" — PDF를 다시 첨부하지
    // 않고, 이전 AI 답변(예: 품목 확인 요약)이나 원본 문서 텍스트를 그대로 복사해 붙여넣기만
    // 해도 구매오더 추출을 이어갈 수 있게 한다. 이미 PO draft가 진행 중이거나(그 흐름이
    // 우선) 파일이 첨부돼 있으면(첨부가 항상 우선 — 위 "새 첨부 우선" 규칙과 동일한 이유)
    // 이 경로는 관여하지 않는다 — 순수하게 "아무 draft도 없는 상태에서 PO스러운 텍스트를
    // 붙여넣었을 때" 새 추출을 시작하는 진입점 하나만 추가하는 것. 짧은 일반 질문까지 오인하지
    // 않도록 최소 길이(40자)와 PO 문서 특유의 키워드+숫자 동시 존재를 요구함.
    window._ganttQaExtractPastedPoContext = function(text) {
        if (!text) return false;
        const trimmed = text.trim();
        if (trimmed.length < 40) return false;
        if (window._ganttQaPoDraft) return false;
        if (window._ganttQaPendingAttachments && window._ganttQaPendingAttachments.length) return false;
        // 🐛🐛 [2026-09-17 실사용 버그수정] "133025,133026 자재내역 확인해줘"로 받은 품목 내역
        // 조회 결과(📦 자재번호 / 품목: .../ 품목2: ...)를 사용자가 그대로 복사해서 다른 질문에
        // 붙여넣었더니("앞에서 확인한 품번\n📦 133025\n품목: ...") 이 함수가 그걸 세금계산서/
        // 거래명세서로 오인해 조용히 구매오더(PO) draft를 시작해버린 사고 — 원인은 마커 정규식에
        // 있던 "품목" 단어가 너무 느슨했다는 것: 실제 세금계산서/거래명세서뿐 아니라 이 앱 자신의
        // "품목 내역 조회" 기능이 매번 쓰는 "품목:"/"품목2:" 라벨과도 겹쳐서, 이 앱이 방금 자기가
        // 출력한 답을 사용자가 그대로 복사해 붙여넣기만 해도 오발동했다("붙여넣기 이어하기"는
        // 원래 PO 흐름 전용 기능인데 무관한 기능의 출력까지 삼켜버린 것). **수정**: ① 마커에서
        // "품목" 단독 단어를 빼고 실제 세금계산서류 문서에서만 나오는 더 구체적인 단어들만 남김
        // (사업자등록번호는 거의 모든 한국 세금계산서/거래명세서에 있으므로 이것만으로도 커버율은
        // 충분함). ② 방어를 한 겹 더 — 이 앱이 자기 응답에 "📦"로 시작하는 형식을 쓰는 곳은
        // 품목 내역 조회 기능이 유일하므로, 붙여넣은 텍스트가 "📦"로 시작하면(=이 앱 자신의
        // 출력을 그대로 되붙여넣은 경우) 다른 마커와 무관하게 무조건 PO 붙여넣기로 보지 않는다.
        if (/^📦/.test(trimmed)) return false;
        const markerRe = /(사업자등록번호|공급자|공급받는자|세금계산서|거래명세서|견적서|Invoice|Vendor)/i;
        if (!markerRe.test(trimmed)) return false;
        return /\d{2,}/.test(trimmed);
    };

    // PDF 텍스트(들)에서 품목 정보를 AI로 추출 — 다중 항목 전부 추출, 임시코드는 AI가 표를
    // 보고 가장 가까운 것을 제안(애매하면 사람이 확인). correctionNote가 있으면 이전 추출
    // 결과에 대한 사람의 정정 지시를 같이 실어 재추출한다(별도 파싱 로직 없이 AI에게 다시
    // 맡기는 방식 — 승인원 표지의 "재질문" 패턴과 달리 여기선 자유서술 정정이 더 유용해서
    // AI 재호출로 단순화).
    // 🐛 [2026-09-15 버그수정] 거래명세서(전자세금계산서보다 컬럼이 많은 표 — 날짜/품목/규격/
    // 수량/단가/공급가액/세액/합계)를 첨부했을 때 두 가지 위험을 실사용으로 확인해서 프롬프트에
    // 명시적 지시를 추가함: ① 공급자(우리에게 파는 쪽)와 공급받는자(우리 회사 자신, 항상
    // "주식회사 코텍"류)의 사업자등록번호가 문서에 나란히 나와서, AI가 잘못하면 우리 회사
    // 번호를 뽑아버릴 위험 — 반드시 "공급자" 쪽 번호를 쓰라고 명시. ② "단가"(품목 1개당
    // 가격)와 "공급가액"(단가×수량, 그 줄의 합계)이 따로 있는 문서에서 공급가액을 단가로
    // 착각하면 SAP에 수량만큼 부풀려진 단가가 들어갈 뻔한 위험 — 반드시 "단가"(1개당 가격)를
    // 쓰라고 명시하고, 검산 힌트(단가×수량≈공급가액)를 덧붙여 self-check를 유도함.
    window._ganttQaExtractPoItemsViaAi = async function(apiKey, attachments, correctionNote) {
        const { tempLines, purposeLines } = window._ganttQaPoOptionsTableText();
        const attachText = attachments.map(function(a) { return `[첨부파일: ${a.name}]\n${a.text}`; }).join('\n\n---\n\n');
        const correctionBlock = correctionNote ? `\n\n[사람의 정정 지시 — 이전 추출 결과 대신 이 지시를 반영해서 다시 추출할 것]\n${correctionNote}` : '';
        const prompt = `다음은 전자세금계산서/거래명세서/견적서 등 PDF에서 추출한 원문 텍스트입니다. 아래 정보를 JSON 객체 하나로만 정확히 응답하세요(설명 문구·코드블록 표시 없이 JSON만):
{
  "bizRegNo": "공급자 사업자등록번호(숫자만, 하이픈 제거)",
  "invoiceDate": "작성일자(YYYYMMDD 8자리 숫자)",
  "vendorName": "공급자(협력사) 상호",
  "currency": "통화 코드 — KRW 또는 USD(다른 통화 기호/코드가 명확히 보이면 그 코드, 불명확하면 KRW)",
  "items": [
    {"desc": "품목명(원문 그대로)", "qty": 숫자, "unitPrice": 숫자(통화 단위 그대로, 콤마 제거), "tempCode": "아래 임시코드 표에서 이 품목과 가장 가까운 코드 하나"}
  ],
  "note": "페이지를 일부만 사용했거나 애매해서 넘어간 부분이 있으면 한 문장으로, 없으면 빈 문자열"
}
⚠️ 중요 — 반드시 지킬 것:
1. 문서에 회사 정보가 두 개(우리 회사와 상대 회사) 나란히 있으면, bizRegNo/vendorName은
   반드시 우리 회사가 아닌 **상대 회사(물건을 파는 쪽, 공급자)** 정보로만 채우세요.
   ⚠️⚠️ **가장 확실한 판별 방법**: 우리 회사는 거의 항상 "(주)코텍"/"주식회사 코텍"이고
   사업자등록번호는 "130-81-44628"입니다 — 이 이름이나 번호가 보이면 그건 100% 우리 회사
   (공급받는자)이니 bizRegNo/vendorName에 **절대 이 정보를 쓰지 말고, 문서에 있는 다른 쪽
   회사** 정보를 쓰세요. "공급자"/"공급받는자" 라벨 텍스트는 PDF 추출 과정에서 글자가
   깨지거나 뒤섞여 나올 수 있어 라벨 자체보다 "130-81-44628"/"코텍" 여부로 판단하는 게
   더 안전합니다.
2. "단가"(품목 1개당 가격)와 "공급가액"/"합계"(단가에 수량을 곱한 그 줄의 합계 금액)가
   문서에 따로 있으면, unitPrice에는 반드시 "단가"(1개당 가격)만 넣으세요 — "공급가액"이나
   "합계"를 넣으면 안 됩니다. 헷갈리면 unitPrice × qty 가 그 줄의 "공급가액"과 거의 같아야
   한다는 걸로 검산해서 맞는 값을 고르세요(수량이 1이면 단가와 공급가액이 같으므로 문제
   없음).
3. tempCode는 품목명에 임시코드 표의 분류를 짐작할 수 있는 명확한 단서(예: "Panel"/
   "LCM"/"PCB"/"TSP"/"Glass"/"Frame"/"포장" 등)가 있을 때만 채우세요. 품번(part number)만
   있거나 "CABLE ASSY" 같은 일반 부품명이라 표의 13개 분류 중 어디에 해당하는지 확신할
   수 없으면 **절대 추측해서 채우지 말고 빈 문자열("")로 남겨두세요** — 사람이 직접
   확인해야 합니다.
4. 문서에 페이지/표가 여러 개일 수 있습니다. **가장 분명하고 구조화된 품목 표 하나(보통
   첫 페이지)만 기준으로 추출하세요.** 다른 페이지가 같은 품목을 다른 표 형식으로 반복한
   것이면 그냥 무시하세요(중복으로 두 번 세지 말 것). 다른 페이지가 서로 관련 없는 별개
   정보(예: 첫 페이지는 거래명세서, 둘째 페이지는 전혀 다른 문서)라도 마찬가지로 첫
   페이지만 기준으로 삼고, 어떤 페이지를 기준으로 썼는지/어떤 페이지를 건너뛰었는지를
   note 필드에 한 문장으로 적으세요. 절대 여러 페이지의 서로 다른 내용을 억지로 합치거나
   짜맞추지 마세요.
5. 문서 대부분은 KRW(원)이지만, "USD"/"US$"/"$" 같은 표시가 명확히 있으면 그 통화로
   판단하세요(단가/합계 옆에 붙은 통화 기호·코드를 확인). 통화 표시가 전혀 없거나
   애매하면 기본값인 "KRW"로 두세요 — 추측해서 USD로 단정하지 마세요.
품목이 여러 개면 items 배열에 전부 넣으세요(하나도 빠뜨리지 말 것) — 단, 위 4번처럼 기준으로
삼은 페이지/표 안의 품목만 넣으면 됩니다.

[임시코드 표]
${tempLines}
${correctionBlock}

[PDF 원문]
${attachText}`;
        const result = await window.callAiBackend(apiKey, prompt, {});
        if (!result.ok) throw result.error || new Error('AI 추출 실패');
        const text = window._extractGanttQaAiText(result);
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error(window._t('AI 응답에서 JSON을 찾지 못했습니다.', 'Could not find JSON in the AI response.'));
        let parsed;
        try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error(window._t('AI 응답 JSON 파싱에 실패했습니다: ', 'Failed to parse the AI response JSON: ') + e.message); }
        if (!parsed.items || !parsed.items.length) throw new Error(window._t('PDF에서 품목을 추출하지 못했습니다.', 'Could not extract any line items from the PDF.'));

        // 💡 [2026-09-16 신규] 통화 코드 정규화 — AI가 "원"/"₩"/소문자 등으로 답하거나
        // 아예 빠뜨릴 수 있어, KRW/USD 두 가지로만 정리하고 그 외/누락은 KRW로 기본값 처리.
        const rawCurrency = (parsed.currency || '').toString().trim().toUpperCase();
        parsed.currency = (rawCurrency === 'USD' || rawCurrency === 'US$' || rawCurrency === '$') ? 'USD' : 'KRW';

        // 🐛🐛 [2026-09-16 실사용 버그수정] 프롬프트의 "코텍이면 절대 협력사로 쓰지 말 것"
        // 지시를 AI가 실제로 무시하고 우리 회사(코텍) 번호를 그대로 협력사로 뽑는 사고가
        // 실사용에서 확인됨(세로쓰기 라벨이 깨져서 AI가 어느 쪽이 "공급자"인지 헷갈린 것으로
        // 추정) — 프롬프트 지시만으로는 못 믿으므로, 코드 레벨에서 한 번 더 검증한다.
        // bizRegNo가 코텍 자기 번호(1308144628)와 같으면, 첨부 원문에서 정규식으로 다른
        // 사업자등록번호(NNN-NN-NNNNN 패턴)를 직접 찾아 대체한다 — 라벨 텍스트는 세로쓰기로
        // 깨져도 번호 자체(숫자+하이픈)는 보통 가로쓰기라 훼손되지 않고 그대로 남아있어
        // 이 방식이 AI의 판단보다 신뢰도가 높다.
        const KORTEK_BIZ_NO = '1308144628'; // (주)코텍 자기 회사 사업자등록번호(130-81-44628) — 절대 협력사로 쓰면 안 됨
        const normalizedBizNo = (parsed.bizRegNo || '').replace(/\D/g, '');
        if (normalizedBizNo === KORTEK_BIZ_NO) {
            const combinedText = attachments.map(function(a) { return a.text || ''; }).join('\n');
            const allBizNos = (combinedText.match(/\d{3}-?\d{2}-?\d{5}/g) || [])
                .map(function(s) { return s.replace(/-/g, ''); })
                .filter(function(n) { return n.length === 10 && n !== KORTEK_BIZ_NO; });
            const candidate = allBizNos[0];
            const warnNote = candidate
                ? window._t(`⚠️ AI가 처음엔 우리 회사(코텍) 사업자등록번호를 협력사로 잘못 추출해서, 문서에서 찾은 다른 사업자등록번호(${candidate})로 자동 정정했습니다 — 협력사명도 다시 확인해주세요.`, `⚠️ The AI initially extracted our own (KORTEK's) business registration number as the vendor — auto-corrected to another number found in the document (${candidate}). Please double-check the vendor name too.`)
                : window._t('⚠️ 공급자 사업자등록번호를 우리 회사(코텍) 번호로 잘못 추출한 것 같은데, 문서에서 다른 번호를 찾지 못했습니다 — 직접 확인해서 알려주세요.', "⚠️ The extracted supplier's business registration number looks like our own (KORTEK's), but no other number was found in the document — please verify and provide the correct one.");
            if (candidate) {
                parsed.bizRegNo = candidate;
                if (parsed.vendorName && parsed.vendorName.indexOf('코텍') !== -1) parsed.vendorName = ''; // 확실치 않으니 비워서 사람이 채우게
            } else {
                parsed.bizRegNo = '';
                parsed.vendorName = '';
            }
            parsed.note = parsed.note ? `${parsed.note} ${warnNote}` : warnNote;
        }
        return parsed;
    };

    // 💡 [2026-09-17 신규, 사용자 요청] 세금계산서/거래명세서 "복수 처리" 지원 — opts.noInstructions
    // 를 추가해 배치 요약(_ganttQaPoBatchSummaryText)이 문서마다 이 함수를 재사용하면서 "확인/정정"
    // 안내 문구는 배치 전체에서 딱 한 번만 붙이게 한다(기본값 false — 기존 단일 문서 호출부는
    // 이 인자를 안 넘기므로 100% 하위호환).
    window._ganttQaPoSummaryText = function(draft, opts) {
        const _en = window._currentLang === 'en';
        const noInstructions = !!(opts && opts.noInstructions);
        const itemLines = draft.items.map(function(it, i) {
            const codeInfo = window._PO_TEMP_CODE_TABLE.find(function(r) { return r.code === it.tempCode; });
            // 🐛 [2026-09-15 버그수정] `it.tempCode || _en ? A : B` 는 연산자 우선순위 때문에
            // `(it.tempCode || _en) ? A : B`로 해석되어, _en이 true면 tempCode가 있어도
            // 항상 "(unmatched)"가 나오는 등 의도와 다르게 동작하던 버그 — 괄호로 명확히 고침.
            const codeLabel = codeInfo ? `${it.tempCode}(${codeInfo.desc})` : (_en ? '(unmatched)' : '(매칭 안 됨)');
            return `${i + 1}. ${it.desc} | ${_en ? 'qty' : '수량'}:${it.qty} | ${_en ? 'unit price' : '단가'}:${(it.unitPrice || 0).toLocaleString()} ${draft.currency || 'KRW'} | ${_en ? 'temp code' : '임시코드'}:${codeLabel}`;
        }).join('\n');
        // 💡 [2026-09-15 신규] 여러 페이지/표 중 일부만 기준으로 썼거나 건너뛴 부분이 있으면
        // AI가 남긴 note를 같이 보여준다("2페이지는 서로 다른 정보면 1페이지만 분석하고
        // 안내해달라"는 사용자 요청 반영).
        const noteLine = draft.note ? `\n\nℹ️ ${draft.note}` : '';
        // 💡 [2026-09-16 신규] 통화가 KRW가 아니면(USD 등) 확인 화면에서 눈에 띄게 별도로
        // 표시 — 품목별 단가 옆에도 이미 붙지만, "이 문서는 통화가 다르다"는 걸 놓치기 쉬워
        // 한 번 더 요약 상단에 강조한다.
        const currencyLine = (draft.currency && draft.currency !== 'KRW')
            ? window._t(`\n⚠️ 통화: ${draft.currency} (KRW가 아닙니다 — 맞는지 확인해주세요)`, `\n⚠️ Currency: ${draft.currency} (not KRW — please confirm this is correct)`)
            : '';
        const header = window._t(
            `📄 PDF에서 추출한 내용입니다 — 확인해주세요:\n\n사업자등록번호: ${draft.bizRegNo || '(미확인)'}\n공급자: ${draft.vendorName || '(미확인)'}\n작성일자: ${draft.invoiceDate || '(미확인)'}${currencyLine}\n\n[품목 ${draft.items.length}건]\n${itemLines}${noteLine}`,
            `📄 Extracted from the PDF — please review:\n\nBiz. reg. no.: ${draft.bizRegNo || '(not found)'}\nVendor: ${draft.vendorName || '(not found)'}\nInvoice date: ${draft.invoiceDate || '(not found)'}${currencyLine}\n\n[${draft.items.length} item(s)]\n${itemLines}${noteLine}`
        );
        if (noInstructions) return header;
        return header + window._t(
            '\n\n내용이 맞으면 "확인"이라고 답해주세요. 틀린 부분이 있으면 어떻게 고쳐야 하는지 말씀해주세요(예: "2번 임시코드는 900201로 변경", "통화는 USD로 변경").',
            '\n\nReply "confirm" if this looks right, or tell me what to fix (e.g. "item 2\'s temp code should be 900201", "currency should be USD").'
        );
    };

    // 🆕 [2026-09-17 신규, 사용자 요청] 여러 건의 세금계산서/거래명세서를 "한 번에" 처리 —
    // 첨부된 파일마다 별도 문서(공급자/품목이 서로 다를 수 있음)로 보고 각각 추출한다.
    // 파일이 1개면 문서도 1개라 기존 단일 문서 동작과 100% 동일 — 아래 함수들은 전부
    // "문서가 여러 건일 수 있다"는 것만 다르고, 그 외 설계 원칙(드롭다운/버튼은 입력 방식만
    // 바꾸고 처리 로직은 자유서술 AI 재추출 경로를 그대로 재사용)은 기존 PO 흐름과 동일하다.
    window._ganttQaExtractPoDocumentsViaAi = async function(apiKey, attachments) {
        const settled = await Promise.allSettled(attachments.map(function(a) {
            return window._ganttQaExtractPoItemsViaAi(apiKey, [a], null);
        }));
        const docs = [];
        const errors = [];
        settled.forEach(function(r, i) {
            if (r.status === 'fulfilled') docs.push(r.value);
            else errors.push(attachments[i].name + ': ' + ((r.reason && r.reason.message) ? r.reason.message : r.reason));
        });
        if (!docs.length) throw new Error(errors.join('; ') || window._t('품목 추출에 실패했습니다.', 'Failed to extract line items.'));
        return { docs: docs, errors: errors };
    };

    // 자유서술 정정 지시를 배치 전체(여러 문서)에 대해 한 번에 반영 — 기존 단일 문서
    // correctionNote 재추출과 같은 설계(별도 파서 없이 AI에게 이전 결과 + 지시를 다시 맡김)를
    // 문서 배열 단위로 확장한 것. "문서 N"이라는 표현을 1부터 시작하는 인덱스로 해석하도록
    // 프롬프트에 명시해 임시코드 드롭다운의 배치 합성 문구("문서 2의 1번 품목은 ...")와
    // 어휘를 맞췄다.
    window._ganttQaExtractPoDocumentsCorrectionViaAi = async function(apiKey, docs, correctionNote) {
        const { tempLines } = window._ganttQaPoOptionsTableText();
        const docsJson = JSON.stringify(docs.map(function(d) {
            return { bizRegNo: d.bizRegNo, invoiceDate: d.invoiceDate, vendorName: d.vendorName, currency: d.currency, items: d.items };
        }), null, 2);
        const prompt = `아래는 여러 건의 구매요청 문서에서 이미 추출된 결과(JSON 배열)입니다. 사람이 정정 지시를 줬습니다 — 그 지시를 반영해서 같은 구조의 JSON을 다시 만들어 응답하세요(설명 문구·코드블록 표시 없이 JSON만):
{"documents": [ {"bizRegNo":"공급자 사업자등록번호(숫자만)", "invoiceDate":"YYYYMMDD", "vendorName":"공급자 상호", "currency":"KRW 또는 USD", "items":[{"desc":"품목명","qty":숫자,"unitPrice":숫자,"tempCode":"임시코드 또는 빈 문자열"}]} ]}
⚠️ 문서 개수와 순서는 지시에서 명시적으로 추가/삭제/병합하라고 하지 않는 한 그대로 유지하세요. 지시에 나오는 "문서 N"/"N번 문서"는 1부터 시작하는 인덱스이니, 그 문서의 items 배열만 고치고 나머지 문서는 그대로 두세요.

[임시코드 표]
${tempLines}

[정정 지시]
${correctionNote}

[기존 추출 결과 — 문서 배열]
${docsJson}`;
        const result = await window.callAiBackend(apiKey, prompt, {});
        if (!result.ok) throw result.error || new Error(window._t('AI 재추출 실패', 'AI re-extraction failed'));
        const text = window._extractGanttQaAiText(result);
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error(window._t('AI 응답에서 JSON을 찾지 못했습니다.', 'Could not find JSON in the AI response.'));
        let parsed;
        try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error(window._t('AI 응답 JSON 파싱에 실패했습니다: ', 'Failed to parse the AI response JSON: ') + e.message); }
        if (!parsed.documents || !parsed.documents.length) throw new Error(window._t('정정 결과에서 문서를 찾지 못했습니다.', 'No documents found in the correction result.'));
        parsed.documents.forEach(function(d) {
            const rawCurrency = (d.currency || '').toString().trim().toUpperCase();
            d.currency = (rawCurrency === 'USD' || rawCurrency === 'US$' || rawCurrency === '$') ? 'USD' : 'KRW';
        });
        return parsed.documents;
    };

    window._ganttQaPoBatchSummaryText = function(docs) {
        const multi = docs.length > 1;
        const body = docs.map(function(doc, i) {
            const docHeader = multi ? window._t(`\n━━━ 문서 ${i + 1}/${docs.length} ━━━\n`, `\n━━━ Document ${i + 1}/${docs.length} ━━━\n`) : '';
            return docHeader + window._ganttQaPoSummaryText(doc, { noInstructions: true });
        }).join('');
        const instructions = window._t(
            '\n\n내용이 모두 맞으면 "확인"이라고 답해주세요. 틀린 부분이 있으면 어떻게 고쳐야 하는지 말씀해주세요(예: "문서 2의 1번 임시코드는 900201로 변경").',
            '\n\nReply "confirm" if everything looks right, or tell me what to fix (e.g. "document 2 item 1\'s temp code should be 900201").'
        );
        return body + instructions;
    };

    window._ganttQaPoFindMissingBizNoDocs = function(docs) {
        return docs.map(function(d, i) { return { idx: i, doc: d }; })
            .filter(function(x) { return !x.doc.bizRegNo || !/^\d{10}$/.test(x.doc.bizRegNo); });
    };

    window._ganttQaPoFindMissingTempCodeItems = function(docs) {
        const out = [];
        docs.forEach(function(doc, di) {
            doc.items.forEach(function(it, ii) {
                if (!it.tempCode || !window._PO_TEMP_CODE_TABLE.some(function(r) { return r.code === it.tempCode; })) {
                    out.push({ docIdx: di, itemIdx: ii, it: it });
                }
            });
        });
        return out;
    };

    // 문서·품목 인덱스가 섞인 배치용 임시코드 드롭다운 — 기존 단일 문서 드롭다운과 동일한
    // "선택 → buildAnswerText가 사람이 타이핑했을 법한 문장을 합성 → 기존 자유서술 정정
    // 경로(_ganttQaExtractPoDocumentsCorrectionViaAi)로 그대로 흘려보냄" 패턴을 그대로 쓴다.
    window._ganttQaPoShowTempCodeDropdown = function(missing) {
        const tempDropdownId = 'po-tempcode-batch-' + Date.now();
        const tempCodeOptions = window._PO_TEMP_CODE_TABLE.map(function(r) { return { value: r.code, label: `${r.code} ${r.desc}` }; });
        const applyAllItem = {
            label: window._t('🔁 전체 문서·품목에 동일 코드 적용', '🔁 Apply the same code to ALL items in ALL documents'),
            options: tempCodeOptions
        };
        const perItemItems = missing.map(function(x) {
            return { label: `${x.docIdx + 1}-${x.itemIdx + 1}. ${x.it.desc}` };
        });
        window._ganttQaPendingChoiceDropdown = {
            id: tempDropdownId, multi: true,
            items: missing.length >= 2 ? [applyAllItem].concat(perItemItems) : perItemItems,
            options: tempCodeOptions,
            buildAnswerText: function(selections) {
                if (missing.length >= 2 && selections[0]) {
                    return window._t(`임시코드는 모든 문서의 모든 품목에 ${selections[0]}로 적용해줘`, `Apply temp code ${selections[0]} to every item in every document`);
                }
                const itemSelections = missing.length >= 2 ? selections.slice(1) : selections;
                const parts = [];
                itemSelections.forEach(function(code, idx) {
                    if (code) parts.push(window._t(`문서 ${missing[idx].docIdx + 1}의 ${missing[idx].itemIdx + 1}번 품목은 ${code}`, `document ${missing[idx].docIdx + 1} item ${missing[idx].itemIdx + 1} should be ${code}`));
                });
                return parts.join(', ');
            }
        };
        window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: tempDropdownId, text: window._t(
            '⚠️ 아래 품목은 임시코드를 자동으로 판단하기 어려웠습니다 — 아래에서 직접 선택해주세요:',
            "⚠️ Couldn't confidently determine the temp code for these item(s) — please choose below:"
        )});
    };

    // 🔽 [2026-09-18 설계 변경, 사용자 요청] 프로젝트코드/요청사유/목적 3항목은 "복수 발주서면
    // 문서마다 다를 것"을 기본으로 가정해 문서(doc)별로 따로 받고, 실제로 값이 같은 드문
    // 경우를 위해 "전체 동일: ..." 한 줄 답변 지름길만 남긴다. **사번(구매담당자)만은
    // 예외** — 사용자가 "사번은 작성자가 같은 경우가 많다"고 정정해줘서, 문서 개수와
    // 무관하게 항상 배치 전체 공통(`pd.buyerEmpId`)으로 딱 한 번만 물어본다(아래
    // `ask_buyer` 단계, `_ganttQaPoAdvanceAfterItemsConfirmed`가 `ask_fields`보다 먼저
    // 체크). 그래서 이 함수(`_ganttQaParsePoFieldsInto`)와 `_ganttQaPoDocIsIncomplete`는
    // 이제 사번을 전혀 다루지 않는다 — 문서가 1건뿐이면 나머지 3항목도 굳이 번호를 붙일
    // 필요가 없으므로 예전과 100% 동일하게 동작한다(아래 isMulti 분기 참고).
    //
    // 목적(P01~P05)은 고정 5개 선택지라 위 "🔽 AI 문답 객관식 질문 — 드롭다운" 원칙(정해진
    // 목록은 항상 드롭다운)을 그대로 적용 — 문서가 여러 건이면 PO 임시코드 배치 드롭다운
    // (`_ganttQaPoShowTempCodeDropdown`)과 완전히 동일한 패턴(마스터 "전체 동일 적용" 행 +
    // 문서별 행)을 재사용한다. **선택값을 처리하는 새 로직은 만들지 않는다** —
    // buildAnswerText가 "N번: 목적 P0X" 또는 "전체 동일: 목적 P0X" 문자열을 그대로 합성해
    // 입력창에 넣고 sendGanttQaMessage()를 호출하면, 아래 _ganttQaParsePoFieldsInto/
    // ask_fields 파서가 그대로 처리한다.
    window._ganttQaParsePoFieldsInto = function(doc, replyText) {
        const missingBefore = ['projectCode', 'reason', 'purpose'].filter(function(k) { return !doc[k]; });
        const projMatch = replyText.match(/프로젝트\s*코드(?:는|은|가|이)?\s*[:：]?\s*([^\s,]+)/);
        if (projMatch) doc.projectCode = projMatch[1];
        const reasonMatch = replyText.match(/요청\s*사유(?:는|은|가|이)?\s*[:：]?\s*([\s\S]+?)(?=,|목적|프로젝트\s*코드|$)/);
        if (reasonMatch && reasonMatch[1].trim()) doc.reason = reasonMatch[1].trim();
        let purposeCode = (replyText.match(/\bP0[1-5]\b/i) || [])[0];
        if (purposeCode) purposeCode = purposeCode.toUpperCase();
        const mentionsPurposeLabel = /목적/.test(replyText);
        if (!purposeCode && mentionsPurposeLabel) {
            const purposeLabelMatch = replyText.match(/목적(?:은|는|가|이)?\s*[:：]?\s*([\s\S]+?)(?=,|프로젝트\s*코드|$)/);
            if (purposeLabelMatch) {
                const hit = window._PO_PURPOSE_TABLE.find(function(r) { return purposeLabelMatch[1].indexOf(r.desc) !== -1; });
                if (hit) purposeCode = hit.code;
            }
        }
        if (purposeCode) doc.purpose = purposeCode;

        const usedLabel = !!(projMatch || reasonMatch || mentionsPurposeLabel);
        if (!usedLabel) {
            const order = ['projectCode', 'reason', 'purpose'];
            const parts = replyText.split(/\n|,/).map(function(s) { return s.trim(); }).filter(Boolean);
            const assign = function(key, v) {
                if (doc[key]) return; // 이미 채워진 필드는 덮어쓰지 않음
                if (key === 'purpose') {
                    const pc = (v.match(/\bP0[1-5]\b/i) || [])[0];
                    if (pc) doc.purpose = pc.toUpperCase();
                } else {
                    doc[key] = v;
                }
            };
            if (parts.length === order.length) {
                order.forEach(function(key, i) { assign(key, parts[i]); });
            } else if (parts.length && parts.length === missingBefore.length) {
                missingBefore.forEach(function(key, i) { assign(key, parts[i]); });
            }
        }
    };

    window._ganttQaPoDocIsIncomplete = function(doc) {
        return !doc.projectCode || !doc.reason || !doc.purpose;
    };

    window._ganttQaPoAskFieldsPrompt = function(pd, introText) {
        const isMulti = pd.docs.length > 1;
        if (!isMulti) {
            // 문서가 1건이면 번호를 붙일 필요가 없으므로 기존 단일 문서 동작과 100% 동일 —
            // docs[0]을 기준으로 자유 텍스트 2항목(프로젝트코드/요청사유) + 목적 드롭다운.
            // 사번은 이 단계 전에 ask_buyer에서 이미 pd.buyerEmpId로 확보돼 있다.
            const doc = pd.docs[0];
            const textMissing = [];
            if (!doc.projectCode) textMissing.push(window._t('프로젝트코드', 'project code'));
            if (!doc.reason) textMissing.push(window._t('요청사유', 'reason'));
            const textLine = textMissing.length
                ? window._t(`아래 항목을 알려주세요: ${textMissing.join(', ')}`, `Please provide: ${textMissing.join(', ')}`)
                : '';
            const reply = introText + (textLine ? '\n\n' + textLine : '');
            if (!doc.purpose) {
                const dropdownId = 'po-purpose-' + Date.now();
                const purposeOptions = window._PO_PURPOSE_TABLE.map(function(r) { return { value: r.code, label: `${r.code} ${r.desc}` }; });
                window._ganttQaPendingChoiceDropdown = {
                    id: dropdownId, multi: true,
                    items: [{ label: window._t('목적(P01~P05)', 'Purpose (P01–P05)'), options: purposeOptions }],
                    buildAnswerText: function(selections) { return selections.filter(function(v) { return !!v; }).join(', '); }
                };
                window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: dropdownId, text: reply });
            } else {
                window._ganttQaHistory.push({ role: 'ai', text: reply });
            }
            return;
        }

        // 문서가 2건 이상 — 프로젝트코드/요청사유/목적은 "문서마다 다르다"고 가정, 문서별로
        // 뭐가 빠졌는지 나열(사번은 ask_buyer에서 이미 공통으로 확보됨 — 여기 관여 안 함).
        const incomplete = pd.docs.map(function(d, i) { return { idx: i, doc: d }; })
            .filter(function(x) { return window._ganttQaPoDocIsIncomplete(x.doc); });
        const docLabel = function(x) { return x.doc.vendorName || (window._currentLang === 'en' ? `Doc ${x.idx + 1}` : `${x.idx + 1}번`); };
        const lines = incomplete.map(function(x) {
            const need = [];
            if (!x.doc.projectCode) need.push(window._t('프로젝트코드', 'project code'));
            if (!x.doc.reason) need.push(window._t('요청사유', 'reason'));
            if (!x.doc.purpose) need.push(window._t('목적', 'purpose'));
            return `${x.idx + 1}번(${docLabel(x)}): ${need.join(', ')}`;
        }).join('\n');
        const guide = window._t(
            `문서 번호를 붙여서 알려주세요(예: "1번: G2610OB, 샘플제작, P01"). 여러 문서가 전부 같은 값이면 드문 경우겠지만 "전체 동일: G2610OB, 샘플제작, P01"처럼 한 번만 답해도 됩니다.`,
            `Please answer per document, with its number (e.g. "1: G2610OB, sample production, P01"). If — less commonly — all documents truly share the same values, you can answer once with "same for all: G2610OB, sample production, P01".`
        );
        const reply = introText + '\n\n' + lines + '\n\n' + guide;

        const purposeMissing = incomplete.filter(function(x) { return !x.doc.purpose; });
        if (purposeMissing.length) {
            const dropdownId = 'po-purpose-batch-' + Date.now();
            const purposeOptions = window._PO_PURPOSE_TABLE.map(function(r) { return { value: r.code, label: `${r.code} ${r.desc}` }; });
            const applyAllItem = {
                label: window._t('🔁 전체 문서에 동일 목적 적용', '🔁 Apply the same purpose to ALL documents'),
                options: purposeOptions
            };
            const perDocItems = purposeMissing.map(function(x) { return { label: docLabel(x), options: purposeOptions }; });
            window._ganttQaPendingChoiceDropdown = {
                id: dropdownId, multi: true,
                items: purposeMissing.length >= 2 ? [applyAllItem].concat(perDocItems) : perDocItems,
                buildAnswerText: function(selections) {
                    if (purposeMissing.length >= 2 && selections[0]) {
                        return window._t(`전체 동일: 목적 ${selections[0]}`, `same for all: purpose ${selections[0]}`);
                    }
                    const docSelections = purposeMissing.length >= 2 ? selections.slice(1) : selections;
                    const parts = [];
                    docSelections.forEach(function(code, i) {
                        if (code) parts.push(window._t(`${purposeMissing[i].idx + 1}번: 목적 ${code}`, `${purposeMissing[i].idx + 1}: purpose ${code}`));
                    });
                    return parts.join('\n');
                }
            };
            window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: dropdownId, text: reply });
        } else {
            window._ganttQaHistory.push({ role: 'ai', text: reply });
        }
    };

    // 🆕 [2026-09-17 신규] "품목 확인" 이후 다음에 뭘 해야 하는지 판단하는 중앙 디스패처 —
    // "확인" 응답 직후, 사업자등록번호를 고친 직후, 임시코드 드롭다운/정정을 마친 직후 등
    // 여러 지점에서 재사용된다. 사업자등록번호 → 임시코드 → 문서별 4항목(프로젝트코드/사번/
    // 요청사유/목적) 순으로 부족한 것부터 확인하고, 전부 채워지면 4항목을 묻는 단계
    // (ask_fields, 2026-09-18 이전 이름은 ask_shared)로 넘어간다.
    window._ganttQaPoAdvanceAfterItemsConfirmed = function(pd) {
        const missingBiz = window._ganttQaPoFindMissingBizNoDocs(pd.docs);
        if (missingBiz.length) {
            pd.stage = 'fix_biznos';
            const lines = missingBiz.map(function(x) { return `${x.idx + 1}번(${x.doc.vendorName || (window._currentLang === 'en' ? 'unknown' : '미확인')})`; }).join(', ');
            window._ganttQaHistory.push({ role: 'ai', text: window._t(
                `⚠️ 아래 문서는 협력사 사업자등록번호가 확인되지 않았습니다 — 알려주세요(예: "1번: 2168144558", 문서가 1건이면 번호만 말해도 됩니다):\n${lines}`,
                `⚠️ These document(s) need a confirmed vendor business registration number (e.g. "1: 2168144558" — if there's only one document, just the number is fine):\n${lines}`
            )});
            return;
        }
        const missingTemp = window._ganttQaPoFindMissingTempCodeItems(pd.docs);
        if (missingTemp.length) {
            pd.stage = 'confirm_items'; // 드롭다운 답도 기존처럼 자유서술 정정 경로로 흘려보냄
            window._ganttQaPoShowTempCodeDropdown(missingTemp);
            return;
        }
        // 사번은 배치 전체 공통으로 딱 한 번만 묻는다(사용자: "작성자가 같은 경우가 많다").
        // 이미 채워져 있으면(예: 사용자가 앞 단계 답변에 미리 적어둔 경우) 건너뛴다.
        if (!pd.buyerEmpId) {
            pd.stage = 'ask_buyer';
            window._ganttQaHistory.push({ role: 'ai', text: window._t(
                `✅ 문서 ${pd.docs.length}건 모두 품목 확인이 끝났습니다.\n\n구매담당자 사번을 알려주세요(예: 2004051002) — 모든 문서에 공통으로 적용됩니다.`,
                `✅ Item confirmation is done for all ${pd.docs.length} document(s).\n\nPlease provide the buyer's employee ID (e.g. 2004051002) — it applies to every document.`
            )});
            return;
        }
        pd.stage = 'ask_fields';
        window._ganttQaPoAskFieldsPrompt(pd, window._t(
            `이제 문서별 정보(프로젝트코드/요청사유/목적)가 필요합니다.\n\n이후 과정(엑셀 생성 ~ SAP 업로드 ~ 저장 ~ 발주서 출력)은 모두 자동으로 진행되며, 문서마다 다시 확인을 묻지 않습니다.`,
            `Now I need the per-document info (project code / reason / purpose).\n\nEverything after this (excel → SAP upload → save → PO printing) will run automatically without asking again per document.`
        ));
    };

    // 🆕 [2026-09-17 신규, 사용자 요청] 문서 하나를 엑셀 생성 → SAP 업로드/입력 → **바로 이어서
    // 저장까지** 처리한다 — 예전엔 여기서 멈춰 사람이 "저장해줘"라고 답할 때까지 기다렸지만
    // (구매오더 저장은 SAP 재무적 커밋이라 사람 확인 후 정지로 설계했었음, CLAUDE.md 참고),
    // 사용자가 "SAP 입력 시간이 기니까 처음 한 번만 확인하고 이후는 전부 자동으로, 자리를
    // 비웠다 와도 다 되어있도록 해달라"고 명시적으로 요청해서 이 함수부터는 더 이상 멈추지
    // 않는다 — 설계를 명시적으로 뒤집은 것이니 앞으로 이 코드를 다시 손볼 때 참고할 것.
    // `confirm_save_po`(백엔드/SAP 브릿지)는 `prepare_po_from_excel`이 남긴 화면 그대로일
    // 것을 전제하므로, 두 호출 사이에 절대 다른 요청이 끼어들지 않도록 이 함수 안에서
    // 곧바로 이어서 호출한다.
    window._ganttQaPrepareAndSaveOneDoc = async function(pd, doc) {
        const receiver = window.getActiveUserName ? window.getActiveUserName() : '';
        const rows = doc.items.map(function(it) {
            return {
                '자재코드': it.tempCode, '자재명': it.desc, '요청수량': it.qty,
                '필요일자': doc.invoiceDate, '구매그룹': '908', '프로젝트코드': doc.projectCode,
                '수령인': receiver, '구매담당자 사번': pd.buyerEmpId, '요청사유': doc.reason,
                'VINA PO': '', '목적': doc.purpose, '비고': '',
            };
        });
        const exRes = await window._withTimeout(
            fetch('http://127.0.0.1:5000/po-build-excel', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: rows })
            }), 30000, window._t('엑셀 생성 시간 초과', 'Excel generation timed out')
        );
        const exData = await window._ganttQaParsePoApiResponse(exRes, '엑셀 생성', 'excel generation');
        if (!exData.ok) throw new Error(exData.error || window._t('알 수 없는 오류', 'unknown error'));

        const prepRes = await window._withTimeout(
            fetch('http://127.0.0.1:5000/po-sap-prepare', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    excelPath: exData.path, bizRegNo: doc.bizRegNo,
                    items: doc.items.map(function(it) { return { unitPrice: it.unitPrice }; }),
                    plant: '1000', currency: doc.currency || 'KRW'
                })
            }), Math.min(120000, 40000 + 8000 * doc.items.length),
            window._t('SAP 구매오더 준비 시간 초과', 'SAP purchase order preparation timed out')
        );
        const prepData = await window._ganttQaParsePoApiResponse(prepRes, 'SAP 구매오더 준비', 'SAP purchase order preparation');
        if (!prepData.ok) throw new Error(prepData.error || window._t('알 수 없는 오류', 'unknown error'));

        const saveRes = await window._withTimeout(
            fetch('http://127.0.0.1:5000/po-sap-confirm-save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ purchasingOrg: '9000', plant: '1000' })
            }), 60000, window._t('SAP 구매오더 저장 시간 초과', 'SAP purchase order save timed out')
        );
        const saveData = await window._ganttQaParsePoApiResponse(saveRes, 'SAP 구매오더 저장', 'SAP purchase order save');
        if (!saveData.ok) throw new Error(saveData.error || window._t('알 수 없는 오류', 'unknown error'));
        return { poNumber: saveData.poNumber, autoSaved: saveData.autoSaved, message: saveData.message };
    };

    // 🆕 [2026-09-17 신규] 배치 안의 모든 문서를 순차로(SAP GUI는 세션 1개라 병렬 불가) 자동
    // 처리 — 한 문서가 실패해도 나머지는 계속 진행하고(자리를 비웠다 와도 "전부 다 됨"이
    // 아니라 "각자 결과가 남아있음"을 보장하기 위함), 끝나면 문서별 성공/실패를 한 메시지로
    // 요약한다. 실패한 문서는 이 배치 안에서 자동 재시도하지 않음 — 사람이 결과를 보고
    // 필요하면 해당 문서만 다시 첨부/설명해서 새로 시작해야 한다.
    window._ganttQaRunPoBatchAutomatically = async function(pd) {
        const results = [];
        for (let i = 0; i < pd.docs.length; i++) {
            const doc = pd.docs[i];
            const label = doc.vendorName || doc.bizRegNo || (i + 1);
            window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t(`(${i + 1}/${pd.docs.length}) "${label}" 구매오더 처리 중... (SAP 입력에 시간이 걸릴 수 있습니다)`, `(${i + 1}/${pd.docs.length}) Processing purchase order for "${label}"... (SAP entry may take a while)`), pending: true });
            window._renderGanttQaMessages();
            try {
                const r = await window._ganttQaPrepareAndSaveOneDoc(pd, doc);
                results.push({ label: label, ok: true, poNumber: r.poNumber, autoSaved: r.autoSaved });
            } catch (e) {
                results.push({ label: label, ok: false, error: (e && e.message) ? e.message : String(e) });
            }
            window._ganttQaHistory.pop();
        }
        const lines = results.map(function(r, i) {
            if (r.ok) {
                return `✅ ${i + 1}. ${r.label} → ${window._t('오더번호', 'PO')} ${r.poNumber}` +
                    (r.autoSaved ? window._t(' (PDF 자동저장·오픈 완료)', ' (PDF auto-saved and opened)') : window._t(' (PDF 미리보기가 열려있습니다 — 💾 아이콘으로 직접 저장해주세요)', ' (PDF preview is open — please save it manually via the 💾 icon)'));
            }
            return `⚠️ ${i + 1}. ${r.label} → ${window._t('실패', 'failed')}: ${r.error}`;
        }).join('\n');
        const successCount = results.filter(function(r) { return r.ok; }).length;
        window._ganttQaHistory.push({ role: 'ai', text: window._t(
            `🏁 구매오더 자동 처리를 마쳤습니다(${successCount}/${results.length}건 성공):\n${lines}`,
            `🏁 Finished automatic purchase order processing (${successCount}/${results.length} succeeded):\n${lines}`
        )});
        window._ganttQaPoDraft = null;
    };

    // 🐛🐛 [2026-09-16 실사용 버그수정] 백엔드가 오래된 버전이거나 꺼져 있으면 `/po-build-excel`/
    // `/po-sap-prepare`가 JSON 대신 HTML(404/에러 페이지)을 돌려주는데, 그걸 그냥 `.json()`으로
    // 파싱하면 "Unexpected token '<', "<!doctype "... is not valid JSON"이라는 정체불명의 오류가
    // 나서 사람이 "사업자등록번호가 잘못됐나?"로 오해하고 애먼 값을 계속 고쳐보게 만든다(실사용
    // 제보 — 자동 시작 프로그램으로 켜둔 채 재다운로드/재시작을 한 번도 안 한 다른 PC에서 재현됨,
    // 자동 업데이트는 파일만 갱신하고 실행 중인 프로세스는 재시작하지 않는다는 기존 설계 때문에
    // 이런 PC가 계속 구버전으로 남을 수 있음). 응답을 먼저 텍스트로 받아 직접 JSON.parse해서
    // 실패 시 이 상황임을 명확히 구분해 안내한다.
    window._ganttQaParsePoApiResponse = async function(res, stepKo, stepEn) {
        const raw = await res.text();
        try {
            return JSON.parse(raw);
        } catch (e) {
            const err = new Error(window._t(
                `${stepKo} 응답을 해석할 수 없습니다(HTTP ${res.status}) — 이 PC의 로컬 백엔드(kortek_backend.py)가 꺼져 있거나 오래된 버전이라 이 기능이 없을 수 있습니다. 백엔드 콘솔을 닫고 kortek_backend.bat을 다시 실행해보세요(자동 업데이트 배너는 파일만 갱신할 뿐 실행 중인 프로세스를 재시작하지 않습니다 — 재시작해야 반영됩니다).`,
                `Could not parse the ${stepEn} response (HTTP ${res.status}) — the local backend (kortek_backend.py) on this PC may be off or running an old version missing this feature. Try closing the backend console and re-running kortek_backend.bat (the auto-update banner only refreshes files; it doesn't restart the running process — a restart is required).`
            ));
            err.isBackendStale = true;
            throw err;
        }
    };

    window._aiFetchSapContext = async function(question) {
        try {
            // 💡 [2026-09-15 다중 자재 지원] 원래 첫 번째 자재번호만 뽑았는데(non-global 정규식),
            //    "104438\n104481\n104477\n117451\n다중 사용처 조회해줘"처럼 여러 자재를 나열하면
            //    나머지가 통째로 무시되던 버그 — bomNums와 동일하게 global 매치로 전부 모은다.
            //    기본값은 백엔드(sap_bridge_32.py의 fetch_where_used)가 자재마다 CS15를 따로
            //    실행해 이어붙이는 방식(느리지만 안전 — ZPP046 배치 리포트는 500행 캡을 여러
            //    자재가 공유해서 사용처 많은 자재 하나가 나머지를 다 밀어내는 문제가 있어 기본
            //    경로로는 채택 안 함, 자세한 진단은 CLAUDE.md/fetch_where_used docstring 참고).
            // 💡 [2026-09-15 신규, 사용자 요청] 다만 "역전개"/"사용처"를 **다중/일괄/복수**의
            //    의미로 명시하면(예: "다중 사용처 조회해줘"/"일괄 역전개"/"사용처 복수 조회") —
            //    사용자가 그 트레이드오프(빠르지만 잘릴 수 있음)를 알고 원하는 것으로 보고
            //    ZPP046 배치 경로(`/sap-where-used-batch`)로 라우팅한다. 단수 표현("104446
            //    사용처 조회해줘")은 자재가 몇 개든 그대로 기본(CS15 순차) 경로를 탄다 —
            //    말씀하신 대로 "단수/다중 워딩"이 기준이지 자재 개수가 기준이 아니다.
            const whereUsedNums = (question && /(역전개|사용처)/.test(question)) ? (question.match(/\b\d{5,8}\b/g) || []) : [];
            const whereUsedMatch = whereUsedNums.length > 0;
            const wantsBatchWhereUsed = whereUsedMatch && /(다중|일괄|복수)/.test(question);
            const bomNums = (!whereUsedMatch && question && /bom/i.test(question)) ? (question.match(/\b\d{5,8}\b/g) || []) : [];
            const bomMatch = bomNums.length > 0;
            // 🆕 [2026-09-17 신규, 사용자 요청] "133025,133026 엑셀 출력해줘"처럼 BOM/사용처/
            // 역전개 키워드 없이 자재번호만 있는 요청의 기본 조회 경로를 ZMM009로 바꿔달라는
            // 요청 — 사용자가 직접 준 SAP GUI "기록 및 재생" 매크로로 정확한 필드 ID를 확보해
            // `sap_bridge_32.py`의 fetch_zmm009_material_list()로 구현함(추측 아님). 예전엔
            // 이 경우 전부 맨 아래 else(범용 `/sap-fetch` — "지금 SAP GUI 화면에 뭐가 떠
            // 있든 그걸 그대로 읽기")로 빠져서, 자재번호나 트랜잭션 이름을 뭐라고 말하든
            // 결과가 항상 똑같았다(화면이 안 바뀌면 내용도 안 바뀌므로) — 이제 자재번호가
            // 있으면 실제로 ZMM009로 이동해서 그 자재들을 조회한다.
            const zmm009Nums = (!whereUsedMatch && !bomMatch && question) ? (question.match(/\b\d{5,8}\b/g) || []) : [];
            const zmm009Match = zmm009Nums.length > 0;

            let url, timeoutMs, timeoutMsgKo, timeoutMsgEn;
            if (whereUsedMatch && wantsBatchWhereUsed) {
                url = 'http://127.0.0.1:5000/sap-where-used-batch?material=' + encodeURIComponent(whereUsedNums.join(','));
                timeoutMs = 60000;
                timeoutMsgKo = 'SAP 사용처 일괄조회 시간 초과'; timeoutMsgEn = 'SAP batch where-used lookup timed out';
            } else if (whereUsedMatch) {
                url = 'http://127.0.0.1:5000/sap-where-used?material=' + encodeURIComponent(whereUsedNums.join(','));
                timeoutMs = whereUsedNums.length <= 1 ? 30000 : Math.min(150000, 30000 + 20000 * whereUsedNums.length);
                timeoutMsgKo = 'SAP 사용처 조회 시간 초과'; timeoutMsgEn = 'SAP where-used lookup timed out';
            } else if (bomMatch) {
                // 💡 [2026-09-15 신규] sendGanttQaMessage의 BOM 옵션 draft가 이미 이 자재 조합에
                //    대해 물어보고 답을 받아뒀으면(_ganttQaBomResolvedOptions) 그 값을 그대로 써서
                //    또 묻지 않는다 — 1회성이라 쓰고 나면 즉시 비운다(다음 BOM 질문은 새로 물어봄).
                let tcodeParam = 'auto', explosionParam = 'single', priceParam = '0', locParam = '0';
                const bomKey = bomNums.slice().sort().join(',');
                const resolvedOpts = window._ganttQaBomResolvedOptions;
                let layoutParam = ''; // 🆕 비어있으면 백엔드가 기존 기본값(/STD_MC)을 그대로 씀
                if (resolvedOpts && resolvedOpts.materialsKey === bomKey) {
                    tcodeParam = resolvedOpts.useSingleTcode === true ? 'single' : (resolvedOpts.useSingleTcode === false ? 'multi' : 'auto');
                    explosionParam = resolvedOpts.explosion || 'single';
                    priceParam = resolvedOpts.showPrice ? '1' : '0';
                    locParam = resolvedOpts.showLocation ? '1' : '0';
                    layoutParam = resolvedOpts.layout || '';
                    window._ganttQaBomResolvedOptions = null;
                }
                url = 'http://127.0.0.1:5000/sap-bom?material=' + encodeURIComponent(bomNums.join(','))
                    + '&tcode=' + tcodeParam + '&explosion=' + explosionParam
                    + '&show_price=' + priceParam + '&show_location=' + locParam
                    + '&layout=' + encodeURIComponent(layoutParam);
                timeoutMs = Math.min(90000, 30000 + 10000 * bomNums.length);
                timeoutMsgKo = 'SAP BOM 조회 시간 초과'; timeoutMsgEn = 'SAP BOM lookup timed out';
            } else if (zmm009Match) {
                url = 'http://127.0.0.1:5000/sap-zmm009?material=' + encodeURIComponent(zmm009Nums.join(','));
                timeoutMs = Math.min(150000, 30000 + 15000 * zmm009Nums.length);
                timeoutMsgKo = 'SAP ZMM009 자재 조회 시간 초과'; timeoutMsgEn = 'SAP ZMM009 material lookup timed out';
            } else {
                url = 'http://127.0.0.1:5000/sap-fetch';
                timeoutMs = 15000;
                timeoutMsgKo = 'SAP 조회 15초 시간 초과'; timeoutMsgEn = 'SAP lookup timed out after 15s';
            }

            const res = await window._withTimeout(
                fetch(url), timeoutMs,
                window._t(timeoutMsgKo, timeoutMsgEn)
            );
            const data = await res.json();
            if (!data.ok) return '(' + window._t('SAP 조회 실패', 'SAP lookup failed') + ': ' + (data.error || window._t('알 수 없는 오류', 'unknown error')) + ')';
            // 💡 [2026-09-14 신규] "엑셀로 내보내줘" 로컬 명령(sendGanttQaMessage의
            //    _ganttQaExtractSapExportRequest 처리 블록)이 AI를 다시 거치지 않고 바로 쓸 수
            //    있도록, 성공한 조회 결과를 매번 최신 것으로 캐싱해둔다.
            window._lastSapFetchResult = { source: data.source, text: data.text, fetchedAt: Date.now() };
            return data.text || null;
        } catch (e) {
            console.warn('[AI 문답] SAP 조회 실패:', e && e.message);
            return '(' + window._t('SAP 조회 실패', 'SAP lookup failed') + ': ' + window._t('로컬 백엔드(kortek_backend.py)가 켜져 있는지 확인하세요.', 'Please check that the local backend (kortek_backend.py) is running.') + ')';
        }
    };

    // 💡 [2026-09-07 확장] 다른 프로젝트의 저장 파일(globalData/colIdx/projectMeta/tabData)을 가볍게
    //    요약 텍스트로 변환. 현재 프로젝트용 _buildGanttQaContext처럼 DOM(rendered table)에서 읽지
    //    않고 저장된 JSON 값만 사용한다(다른 프로젝트를 화면에 렌더링하지 않고 조회만 하기 위함) —
    //    그런데 Customer SPEC/M.C Table/주소록은 사실 DOM이 아니라 tabData(briefSpec/mcRevisions/
    //    addressBook)에 이미 저장돼 있어(collectTabData 참고) DOM 없이도 그대로 읽을 수 있고,
    //    Elec Parts/PANEL도 tabData(elecCompare/panelCompare)의 "선택된 모델명"만 있으면 현재
    //    프로젝트와 동일하게 팀 공용 라이브러리(_epLibCache)에서 스펙을 다시 조회할 수 있다 —
    //    "질문 대상 프로젝트를 고르는 것도 결국 그 파일을 열어보는 것과 같다"는 점에서, 이 탭들을
    //    굳이 생략할 이유가 없어 전부 포함한다. 다만 #CS/#MC/#EP/#MT처럼 클릭하면 그 프로젝트
    //    화면으로 이동하는 인용 번호는 다른 프로젝트엔 붙이지 않는다(그 프로젝트가 실제로 렌더링돼
    //    있지 않아 클릭 이동이 불가능하므로) — 업무 목록의 "#G숫자" 인용 금지 규칙과 같은 이유.
    window._buildOtherProjectQaContext = async function(pd, indexEntry) {
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
        // 💡 [2026-09-07] 하드코딩 200 → 사용자 설정(⚙️ AI 분석 설정 → 📉 요청 크기 제한)으로 뺌(위
        //    MAX_TASKS와 동일한 이유). 다른 프로젝트 조회는 참고용이라 지금 프로젝트보다 낮은
        //    상한이 기본값이지만, Groq 등에서 여전히 크면 이 값도 같이 줄일 수 있게 함.
        const MAX_OTHER_TASKS = window.getAiQaMaxOtherTasks ? window.getAiQaMaxOtherTasks() : 200; // 💡 다른 프로젝트 조회는 참고용이라 지금 프로젝트(300건)보다 낮은 상한으로 용량 보호
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

        // [Customer SPEC] — tabData.briefSpec에 이미 저장된 값(collectTabData 참고), DOM 불필요.
        const MAX_OTHER_TABLE_ROWS = 100;
        const csRows = (td.briefSpec || []).filter(function(r) { return r && (r.modelA || r.modelB || r.modelC || r.type); });
        const csLines = csRows.slice(0, MAX_OTHER_TABLE_ROWS).map(function(r) {
            return `- [${r.type || '-'}${r.sub ? '/' + r.sub : ''}] A:${r.modelA || '-'} | B:${r.modelB || '-'} | C:${r.modelC || '-'}` + (r.note ? ` | 비고:${r.note}` : '');
        });
        const csOmitted = csRows.length > MAX_OTHER_TABLE_ROWS ? `\n...(그 외 ${csRows.length - MAX_OTHER_TABLE_ROWS}건 생략됨)` : '';

        // [M.C Table] — 현재 활성 리비전(mcActiveRevision) 기준, 없으면 R1/구버전 mcTable로 폴백.
        const mcRev = td.mcActiveRevision || 'R1';
        const mcRowsRaw = (td.mcRevisions && td.mcRevisions[mcRev]) || td.mcTable || [];
        const mcRows = mcRowsRaw.filter(function(r) { return r && (r.item || r.pn || r.type); });
        const mcLinesOther = mcRows.slice(0, MAX_OTHER_TABLE_ROWS).map(function(r) {
            return `- [${r.type || '-'}] ${r.item || '-'} (${r.group || '-'}) PN:${r.pn || '-'} SPEC:${r.spec || '-'}`
                + ` | Proto:${r.protoCost || '-'}/${r.protoNre || '-'} ProtoB:${r.protoBCost || '-'}/${r.protoBNre || '-'} MP:${r.mpCost || '-'}/${r.mpNre || '-'}`
                + (r.note ? ` | 비고:${r.note}` : '');
        });
        const mcOmittedOther = mcRows.length > MAX_OTHER_TABLE_ROWS ? `\n...(그 외 ${mcRows.length - MAX_OTHER_TABLE_ROWS}건 생략됨, 리비전:${mcRev})` : '';

        // [주소록] — 그 프로젝트가 마지막으로 저장될 당시의 스냅샷(tabData.addressBook). 개인정보
        // 최소 수집 원칙에 따라 이름/부서/직함까지만(연락처 제외) — 현재 프로젝트 컨텍스트와 동일 기준.
        const addrRows = (td.addressBook || []).filter(function(p) { return p && (p.name || p.nameEn); });
        const addrLinesOther = addrRows.slice(0, MAX_OTHER_TABLE_ROWS).map(function(p) {
            const nm = (p.name && p.nameEn) ? `${p.name} (${p.nameEn})` : (p.name || p.nameEn || '');
            return `- ${nm}${p.dept ? ' / ' + p.dept : ''}${p.title ? ' / ' + p.title : ''}`;
        });
        const addrOmittedOther = addrRows.length > MAX_OTHER_TABLE_ROWS ? `\n...(그 외 ${addrRows.length - MAX_OTHER_TABLE_ROWS}명 생략됨)` : '';

        // [Elec Parts / PANEL] — tabData.elecCompare/panelCompare엔 "선택된 모델명"만 있고 실제 스펙은
        // 팀 공용 라이브러리에 있음(현재 프로젝트와 같은 소스) — 그 라이브러리는 프로젝트 무관 공용
        // 자원이라 그대로 재조회 가능. 현재 프로젝트 컨텍스트 빌더와 동일한 캐시(_epLibCache) 공유.
        const otherElecLines = [];
        const elecCompareOther = td.elecCompare || {};
        const elecTypeLabelsOther = { convbd: 'CONVERTER', adbd: 'AD BOARD', touchctrl: 'TOUCH CTRL' };
        for (const type of Object.keys(elecTypeLabelsOther)) {
            const ec = elecCompareOther[type];
            if (!ec || !ec.selectedModels || !ec.selectedModels.length) continue;
            let lib = window._epLibCache && window._epLibCache[type];
            if (!lib && window.loadElecPartLibrary) {
                try { lib = await window._withTimeout(window.loadElecPartLibrary(type), 8000, '전기부품 라이브러리 조회 시간 초과'); window._epLibCache = window._epLibCache || {}; window._epLibCache[type] = lib; } catch (e) { lib = null; }
            }
            const items = (lib && lib.items) || [];
            const notes = ec.notes || {};
            ec.selectedModels.forEach(function(m) {
                const entry = items.find(function(it) { return it.model === m; });
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const fields = window._epFlatFields ? window._epFlatFields(type) : [];
                    const kv = fields.map(function(f) { const v = specs[f[0]]; return (v && v !== '-') ? `${f[0]}:${v}` : null; }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                otherElecLines.push(`- [${elecTypeLabelsOther[type]}] ${partName} (모델:${m})\n  ${specLine}` + (notes[m] ? ` | 메모:${notes[m]}` : ''));
            });
        }
        const panelCompareOther = td.panelCompare || {};
        if (panelCompareOther.selectedModels && panelCompareOther.selectedModels.length && window.loadPanelLibrary && window.findPanelInLibrary) {
            let panelLib = window._epLibCache && window._epLibCache.panel;
            if (!panelLib) {
                try { panelLib = await window._withTimeout(window.loadPanelLibrary(), 8000, '패널 라이브러리 조회 시간 초과'); window._epLibCache = window._epLibCache || {}; window._epLibCache.panel = panelLib; } catch (e) { panelLib = null; }
            }
            const panelFields = [];
            (window.PANEL_SPEC_SCHEMA || []).forEach(function(sec) { sec.fields.forEach(function(f) { panelFields.push(f); }); });
            const notes = panelCompareOther.notes || {};
            panelCompareOther.selectedModels.forEach(function(m) {
                const entry = panelLib ? window.findPanelInLibrary(panelLib, m) : null;
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const kv = panelFields.map(function(f) { const v = specs[f[0]]; return (v && v !== '-') ? `${f[0]}:${v}` : null; }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                otherElecLines.push(`- [PANEL] ${partName} (모델:${m})\n  ${specLine}` + (notes[m] ? ` | 메모:${notes[m]}` : ''));
            });
        }

        return `[다른 프로젝트: ${label}]\n` +
            `고객사:${pm.고객사 || '-'} / 모델:${pm.고객모델명 || '-'} / PM:${pm.프로젝트담당자 || '-'}\n` +
            `[개요]\n${overview.length ? overview.join('\n') : '(없음)'}\n` +
            `[담당자]\n${memberLines.length ? memberLines.join('\n') : '(없음)'}\n` +
            `[주요 자재]\n${materialLines.length ? materialLines.join('\n') : '(없음)'}\n` +
            `[Customer SPEC]\n${csLines.length ? csLines.join('\n') : '(없음)'}${csOmitted}\n` +
            `[M.C Table] (리비전:${mcRev})\n${mcLinesOther.length ? mcLinesOther.join('\n') : '(없음)'}${mcOmittedOther}\n` +
            `[Elec Parts / PANEL SPEC]\n${otherElecLines.length ? otherElecLines.join('\n') : '(없음)'}\n` +
            `[주소록]\n${addrLinesOther.length ? addrLinesOther.join('\n') : '(없음)'}${addrOmittedOther}\n` +
            `[업무 목록] (총 ${rows.length}건)\n${lines.length ? lines.join('\n') : '(등록된 업무 없음)'}${omitted}\n` +
            `※ 이 프로젝트의 업무/표 항목에는 "#G"/"#CS"/"#MC"/"#EP"/"#MT" 같은 클릭 인용 번호를 절대 붙이지 마세요(그 프로젝트가 화면에 열려있지 않아 클릭 이동이 불가능합니다) — 항목 이름으로만 설명하세요.`;
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
            if (window.showToast) window.showToast(window._t('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', '⚠️ This draft has already been handled or replaced by a newer draft.'), 'warning');
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
        let title = '', deadlineLine = '', ddayLine, recipLine, correctLine;
        const contentLines = [];
        let inContent = false;
        lines.forEach(function(line) {
            const mTitle    = !inContent && line.match(/^\s*제목\s*:\s*(.*)$/);
            const mDeadline = !inContent && line.match(/^\s*기준일\s*:\s*(.*)$/);
            const mDday     = !inContent && line.match(/^\s*D-day\s*:\s*(.*)$/i);
            const mRecip    = !inContent && line.match(/^\s*수신인\s*:\s*(.*)$/);
            const mCorrect  = !inContent && line.match(/^\s*정정\s*:\s*(.*)$/);
            const mContent  = !inContent && line.match(/^\s*내용\s*:\s*(.*)$/);
            if (mTitle)    { title = mTitle[1].trim(); return; }
            if (mDeadline) { deadlineLine = mDeadline[1].trim(); return; }
            if (mDday)     { ddayLine = mDday[1].trim(); return; }
            if (mRecip)    { recipLine = mRecip[1].trim(); return; }
            if (mCorrect)  { correctLine = mCorrect[1].trim(); return; }
            if (mContent)  { inContent = true; if (mContent[1].trim()) contentLines.push(mContent[1]); return; }
            if (inContent) contentLines.push(line);
        });
        const splitNames = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return x.trim(); }).filter(Boolean); };
        const parseDays  = function(s) { return String(s || '').split(/[,，、]/).map(function(x) { return parseInt(x.trim(), 10); }).filter(function(n) { return !isNaN(n); }); };
        // 💡 기준일은 쉼표로 구분된 여러 날짜를 허용 — 날짜마다 별도 공지가 등록됨
        const deadlines = deadlineLine ? deadlineLine.split(/[,，、]/).map(function(d) { return d.trim(); }).filter(Boolean) : [];
        // 💡 [2026-09-13 신규] "정정: true" — AI가 "정정해줘/이전 것 삭제 후 다시 등록" 요청을 받을 때
        //    이 필드를 삽입. 등록 시 같은 제목의 기존 공지를 모두 삭제 후 새 공지를 등록한다.
        const correctMode = correctLine ? /^(true|yes|1|예|맞|네)$/i.test(correctLine) : false;
        return {
            title: title,
            deadline: deadlines[0] || '',    // 하위호환 — 단일 날짜 경로도 유지
            deadlines: deadlines,            // 다중 날짜 배열 (0개면 빈 배열)
            alarmDays: ddayLine ? parseDays(ddayLine) : [0],
            recipientNames: recipLine !== undefined ? splitNames(recipLine) : [],
            body: contentLines.join('\n').trim(),
            correctMode: correctMode         // 정정 모드: true면 같은 제목 기존 공지 삭제 후 등록
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
            body: parsed.body || '',
            correctMode: !!parsed.correctMode  // 정정 모드 전달
        };
    };

    window._aiNoticeDraftPreviewMd = function(draft) {
        const fmtPerson = function(p) { return p.email ? `${p.name} (${p.email})` : `${p.name} ⚠️(이메일 없음)`; };
        const recipStr = draft.recipients.length ? draft.recipients.map(fmtPerson).join(', ') : '(등록 후 직접 선택 필요)';
        const dls = (draft.deadlines && draft.deadlines.length) ? draft.deadlines : (draft.deadline ? [draft.deadline] : []);
        const dlStr = dls.length > 1 ? `${dls.join(', ')} (${dls.length}개 날짜 → 공지 ${dls.length}건 등록)` : (dls[0] || '⚠️(기준일 없음)');
        // 💡 [2026-09-13 신규] 정정 모드 안내 — 같은 제목의 기존 공지가 삭제된다는 것을 미리 알려줌
        const correctHint = draft.correctMode
            ? `\n\n🔄 **정정 모드**: 제목이 "${draft.title || ''}"인 기존 공지를 모두 삭제하고 새로 등록합니다.`
            : '';
        let md = `📢 **공지 초안**\n- **제목:** ${draft.title || '(제목 없음)'}\n- **기준일:** ${dlStr}\n- **알림 시점:** ${draft.alarmDays.map(function(d) { return 'D-' + d; }).join(', ')}\n- **수신 대상:** ${recipStr}`;
        md += `\n\n**내용**\n${draft.body || '(내용 없음)'}`;
        md += correctHint;
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
        // 💡 [2026-09-13 신규] 정정 모드: 같은 제목의 기존 공지를 모두 삭제 후 새로 등록
        //    "정정해줘"/"이전 것 지우고 다시 등록" 요청에서 AI가 draft.correctMode=true를 세팅함.
        let deletedCount = 0;
        if (draft.correctMode && draft.title) {
            const titleToDelete = draft.title.trim();
            const before = window._noticeItems.length;
            window._noticeItems = window._noticeItems.filter(function(n) {
                if ((n.title || '').trim() === titleToDelete) {
                    // 기존 알람 localStorage 키도 정리
                    [7, 3, 1, 0].forEach(function(d) {
                        try { localStorage.removeItem('notice_alarm_' + n.id + '_d' + d); } catch(e) {}
                    });
                    return false;
                }
                return true;
            });
            deletedCount = before - window._noticeItems.length;
        }
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
        return { ok: true, count: dls.length, deletedCount: deletedCount };
    };

    window._aiRegisterPendingNoticeDraft = async function(draftId, btn) {
        const pending = window._ganttQaPendingNoticeDraft;
        if (!pending || pending.id !== draftId) {
            if (window.showToast) window.showToast(window._t('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', '⚠️ This draft has already been handled or replaced by a newer draft.'), 'warning');
            window._renderGanttQaMessages();
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 등록 중...'; }
        const res = window._aiRegisterNoticeFromDraft(pending);
        window._ganttQaPendingNoticeDraft = null;
        let resText = '';
        if (res.ok) {
            const cntStr = res.count > 1 ? ` (${res.count}개 날짜 → ${res.count}건 등록)` : '';
            const delStr = res.deletedCount > 0 ? ` 기존 공지 ${res.deletedCount}건을 삭제하고 정정 등록했습니다.` : '';
            resText = delStr
                ? `✅ "${pending.title}" 공지를 정정했습니다.${cntStr}${delStr}`
                : `✅ "${pending.title}" 공지를 등록했습니다.${cntStr}`;
        } else {
            resText = `⚠️ 공지 등록 실패: ${res.error}`;
        }
        window._ganttQaHistory.push({
            role: 'ai',
            text: resText,
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
            if (window.showToast) window.showToast(window._t('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', '⚠️ This draft has already been handled or replaced by a newer draft.'), 'warning');
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
        if (!pending || pending.id !== draftId) { if (window.showToast) window.showToast(window._t('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', '⚠️ This draft has already been handled or replaced by a newer draft.'), 'warning'); window._renderGanttQaMessages(); return; }
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

    // ── 💡 [2026-09-07 신규] "다른 프로젝트에 대한 실행 요청" 확인/취소 ─────────────────────────
    window._aiCancelPendingOpenExecDraft = function(draftId) {
        if (window._ganttQaPendingOpenExecDraft && window._ganttQaPendingOpenExecDraft.id === draftId) window._ganttQaPendingOpenExecDraft = null;
        window._ganttQaHistory.push({ role: 'ai', text: window._currentLang === 'en' ? '🔓 Canceled opening the project.' : '🔓 프로젝트 열기를 취소했습니다.', uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
        window._renderGanttQaMessages();
    };
    // 💡 확인 버튼을 누르면: ① 그 프로젝트를 새 탭으로 실제로 열어(executeLoadFile — 프로젝트 열기와
    //    100% 동일한 코드경로라 autosave/실행취소/변경이력/저장충돌감지가 전부 그대로 적용됨) 진짜
    //    "현재 프로젝트"로 만든 다음 ② 같은 질문을 다시 물어서(이번엔 다른 프로젝트 컨텍스트 없이,
    //    평소와 동일한 프롬프트로) #G번호 기반 태그가 정상적으로 나오게 하고, sendGanttQaMessage와
    //    완전히 같은 후속 처리(window._aiProcessGanttQaTurn)를 거친다 — 그래서 "질문 대상으로 다른
    //    프로젝트를 고르는 것도 결국 그 프로젝트를 연 것과 동일한 조건"이라는 목표대로, 열고 난 뒤에는
    //    VIEW_MAIL(원문보기)·Gantt 이동·메일/공지/알람/행추가·수정 초안까지 전부 평소와 똑같이 동작한다.
    window._aiOpenProjectAndReask = async function(draftId, btn) {
        const _oEn = window._currentLang === 'en';
        const pending = window._ganttQaPendingOpenExecDraft;
        if (!pending || pending.id !== draftId) {
            if (window.showToast) window.showToast(_oEn ? '⚠️ This request was already handled or replaced by a newer one.' : '⚠️ 이 요청은 이미 처리되었거나 새 요청으로 대체되었습니다.', 'warning');
            window._renderGanttQaMessages();
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = _oEn ? '⏳ Opening...' : '⏳ 여는 중...'; }
        window._ganttQaPendingOpenExecDraft = null;
        const entry = pending.entry;

        try {
            if (!window.executeLoadFile) throw new Error(_oEn ? 'Could not find the project-open function.' : '프로젝트 열기 기능을 찾을 수 없습니다.');
            await window.executeLoadFile(entry.drive_file_id, entry.file_name, true); // silent=true — 안내는 아래서 직접 표시

            // 이제 그 프로젝트가 "현재 프로젝트"가 됐으므로 질문 대상 드롭다운도 되돌린다.
            window._ganttQaTargetProject = null;
            const sel = document.getElementById('gantt-qa-target-project');
            if (sel) sel.value = '';
            const input = document.getElementById('gantt-qa-input');
            if (input) input.placeholder = _oEn ? 'Ask about this project... (Enter=Send, Shift+Enter=New line)' : '이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)';

            window._ganttQaHistory.push({ role: 'ai', text: _oEn ? `🔓 Opened **[${entry.label}]** in a new tab. Continuing with your request...` : `🔓 **[${entry.label}]** 프로젝트를 새 탭으로 열었습니다. 이어서 요청하신 작업을 처리합니다...`, uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
            window._renderGanttQaMessages();

            const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
            if (!apiKey) throw new Error(_oEn ? 'No AI API key is configured.' : 'AI API 키가 설정되어 있지 않습니다.');
            const priorHistory = window._ganttQaHistory.slice();
            // 💡 이제 진짜 현재 프로젝트이므로 다른 프로젝트 컨텍스트(manualOtherProjectTexts) 없이 평소와 동일하게 질문
            const prompt = await window._buildGanttQaPrompt(pending.question, priorHistory);
            const result = await window._withTimeout(window.callAiBackend(apiKey, prompt, {}), 60000, _oEn ? '⏱️ No AI response within 60 seconds. Check your network and try again.' : '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
            if (!result.ok) throw result.error || new Error(_oEn ? 'Unknown error' : '알 수 없는 오류');
            const text = window._extractGanttQaAiText(result);

            const processed = await window._aiProcessGanttQaTurn(text, pending.question, pending.question, priorHistory, apiKey, null);
            window._ganttQaHistory.push({ role: 'ai', text: processed.text, uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), question: pending.question, mailDraftId: processed.mailDraftId, noticeDraftId: processed.noticeDraftId, alarmDraftId: processed.alarmDraftId, ganttEditDraftId: processed.ganttEditDraftId, ganttAddDraftId: processed.ganttAddDraftId, openExecDraftId: processed.openExecDraftId });
        } catch (e) {
            window._ganttQaHistory.push({ role: 'ai', text: (_oEn ? '⚠️ Error: ' : '⚠️ 오류: ') + (e && e.message ? e.message : e), error: true });
        } finally {
            window._renderGanttQaMessages();
        }
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
        if (!pending || pending.id !== draftId) { if (window.showToast) window.showToast(window._t('⚠️ 이 초안은 이미 처리되었거나 새 초안으로 대체되었습니다.', '⚠️ This draft has already been handled or replaced by a newer draft.'), 'warning'); window._renderGanttQaMessages(); return; }
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

        // 🎯 [2026-09-08 신규] GOTO_ROW — 데이터 변경 없이 화면에서 그 업무로 스크롤+하이라이트만
        //    (#G{n} 인용 클릭과 동일한 window._aiJumpToRow 재사용, window._aiAssistGotoRow 참고)
        text = text.replace(/\[\[ACTION:GOTO_ROW:(\d+)\]\]/g, function(_, n) {
            const res = window._aiAssistGotoRow(parseInt(n, 10));
            if (!res.ok) { results.push('⚠️ 해당 업무를 찾지 못해 이동하지 못했습니다 (#G' + n + ').'); return ''; }
            results.push(`📍 "${res.taskName}" 업무(#G${n})로 이동했습니다.`);
            return '';
        });

        // 💡 [2026-09-13 신규] DELETE_NOTICES — 공지 1건 이상을 즉시 삭제 (#NI 번호로 지정)
        //    되돌리기 불가 — AI가 답변 텍스트에 "다음 공지를 삭제합니다" 먼저 써주고 태그를 뒤에 붙임
        text = text.replace(/\[\[ACTION:DELETE_NOTICES:([^\]]+)\]\]/gi, function(_, refStr) {
            if (!window._aiNoticeRefMap) return '';
            const refs = refStr.split(',').map(function(r) { return r.trim().toUpperCase(); });
            let deleted = 0;
            const deletedTitles = [];
            refs.forEach(function(ref) {
                const m = ref.match(/^#?NI(\d+)$/i);
                if (!m) return;
                const id = window._aiNoticeRefMap[parseInt(m[1], 10)];
                if (!id) return;
                const item = window._noticeItems.find(function(n) { return n.id === id; });
                if (!item) return;
                deletedTitles.push('"' + (item.title || '(제목없음)') + '"');
                window._noticeItems = window._noticeItems.filter(function(n) { return n.id !== id; });
                [7, 3, 1, 0].forEach(function(d) { try { localStorage.removeItem('gantt_notice_' + id + '_d' + d); } catch(e) {} });
                deleted++;
            });
            if (deleted > 0) {
                window._noticeSave();
                if (window.renderNoticeTab) window.renderNoticeTab();
                results.push(`🗑️ 공지 ${deleted}건을 삭제했습니다: ${deletedTitles.join(', ')}`);
            } else {
                results.push('⚠️ 삭제할 공지를 찾지 못했습니다.');
            }
            return '';
        });

        // 🗂️ [2026-09-08 신규] SWITCH_TAB — Gantt 업무와 무관하게 다른 탭 자체를 열어달라는 요청
        //    (사이드바 탭 버튼 클릭과 동일한 window.switchTab 재사용, window._aiAssistSwitchTab 참고)
        text = text.replace(/\[\[ACTION:SWITCH_TAB:([a-z]+)\]\]/gi, function(_, tabName) {
            const TAB_LABELS = { summary: 'Summary', briefspec: 'Customer SPEC', mctable: 'M.C Table', elecparts: 'Elec Parts', gantt: 'Gantt chart', calendar: 'Calendar', weekly: 'Weekly Report', alarm: 'Alarm/Notice', address: 'Address' };
            const res = window._aiAssistSwitchTab(tabName);
            if (!res.ok) { results.push('⚠️ 해당 탭을 찾지 못해 이동하지 못했습니다.'); return ''; }
            results.push(`🗂️ ${TAB_LABELS[res.tabName] || res.tabName} 탭으로 이동했습니다.`);
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

    // 💡 [2026-09-07 리팩터링] AI 응답 1건에 대한 후속 처리(VIEW_MAIL/LOAD_PROJECT 왕복, 실행 태그,
    //    메일/공지/알람/Gantt수정/Gantt추가 초안 파싱)를 sendGanttQaMessage에서 분리 — "다른 프로젝트를
    //    실제로 열어서 재질문"하는 _aiOpenProjectAndReask도 완전히 같은 처리를 거쳐야 "질문 대상으로
    //    다른 프로젝트를 고르는 것도 결국 그 프로젝트를 연 것과 동일한 조건"이 되기 때문이다(원문보기·
    //    Gantt 이동·초안 확인 등 모든 기능이 프로젝트를 연 뒤에는 동일하게 동작해야 함). 이 함수 하나만
    //    고치면 두 진입점 모두에 반영된다.
    //    promptQuestion: 후속 프롬프트 재구성에 쓰는 질문(다른 프로젝트 접두사가 붙어있을 수 있음).
    //    plainQuestion: 사람이 실제로 입력한 원래 질문(히스토리 저장·초안의 재질문 용도).
    window._aiProcessGanttQaTurn = async function(text, promptQuestion, plainQuestion, priorHistory, apiKey, manualOtherProjectTexts) {
        // 💡 [2026-08-28 신규] "원문 메일도 봐줘" 대응 — AI가 [[ACTION:VIEW_MAIL:번호]] 태그로
        //    특정 업무의 원문을 요청하면(위 프롬프트의 "📧 원문 메일" 규칙), 그 태그를 사용자에게
        //    그대로 보여주는 대신 원문을 조회해 후속 프롬프트에 끼워 넣고 한 번 더 물어봐서, 사용자
        //    눈에는 "바로 원문 내용을 근거로 답한 것"처럼 보이게 한다(SET_ALARM처럼 즉시 실행되는
        //    액션이 아니라, 답을 만들기 위한 추가 조회이므로 왕복이 한 번 더 필요함).
        // 🐛 [2026-09-08 버그수정] AI가 태그 안에 공백을 넣는 등(예: "[[ ACTION : VIEW_MAIL : 199 ]]")
        //    미묘하게 다르게 써서 기존의 딱 맞아떨어지는 정규식이 매칭 못 하고, 그 결과 태그가 아무
        //    처리도 안 된 채 사용자에게 그대로 노출되던 문제 — 콜론/공백 변형을 허용하도록 완화.
        const VIEW_MAIL_RE = /\[\[\s*ACTION\s*:\s*VIEW_MAIL\s*:\s*(\d+)\s*\]\]/g;
        const mailRowIdxs = Array.from(text.matchAll(VIEW_MAIL_RE)).map(function(m) { return parseInt(m[1], 10); });
        if (mailRowIdxs.length) {
            const mailTexts = mailRowIdxs.map(window._aiAssistGetMailRaw).filter(Boolean);
            if (mailTexts.length) {
                const followupPrompt = await window._buildGanttQaPrompt(promptQuestion, priorHistory, mailTexts, manualOtherProjectTexts);
                const result2 = await window._withTimeout(window.callAiBackend(apiKey, followupPrompt, {}), 60000, '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
                if (result2.ok) text = window._extractGanttQaAiText(result2);
                else text = text.replace(VIEW_MAIL_RE, '').trim() + '\n\n⚠️ 원문 메일을 불러오는 중 오류가 발생했습니다.';
            } else {
                text = text.replace(VIEW_MAIL_RE, '').trim() + '\n\n⚠️ 해당 업무의 원문 메일을 찾지 못했습니다.';
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
                // 💡 수동으로 골라둔 프로젝트 데이터가 이미 있으면(manualOtherProjectTexts) 같이 실어 보낸다 —
                //    "선택한 프로젝트" 얘기 중에 AI가 세 번째 프로젝트까지 추가로 참조를 요청한 드문 경우 대비.
                const combinedOtherProjectTexts = (manualOtherProjectTexts || []).concat(otherProjectTexts);
                const followupPrompt2 = await window._buildGanttQaPrompt(promptQuestion, priorHistory, null, combinedOtherProjectTexts);
                const result3 = await window._withTimeout(window.callAiBackend(apiKey, followupPrompt2, {}), 60000, '⏱️ AI 응답이 60초 안에 오지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.');
                if (result3.ok) text = window._extractGanttQaAiText(result3);
                else text = text.replace(/\[\[ACTION:LOAD_PROJECT:\d+\]\]/g, '').trim() + '\n\n⚠️ 다른 프로젝트 데이터를 불러오는 중 오류가 발생했습니다.';
            } else {
                text = text.replace(/\[\[ACTION:LOAD_PROJECT:\d+\]\]/g, '').trim() + '\n\n⚠️ 해당 프로젝트를 찾지 못했습니다(삭제되었거나 접근 권한이 없을 수 있습니다).';
            }
        }

        // 💡 [2026-09-07 신규] "다른 프로젝트에 대한 원문보기/Gantt이동/실행 요청" — 위 프롬프트 규칙
        //    4번 참고. #G번호가 없는 다른 프로젝트라 즉시실행·원문보기 태그를 못 쓰므로 이 태그가
        //    나온다. 곧바로 처리하지 않고 채팅에 확인 카드만 띄우고, 실제 처리는 사람이 버튼을 눌러야
        //    window._aiOpenProjectAndReask가 그 프로젝트를 실제로 연 뒤 이 함수를 다시 거쳐 처리한다.
        const openExecMatch = text.match(/\[\[ACTION:OPEN_PROJECT_TO_EDIT:(\d+)\]\]/);
        let openExecDraftIdThisTurn = null;
        if (openExecMatch) {
            const entry = window._aiOtherProjectRefMap && window._aiOtherProjectRefMap[parseInt(openExecMatch[1], 10)];
            text = text.replace(openExecMatch[0], '').trim();
            if (entry && entry.drive_file_id) {
                const draftId = 'openexec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                window._ganttQaPendingOpenExecDraft = {
                    id: draftId,
                    entry: { drive_file_id: entry.drive_file_id, file_name: entry.file_name, label: entry.model || entry.customer || entry.file_name || (window._currentLang === 'en' ? '(untitled)' : '(이름없음)') },
                    question: plainQuestion
                };
                openExecDraftIdThisTurn = draftId;
            } else {
                text += window._currentLang === 'en'
                    ? '\n\n⚠️ Could not find the target project (it may have been deleted, or you may not have access).'
                    : '\n\n⚠️ 대상 프로젝트를 찾지 못했습니다(삭제되었거나 접근 권한이 없을 수 있습니다).';
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

        // 🛡️ [2026-09-08 신규] 최종 방어선 — 위 규칙들이 어떤 이유로든(형식이 살짝 다르거나 새로운
        //    태그를 AI가 즉흥적으로 만들어내는 등) 걸러내지 못한 내부 태그가 남아있으면, 사용자에게
        //    "[[ACTION:...]]" 같은 개발자용 문법을 그대로 노출하는 대신 조용히 지우고 안내 문구로
        //    대체한다("G199 메일 보여줘"에 AI가 태그를 냈는데 형식이 안 맞아 그대로 노출됐던 문제 대응).
        const LEFTOVER_TAG_RE = /\[\[\/?\s*(?:ACTION|MAIL_DRAFT|NOTICE_DRAFT|ALARM_DRAFT|GANTT_EDIT_DRAFT|GANTT_ADD_DRAFT)\b[^\]]*\]\]/gi;
        if (LEFTOVER_TAG_RE.test(text)) {
            console.warn('[AI 문답] 처리되지 못한 내부 태그가 남아있어 제거합니다:', text);
            text = text.replace(LEFTOVER_TAG_RE, '').trim();
            if (!text) {
                text = window._currentLang === 'en'
                    ? '⚠️ Something went wrong while handling this request. Could you try asking again (maybe with slightly different wording)?'
                    : '⚠️ 요청을 처리하는 중 문제가 발생했습니다. 표현을 조금 바꿔서 다시 한 번 질문해주시겠어요?';
            }
        }

        return {
            text: text.trim(),
            mailDraftId: mailDraftIdThisTurn,
            noticeDraftId: noticeDraftIdThisTurn,
            alarmDraftId: alarmDraftIdThisTurn,
            ganttEditDraftId: ganttEditDraftIdThisTurn,
            ganttAddDraftId: ganttAddDraftIdThisTurn,
            openExecDraftId: openExecDraftIdThisTurn
        };
    };

    // ⏳ [2026-09-08 신규] AI 응답을 기다리는 동안 "⏳ 답변 생성 중..."이 아무 변화 없이 계속 떠
    //    있으면 사용자는 멈춘 건지 진행 중인 건지 알 수 없어 불안해한다 — 특히 무료 API 등급처럼
    //    응답이 몇십 초씩 걸릴 수 있는 환경에서는 더더욱. 아직 요청이 살아있는 동안(취소된 게
    //    아니라 실제로 응답을 기다리는 중) 시간이 지날수록 "문제가 생겼다"가 아니라 "그냥 시간이
    //    좀 걸리고 있다"는 톤으로 안내 문구를 단계적으로 바꿔서 안심시킨다. 응답이 오거나(성공)
    //    실패하는 즉시(호출부 finally에서) stop()으로 남은 타이머를 정리한다.
    window._ganttQaStartWaitingHints = function() {
        const _wEn = window._currentLang === 'en';
        const steps = _wEn ? [
            { at: 7000, text: '⏳ Still working on your answer...' },
            { at: 18000, text: "⏳ Taking a little longer than usual — I'm still on it, hang tight..." },
            { at: 32000, text: '⏳ Still waiting on a response (this can happen with bigger questions or a busy AI service). Thanks for your patience...' },
            { at: 48000, text: "⏳ Almost there, or the connection may be a bit slow right now — just a bit longer..." }
        ] : [
            { at: 7000, text: '⏳ 답변을 준비하고 있어요...' },
            { at: 18000, text: '⏳ 평소보다 조금 걸리고 있어요. 계속 진행 중이니 잠시만 더 기다려주세요...' },
            { at: 32000, text: '⏳ 아직 응답을 기다리는 중이에요(질문이 크거나 AI 서버가 붐빌 때 이럴 수 있어요). 조금만 더요...' },
            { at: 48000, text: '⏳ 거의 다 됐거나 연결이 살짝 느린 상황일 수 있어요 — 곧 끝날 거예요...' }
        ];
        const timers = steps.map(function(step) {
            return setTimeout(function() {
                const hist = window._ganttQaHistory || [];
                const last = hist[hist.length - 1];
                if (last && last.pending) {
                    last.text = step.text;
                    window._renderGanttQaMessages();
                }
            }, step.at);
        });
        return function stop() { timers.forEach(clearTimeout); };
    };

    // ⬆️⬇️ [2026-09-15 신규] 입력창 질문 히스토리 — 터미널/셸처럼 위/아래 화살표로 예전에 보낸
    //    질문을 다시 불러올 수 있게 한다. localStorage에 저장해 페이지를 새로고침하거나 모달을
    //    닫았다 다시 열어도 유지된다(대화 내용 자체(window._ganttQaHistory)는 모달을 닫으면
    //    비워지지만, 이 "질문 문구만" 담은 히스토리는 "자주 쓰는 질문" 빈도 기록
    //    (gantt_qa_question_freq_v2)처럼 별도로 계속 쌓인다).
    const _QA_INPUT_HIST_KEY = 'gantt_qa_input_history_v1';
    const _QA_INPUT_HIST_MAX = 100;
    window._ganttQaInputHistory = (function() {
        try {
            const raw = localStorage.getItem(_QA_INPUT_HIST_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    })();
    window._ganttQaInputHistoryPos = -1; // -1 = 히스토리 탐색 중이 아님(지금 타이핑 중인 초안 상태)
    window._ganttQaInputDraft = ''; // 위 화살표를 처음 누르기 직전까지 입력창에 있던 내용(임시 보관)

    // sendGanttQaMessage의 모든 분기(로컬 명령이든 AI 호출이든)가 공유하는 맨 앞부분에서 딱 한 번
    // 호출된다 — 예전에 mailRaw를 여러 경유지 코드에 각각 넣어야 해서 하나씩 빠뜨리던 버그
    // 패턴(CLAUDE.md 참고)을 반복하지 않기 위해, 분기마다 따로 기록하지 않고 공용 진입점 한 곳
    // 에서만 기록한다.
    window._ganttQaRecordInputHistory = function(text) {
        if (!text) return;
        const hist = window._ganttQaInputHistory;
        if (hist.length && hist[hist.length - 1] === text) return; // 같은 질문 연속 전송은 중복 저장 안 함
        hist.push(text);
        if (hist.length > _QA_INPUT_HIST_MAX) hist.shift();
        window._ganttQaInputHistoryPos = -1; // 새 질문이 쌓이면 탐색 위치는 항상 초기화
        try { localStorage.setItem(_QA_INPUT_HIST_KEY, JSON.stringify(hist)); } catch (e) { /* 저장 실패는 무시(용량 초과 등) */ }
    };

    // 입력창(textarea)의 onkeydown이 호출하는 공용 핸들러 — Enter 전송 + 위/아래 히스토리 탐색을
    // 한 곳에서 처리한다. 여러 줄 입력(Shift+Enter로 줄바꿈) 중 커서를 위/아래로 옮기는 평소
    // 동작을 방해하지 않도록, "아직 히스토리 탐색을 시작하지 않은" 상태에서 위 화살표를 누를 때만
    // 커서가 맨 앞에 있는지 확인한다 — 일단 탐색을 시작한 뒤에는(한 번이라도 이전 질문을 불러온
    // 뒤에는) 커서 위치와 무관하게 계속 화살표로 더 훑어볼 수 있어야 자연스럽다(재귀 호출 시마다
    // 매번 "커서가 맨 앞/맨 끝"인지 다시 검사하면, 히스토리를 불러온 직후 커서가 텍스트 끝으로
    // 옮겨져 있어서 두 번째 위 화살표부터 먹통이 되는 버그가 실제로 있었음 — 브라우저 테스트로
    // 확인 후 수정, 2026-09-15).
    window._ganttQaHandleInputKeydown = function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            window.sendGanttQaMessage();
            return;
        }
        const textarea = event.target;
        const navigating = window._ganttQaInputHistoryPos !== -1;
        if (event.key === 'ArrowUp') {
            if (!navigating && (textarea.selectionStart !== 0 || textarea.selectionEnd !== 0)) return;
            const hist = window._ganttQaInputHistory || [];
            if (!hist.length) return;
            event.preventDefault();
            if (!navigating) {
                window._ganttQaInputDraft = textarea.value;
                window._ganttQaInputHistoryPos = hist.length;
            }
            if (window._ganttQaInputHistoryPos > 0) {
                window._ganttQaInputHistoryPos--;
                textarea.value = hist[window._ganttQaInputHistoryPos];
                const len = textarea.value.length;
                textarea.setSelectionRange(len, len);
            }
        } else if (event.key === 'ArrowDown') {
            if (!navigating) return; // 히스토리 탐색 중이 아니면 평소처럼 동작(다른 줄로 이동 등)
            event.preventDefault();
            const hist2 = window._ganttQaInputHistory || [];
            window._ganttQaInputHistoryPos++;
            if (window._ganttQaInputHistoryPos >= hist2.length) {
                window._ganttQaInputHistoryPos = -1;
                textarea.value = window._ganttQaInputDraft || '';
            } else {
                textarea.value = hist2[window._ganttQaInputHistoryPos];
            }
            const newLen = textarea.value.length;
            textarea.setSelectionRange(newLen, newLen);
        }
    };

    window.sendGanttQaMessage = async function() {
        const input = document.getElementById('gantt-qa-input');
        if (!input) return;
        let question = input.value.trim();
        if (!question) return;
        // 🏷 [Phase 11] 접두어(#sap / #프로젝트 / #추론)로 분류를 직접 지정한 경우 — 접두어를 떼고 그 턴에만 적용
        try { const _qpf = window._qaParsePrefix && window._qaParsePrefix(question); if (_qpf) { question = _qpf.question; window._qaTurnForced = _qpf.cls; if (!question) return; } else { window._qaTurnForced = null; } } catch (e) { /* 라우터 실패는 무시 */ }
        // 💡 [2026-09-15 신규] BOM 옵션 draft가 완료되면 "원래 질문"으로 되돌려(question 재대입)
        //    정상 AI 흐름을 재개한다(아래 BOM draft 블록 참고) — 그 경우 원래 질문은 이미 draft
        //    시작 시점에 한 번 히스토리에 들어가 있으므로, 아래(1965행 부근)에서 또 넣지 않도록
        //    이 플래그로 건너뛴다.
        let _skipUserHistoryPush = false;

        // ⬆️⬇️ [2026-09-15 신규] 입력창 히스토리에 기록 — 아래 모든 분기(로컬 명령/AI 호출)가
        //    공유하는 진입점이라 여기 한 곳에만 있으면 된다(위 히스토리 도우미 선언부 참고).
        window._ganttQaRecordInputHistory(question);

        // 🐛 [2026-09-08 버그수정] 음성문답 모드가 자동으로 전송하는 시점과 사람이 직접 전송 버튼을
        //    누르는 시점이 겹치면(예: 답변을 기다리는 동안 마이크가 계속 켜져있어 다른 말이 섞여 들어간
        //    경우) 같은 대화 배열(window._ganttQaHistory)을 두 호출이 동시에 건드려 메시지 순서가
        //    꼬이거나 화면이 멈춘 것처럼 보일 수 있다 — 이미 처리 중이면 새 호출은 조용히 무시한다.
        if (window._ganttQaSending) return;

        // 🎙️ [2026-09-08 신규] "음성기능 꺼줘"/"음성 답변 켜줘" 같은 음성 제어 명령은 AI에게 물어보지
        //    않고 여기서 바로 처리하고 끝낸다(API 키 없어도 동작, AI가 깜빡할 위험도 없음).
        const voiceCmdReply = window._ganttQaTryHandleVoiceCommand ? window._ganttQaTryHandleVoiceCommand(question) : null;
        if (voiceCmdReply) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({ role: 'ai', text: voiceCmdReply });
            input.value = '';
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // ↩️↪️ [2026-09-08 신규] "이전으로/앞으로 되돌려줘"(Ctrl+Z/Ctrl+Y) — 위 음성 명령과 동일한
        //    이유로 AI에게 묻지 않고 여기서 바로 처리한다(window._ganttQaTryHandleUndoRedoCommand 참고).
        const undoRedoReply = window._ganttQaTryHandleUndoRedoCommand ? window._ganttQaTryHandleUndoRedoCommand(question) : null;
        if (undoRedoReply) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({ role: 'ai', text: undoRedoReply });
            input.value = '';
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 🔔 [2026-09-12 신규] "알람" / "alarm" 알람 필터 로컬 명령 — API 키 없어도 동작.
        const alarmFilterReply = window._ganttQaTryHandleAlarmFilterCommand ? window._ganttQaTryHandleAlarmFilterCommand(question) : null;
        if (alarmFilterReply) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({ role: 'ai', text: alarmFilterReply });
            input.value = '';
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 🛑 [2026-09-16 신규, 실사용 버그수정] "처음부터 다시"/"취소"/"그만" — 여러 턴 draft
        //    (PO/BOM/승인원 표지/SAP 문서 모호성/드롭다운/확인버튼) 진행 중일 때, 사람이 중단·
        //    재시작을 요청하면 그 draft가 정확히 뭘 기대하고 있었든 상관없이 무조건 정리하고
        //    새 화제로 넘어갈 수 있게 한다. **반드시 아래 모든 draft별 단계 핸들러보다 먼저
        //    체크해야 함** — 실사용에서 PO "목적" 질문 단계(ask_purpose)가 "P0X 형식으로
        //    답해주세요"만 무한 반복하고 "처음부터 다시"/"취소"/"다시"류 어떤 말에도 반응하지
        //    않아, 사용자가 "잉"/"아오"까지 시도하다 결국 포기한 사고로 발견됨 — 원인은 개별
        //    단계 핸들러마다 각자 취소 키워드를 챙기는 기존 방식(`sap_prep_failed` 단계만
        //    "취소"를 인식했고, `ask_project`/`ask_buyer`/`ask_reason`/`ask_purpose` 등
        //    나머지 단계는 탈출구 자체가 없었음)이라, 새 단계를 추가할 때마다 깜빡하기 쉬웠다
        //    — 그래서 모든 draft 상태를 한 곳에서 감시하는 전역 가드로 통합했다. draft가 아예
        //    하나도 없으면(=평범한 대화 중) 이 정규식은 관여하지 않고 그냥 일반 AI 대화로
        //    흘려보낸다(안 그러면 "이 프로젝트 취소됐어?"류 정상적인 질문까지 잘못 가로챌
        //    위험이 있음) — 전체 메시지가 정확히 이 짧은 문구와 일치할 때만 매치되도록
        //    좁혀서(`sap_prep_failed`의 기존 "다시 시도" 정규식과 같은 안전장치) "취소 관련
        //    업무를 물어보는" 같은 긴 문장을 오인하지 않는다.
        const INTERRUPT_RE = /^\s*(처음부터\s*(다시)?|취소|그만|중단|초기화|리셋|cancel|reset|restart|start\s*over)\s*[.!?~]*\s*$/i;
        const hasAnyActiveQaDraft = !!(window._ganttQaPoDraft || window._ganttQaBomDraft ||
            window._ganttQaApprovalDraft || window._ganttQaSapDocClarify ||
            window._ganttQaPendingChoiceDropdown || window._ganttQaPendingConfirmButtons);
        if (hasAnyActiveQaDraft && INTERRUPT_RE.test(question)) {
            try { window._issueLogInterrupt && window._issueLogInterrupt(); } catch (e) { /* Phase 10 수집 — 실패해도 무시 */ }
            window._ganttQaPoDraft = null;
            window._ganttQaBomDraft = null;
            window._ganttQaBomResolvedOptions = null;
            window._ganttQaApprovalDraft = null;
            window._ganttQaSapDocClarify = null;
            window._ganttQaPendingChoiceDropdown = null;
            window._ganttQaPendingConfirmButtons = null;
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({ role: 'ai', text: window._t(
                '🛑 진행 중이던 작업을 중단했습니다. 새로운 질문이나 요청을 말씀해주세요.',
                "🛑 Stopped the in-progress task. Feel free to ask something new."
            )});
            input.value = '';
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 🛒 [2026-09-15 신규] "구매오더 요청" — PDF 첨부(📎) + 전송 → AI로 품목 추출 →
        //    확인/정정 → 프로젝트코드/구매담당자 사번/요청사유/목적 순차질문 → 엑셀 생성 →
        //    ZMMR060 업로드+협력사/세금코드/단가 입력 → **저장 직전 확인** → (사람이 승낙하면)
        //    저장+ZMM018 발주서 출력. 승인원 표지와 같은 "여러 턴 draft" 패턴
        //    (window._ganttQaPoDraft). 실제 SAP 저장은 되돌리기 번거로운 동작이라 사람 확인
        //    없이 자동 실행하지 않기로 사용자와 명시적으로 합의함(CLAUDE.md 참고) — 반드시
        //    다른 모든 로컬 명령보다 먼저 체크해야 함(트리거 단어 없는 후속 답변이 엉뚱하게
        //    다른 로컬 명령/일반 AI 질문으로 새면 안 되므로, 첨부 자체가 유일한 용도인 지금은
        //    최우선 순위로 둠).
        const pastedPoContext = window._ganttQaExtractPastedPoContext(question);
        if (window._ganttQaPoDraft || (window._ganttQaPendingAttachments && window._ganttQaPendingAttachments.length) || pastedPoContext) {
            const apiKeyForPo = window.getActiveAiKey ? window.getActiveAiKey() : null;
            if (!apiKeyForPo && !window._ganttQaPoDraft) {
                alert(window._t('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.', 'Please enter and save your AI API key in [🤖 AI Tools → ⚙️ Settings → AI Analysis Settings] first.'));
                return;
            }
            const replyText = question.trim();

            // 🐛 [2026-09-15 실사용 버그수정] 새 첨부(📎)가 있으면 이미 진행 중이던 draft가
            // 있어도(이전 문서에 대한 확인/정정을 마치지 않고 새 파일을 첨부한 경우) 항상
            // 새 파일로 다시 시작한다 — 원래는 `!window._ganttQaPoDraft`일 때만 새로
            // 추출해서, draft가 남아있는 상태에서 다른 문서를 새로 첨부하면 그 새 파일은
            // 조용히 무시되고 계속 "이전 정보만 출력"되던 버그가 실사용에서 확인됨(첨부
            // 자체가 "이 문서로 다시 하겠다"는 의사표시이므로, 새 첨부가 항상 우선).
            // 📋 [2026-09-16 신규] 붙여넣은 PO 텍스트(pastedPoContext)도 같은 분기로 합류—
            // "가짜 첨부" `[{name:'(붙여넣은 텍스트)', text: question}]`로 감싸서 기존 추출
            // 경로를 그대로 재사용한다(새 fetch/파싱 로직 없음, 이 세션 전체의 설계 원칙과
            // 동일). pastedPoContext는 위 헬퍼가 이미 "draft 없음 + 첨부 없음"만 통과시키므로
            // 여기서 다시 그 조건을 검사할 필요 없음.
            if ((window._ganttQaPendingAttachments && window._ganttQaPendingAttachments.length) || pastedPoContext) {
                window._ganttQaPoDraft = null;
                window._ganttQaHistory.push({ role: 'user', text: question });
                input.value = '';
                const attachments = pastedPoContext
                    ? [{ name: window._t('(붙여넣은 텍스트)', '(pasted text)'), text: question }]
                    : window._ganttQaPendingAttachments.slice();
                window._ganttQaPendingAttachments = [];
                window._ganttQaRenderAttachmentStrip();
                // 💡 [2026-09-17 신규, 사용자 요청] "세금계산서/거래명세서 복수 처리" — 첨부된
                // 파일이 여러 개면 파일마다 별도 문서로 보고 각각 추출한다(파일 1개=문서 1개는
                // 기존과 100% 동일한 동작). 아래 `docs` 배열이 이번 요청의 핵심 자료구조.
                window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t(`첨부 파일 ${attachments.length}건에서 품목 정보를 추출하는 중...`, `Extracting line items from ${attachments.length} attached file(s)...`), pending: true });
                window._renderGanttQaMessages();
                try {
                    const { docs, errors } = await window._ganttQaExtractPoDocumentsViaAi(apiKeyForPo, attachments);
                    // 🔽 [2026-09-18 설계 변경, 사용자 요청] 프로젝트코드/사번/요청사유/목적은
                    // 더 이상 pd(배치 전체) 레벨의 "모든 문서 공통" 값이 아니라 문서(doc)별로
                    // 따로 받는다 — "복수 발주서라면 필수 입력값이 전부 다를 것으로 판단하는 게
                    // 기본값이어야 한다. 값이 겹치는 건 오히려 드문 경우"라는 사용자 판단을 반영.
                    // 아래 _ganttQaPoAskFieldsPrompt/_ganttQaParsePoFieldsInto 참고.
                    window._ganttQaPoDraft = { stage: 'confirm_items', docs: docs };
                    window._ganttQaHistory.pop();
                    let summaryText = window._ganttQaPoBatchSummaryText(docs);
                    if (errors.length) {
                        summaryText = window._t(`⚠️ 일부 파일은 추출에 실패해 건너뛰었습니다(${errors.length}건): ${errors.join('; ')}\n\n`, `⚠️ Skipped ${errors.length} file(s) that failed to extract: ${errors.join('; ')}\n\n`) + summaryText;
                    }
                    window._ganttQaShowConfirmButtons(summaryText,
                        [{ label: window._t('✅ 확인', '✅ Confirm'), value: window._t('확인', 'confirm'), style: 'confirm' }]);
                } catch (e) {
                    window._ganttQaHistory.pop();
                    window._ganttQaHistory.push({ role: 'ai', text: '⚠️ ' + window._t('품목 추출 실패: ', 'Failed to extract line items: ') + (e && e.message ? e.message : e) });
                }
                window._renderGanttQaMessages();
                input.focus();
                return;
            }

            // ── 기존 draft 이어서 처리(새 첨부가 없을 때만 여기 도달) ──
            const pd = window._ganttQaPoDraft;
            window._ganttQaHistory.push({ role: 'user', text: question });
            input.value = '';

            if (pd.stage === 'confirm_items') {
                if (/^(확인|네|맞아|맞습니다|ok|okay|confirm|yes)\b/i.test(replyText) || /^(확인|네)$/.test(replyText)) {
                    window._ganttQaPoAdvanceAfterItemsConfirmed(pd);
                } else {
                    // 확인이 아니면 정정 지시로 간주 — AI에게 배치 전체를 다시 추출하게 맡긴다
                    // (별도 파싱 없음 — 이 세션의 "드롭다운/버튼은 입력 방식만 바꾼다" 원칙을
                    // 문서 여러 건짜리 배치로 확장한 것).
                    window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t('정정 사항을 반영해서 다시 추출하는 중...', 'Re-extracting with your correction...'), pending: true });
                    window._renderGanttQaMessages();
                    try {
                        const newDocs = await window._ganttQaExtractPoDocumentsCorrectionViaAi(apiKeyForPo, pd.docs, replyText);
                        pd.docs = newDocs;
                        window._ganttQaHistory.pop();
                        window._ganttQaShowConfirmButtons(window._ganttQaPoBatchSummaryText(pd.docs),
                            [{ label: window._t('✅ 확인', '✅ Confirm'), value: window._t('확인', 'confirm'), style: 'confirm' }]);
                    } catch (e) {
                        window._ganttQaHistory.pop();
                        window._ganttQaHistory.push({ role: 'ai', text: '⚠️ ' + window._t('재추출 실패: ', 'Re-extraction failed: ') + (e && e.message ? e.message : e) });
                    }
                }
                window._renderGanttQaMessages();
                input.focus();
                return;
            }

            // 💡 [2026-09-17 신규] 협력사 사업자등록번호가 확인 안 된 문서가 있으면 여기서
            // 잡는다 — 문서 번호를 붙여("1번: 2168144558") 여러 건을 한 메시지에 같이 고칠 수
            // 있고, 문서가 1건뿐이면 번호만 말해도 된다(기존 단일 문서 동작과 동일).
            if (pd.stage === 'fix_biznos') {
                const pairs = Array.from(replyText.matchAll(/(\d+)\s*번\s*[:：]?\s*(\d{3}-?\d{2}-?\d{5}|\d{10})/g));
                let applied = 0;
                if (pairs.length) {
                    pairs.forEach(function(m) {
                        const idx = parseInt(m[1], 10) - 1;
                        if (pd.docs[idx]) { pd.docs[idx].bizRegNo = m[2].replace(/-/g, ''); applied++; }
                    });
                } else {
                    const stillMissing = window._ganttQaPoFindMissingBizNoDocs(pd.docs);
                    const bare = replyText.match(/\d{3}-?\d{2}-?\d{5}|\b\d{10}\b/);
                    if (bare && stillMissing.length === 1) {
                        pd.docs[stillMissing[0].idx].bizRegNo = bare[0].replace(/-/g, '');
                        applied++;
                    }
                }
                if (!applied) {
                    window._ganttQaHistory.push({ role: 'ai', text: window._t('사업자등록번호를 인식하지 못했습니다 — "1번: 2168144558"처럼 문서 번호와 함께 알려주세요.', 'Could not recognize a business registration number — please include the document number, e.g. "1: 2168144558".') });
                } else {
                    window._ganttQaPoAdvanceAfterItemsConfirmed(pd);
                }
                window._renderGanttQaMessages();
                input.focus();
                return;
            }

            // 🔽 [2026-09-18 설계 변경, 사용자 요청] 프로젝트코드/사번/요청사유/목적은 이제
            // 문서(doc)별로 따로 받는 게 기본값이다 — "복수 발주서면 필수 입력값이 전부 다를
            // 것으로 가정하는 게 맞고, 값이 겹치는 건 오히려 드문 경우"라는 사용자 판단 반영.
            // 문서가 1건뿐이면 번호 없이 그대로(기존 동작 그대로), 2건 이상이면 "N번: ..."
            // 형식(문서별) 또는 드문 경우를 위한 "전체 동일: ..." 지름길 중 하나로 받는다.
            // 사번(배치 전체 공통, 한 번만) — 라벨("사번: X")이 있으면 그 값을, 없으면 이 단계가
            // 사번만 묻고 있으므로 4~12자리 숫자 하나를 그대로 사번으로 받는다.
            if (pd.stage === 'ask_buyer') {
                const labeled = replyText.match(/(?:구매담당자\s*)?사번(?:은|는|가|이)?\s*[:：]?\s*(\d{4,12})/);
                const bare = labeled ? null : replyText.match(/\b\d{4,12}\b/);
                const emp = labeled ? labeled[1] : (bare ? bare[0] : '');
                if (emp) {
                    pd.buyerEmpId = emp;
                    window._ganttQaPoAdvanceAfterItemsConfirmed(pd);
                } else {
                    window._ganttQaHistory.push({ role: 'ai', text: window._t(
                        '사번을 인식하지 못했습니다 — 숫자로만 알려주세요(예: 2004051002).',
                        "Couldn't recognize the employee ID — please give digits only (e.g. 2004051002)."
                    )});
                }
                window._renderGanttQaMessages();
                input.focus();
                return;
            }

            if (pd.stage === 'ask_fields') {
                // 사번을 이 단계에서 "사번은 X"로 고쳐 말해도 반영(공통값이라 문서 번호 불필요)
                const empFix = replyText.match(/(?:구매담당자\s*)?사번(?:은|는|가|이)?\s*[:：]?\s*(\d{4,12})/);
                if (empFix) pd.buyerEmpId = empFix[1];
                const isMulti = pd.docs.length > 1;
                if (!isMulti) {
                    window._ganttQaParsePoFieldsInto(pd.docs[0], replyText);
                } else {
                    // ① "전체 동일: ..." — 드문 경우를 위한 지름길, 모든 문서에 같은 텍스트를 적용
                    const allSameMatch = replyText.match(/^\s*(?:전체\s*동일|모두\s*동일|전부\s*동일|공통|same\s*for\s*all|all\s*same)\s*[:：]?\s*([\s\S]+)$/i);
                    if (allSameMatch) {
                        pd.docs.forEach(function(doc) { window._ganttQaParsePoFieldsInto(doc, allSameMatch[1]); });
                    } else {
                        // ② "N번: ..." (또는 "N: ...") — 문서별 답변. "번"은 선택(영문 입력 대응).
                        const perDocLines = Array.from(replyText.matchAll(/(\d+)\s*번?\s*[:：]\s*([^\n]+)/g));
                        if (perDocLines.length) {
                            perDocLines.forEach(function(m) {
                                const idx = parseInt(m[1], 10) - 1;
                                if (pd.docs[idx]) window._ganttQaParsePoFieldsInto(pd.docs[idx], m[2]);
                            });
                        } else {
                            // ③ 문서 번호를 안 붙였어도, 아직 미완성인 문서가 정확히 1건이면
                            //    단일 문서 UX와 동일하게 그 문서에 그대로 적용(편의상 폴백).
                            const incompleteNow = pd.docs.filter(window._ganttQaPoDocIsIncomplete);
                            if (incompleteNow.length === 1) {
                                window._ganttQaParsePoFieldsInto(incompleteNow[0], replyText);
                            }
                            // 그 외(2건 이상 미완성인데 번호도 없음)는 아무 것도 채우지 않고
                            // 아래 재질문에서 "문서 번호를 붙여달라"는 안내를 다시 보여준다.
                        }
                    }
                }

                const stillIncomplete = pd.docs.some(window._ganttQaPoDocIsIncomplete);
                if (stillIncomplete) {
                    window._ganttQaPoAskFieldsPrompt(pd, window._t('아직 필요한 정보가 있습니다.', 'A bit more info is still needed.'));
                    window._renderGanttQaMessages();
                    input.focus();
                    return;
                }

                // ✅ [2026-09-17 신규, 사용자 요청] 여기서부터는 더 이상 사람에게 묻지 않고
                // 문서마다 엑셀 생성 ~ SAP 저장 ~ 발주서 출력까지 전부 자동으로 진행한다 —
                // "SAP 입력하는 시간이 기니까 처음 한 번만 확인하고 후단은 전부 자동으로,
                // 자리를 비웠다 와도 다 되어있도록" 요청 반영. 기존엔 저장 직전에 반드시
                // 멈춰 사람 확인을 받도록 설계했었는데(CLAUDE.md 참고), 이번에 명시적으로
                // 뒤집힌 결정이다.
                window._ganttQaHistory.push({ role: 'ai', text: window._t(
                    `✅ 확인했습니다. 총 ${pd.docs.length}건의 구매오더를 자동으로 순차 처리합니다 — 완료될 때까지 기다려주시거나 나중에 다시 확인해주세요.`,
                    `✅ Got it. Automatically processing ${pd.docs.length} purchase order(s) in sequence — this may take a while, feel free to check back later.`
                )});
                window._renderGanttQaMessages();
                await window._ganttQaRunPoBatchAutomatically(pd);
                window._renderGanttQaMessages();
                input.focus();
                return;
            }
        }

        // 📋 [2026-09-15 신규] "SAP에서 104477 승인원 표지 생성해줘" — 사내 별도 데스크톱 앱
        //    ("연구소 가이드 시스템")의 exe를 분석해서 그대로 재현한 기능(자세한 재현 과정은
        //    CLAUDE.md 참고). 출력형식/담당자/팀장/가승인원 여부처럼 한 메시지에 다 안 들어올
        //    수 있는 항목이 많아, 다른 SAP 로컬 명령과 달리 대화가 여러 턴에 걸쳐 이어질 수
        //    있는 유일한 경우 — window._ganttQaApprovalDraft에 지금까지 파악된 값을 계속
        //    누적하다가 필수 항목이 다 모이면 그때 실제로 SAP 조회 + 파일 생성을 진행한다.
        //    반드시 아래 배치 다운로드/단일 문서 열기 판정보다 먼저 체크해야 함 — "승인원"이라는
        //    단어 자체는 저 판정들과 겹치지 않지만, 답변 대기 중(예: "담당자는 홍길동, 팀장은
        //    김철수요"처럼 트리거 단어 없이 값만 채우는 후속 메시지)에는 이 블록이 먼저
        //    가로채지 않으면 그 메시지가 엉뚱하게 일반 AI 질문으로 새어나간다.
        const approvalDraft = window._ganttQaExtractApprovalUpdate ? window._ganttQaExtractApprovalUpdate(question) : null;
        if (approvalDraft) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            input.value = '';

            const missing = [];
            if (!approvalDraft.format) missing.push(window._t('출력 형식(엑셀/워드/둘 다)', 'output format (Excel/Word/both)'));
            if (!approvalDraft.writer) missing.push(window._t('담당자(Checked by) 이름', "the preparer's (Checked by) name"));
            if (!approvalDraft.leader) missing.push(window._t('팀장(Approved by) 이름', "the team leader's (Approved by) name"));
            if (approvalDraft.isPre === undefined) missing.push(window._t('가승인원 여부(정식승인원 / 가승인원)', 'whether this is a provisional approval (formal / provisional)'));

            if (missing.length) {
                // 🔽 [2026-09-17 신규, 사용자 요청] "드롭다운/클릭이 안 되어 있다"는 제보로
                // 발견 — 이 질문은 4개 항목을 텍스트 한 덩어리로만 물어봐서, 그중 정해진
                // 선택지가 있는 "출력 형식"/"가승인원 여부"까지 전부 타이핑해야 했다. 위
                // "🔽 AI 문답 객관식 질문 — 드롭다운" 원칙(정해진 목록에서 고르는 질문은 항상
                // 드롭다운)이 이 두 항목엔 적용이 안 돼 있었던 것 — 이름(담당자/팀장)은 정해진
                // 목록이 없으니 그대로 자유 텍스트로 남겨두고, 나머지 둘만 BOM 옵션 드롭다운과
                // 같은 "항목마다 다른 선택지" 멀티 드롭다운으로 전환한다. 선택 결과는 기존
                // `_ganttQaExtractApprovalUpdate`의 키워드 매칭(예: "엑셀"/"정식승인원")과
                // 그대로 맞아떨어지는 문자열로 합성해 흘려보내므로 파서는 전혀 안 건드림.
                const matLabel = approvalDraft.materials.join(', ');
                const categoricalMissing = [];
                if (!approvalDraft.format) {
                    categoricalMissing.push({
                        label: window._t('출력 형식', 'Output format'),
                        options: [
                            { value: '엑셀', label: window._t('엑셀', 'Excel') },
                            { value: '워드', label: window._t('워드', 'Word') },
                            { value: '둘 다', label: window._t('둘 다', 'Both') }
                        ]
                    });
                }
                if (approvalDraft.isPre === undefined) {
                    categoricalMissing.push({
                        label: window._t('가승인원 여부', 'Provisional approval?'),
                        options: [
                            { value: '정식승인원', label: window._t('정식승인원', 'Formal approval') },
                            { value: '가승인원', label: window._t('가승인원', 'Provisional approval') }
                        ]
                    });
                }
                const nameMissing = [];
                if (!approvalDraft.writer) nameMissing.push(window._t('담당자(Checked by) 이름', "the preparer's (Checked by) name"));
                if (!approvalDraft.leader) nameMissing.push(window._t('팀장(Approved by) 이름', "the team leader's (Approved by) name"));
                const nameLine = nameMissing.length
                    ? window._t(`\n\n그리고 아래 이름도 이어서 말씀해주세요:\n- ${nameMissing.join('\n- ')}`, `\n\nAlso, please reply with:\n- ${nameMissing.join('\n- ')}`)
                    : '';
                const reply = window._t(
                    `📋 자재 "${matLabel}"의 승인원 표지를 만들려면 아래 항목이 더 필요합니다.`,
                    `📋 To generate the approval cover for material(s) "${matLabel}", I still need the following.`
                ) + nameLine + window._t(
                    '\n\n(Revision 번호와 Remark는 생략하면 각각 "00"/빈 비고로 자동 처리됩니다)',
                    '\n\n(Revision number and Remark default to "00" / blank if omitted)'
                );
                if (categoricalMissing.length) {
                    const dropdownId = 'approval-choice-' + Date.now();
                    window._ganttQaPendingChoiceDropdown = {
                        id: dropdownId, multi: true,
                        items: categoricalMissing,
                        buildAnswerText: function(selections) {
                            return selections.filter(function(v) { return !!v; }).join(', ');
                        }
                    };
                    window._ganttQaHistory.push({ role: 'ai', choiceDropdownId: dropdownId, text: reply });
                } else {
                    window._ganttQaHistory.push({ role: 'ai', text: reply });
                }
                window._renderGanttQaMessages();
                input.focus();
                return;
            }

            window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t('SAP에서 자재정보를 조회하는 중...', 'Looking up material info in SAP...'), pending: true });
            window._renderGanttQaMessages();
            let finalReply;
            try {
                let fetched = approvalDraft.fetched;
                if (!fetched) {
                    const fres = await window._withTimeout(
                        fetch('http://127.0.0.1:5000/sap-approval-fetch?materials=' + encodeURIComponent(approvalDraft.materials.join(','))),
                        Math.min(180000, 20000 + 8000 * approvalDraft.materials.length),
                        window._t('SAP 승인원 정보 조회 시간 초과', 'SAP approval info lookup timed out')
                    );
                    fetched = await fres.json();
                    approvalDraft.fetched = fetched;
                }
                if (!fetched.ok) {
                    finalReply = '⚠️ ' + window._t('SAP 조회 실패: ', 'SAP lookup failed: ') + (fetched.error || window._t('알 수 없는 오류', 'unknown error'));
                } else {
                    const failItems = (fetched.results || []).filter(function(r) { return !r.ok; });
                    const pendingIdx = window._ganttQaHistory.length - 1;
                    if (window._ganttQaHistory[pendingIdx]) {
                        window._ganttQaHistory[pendingIdx].text = '⏳ ' + window._t('표지 파일을 생성하는 중...', 'Generating cover files...');
                        window._renderGanttQaMessages();
                    }
                    const gres = await window._withTimeout(
                        fetch('http://127.0.0.1:5000/sap-approval-generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                results: fetched.results, format: approvalDraft.format,
                                writer: approvalDraft.writer, leader: approvalDraft.leader,
                                is_pre: approvalDraft.isPre, rev: approvalDraft.rev || '00',
                                remark: approvalDraft.remark || ''
                            })
                        }),
                        60000, window._t('승인원 표지 생성 시간 초과', 'Approval cover generation timed out')
                    );
                    const gdata = await gres.json();
                    if (gdata.ok) {
                        finalReply = '📄 ' + (gdata.message || window._t('승인원 표지가 생성되었습니다.', 'Approval cover generated.'));
                        if (failItems.length) {
                            finalReply += '\n\n' + window._t('⚠️ 조회 실패해서 제외된 자재: ', '⚠️ Materials excluded due to lookup failure: ')
                                + failItems.map(function(f) { return f.code + (f.err ? `(${f.err})` : ''); }).join(', ');
                        }
                    } else {
                        finalReply = '⚠️ ' + window._t('표지 생성 실패: ', 'Failed to generate cover: ') + (gdata.error || window._t('알 수 없는 오류', 'unknown error'));
                    }
                }
            } catch (e) {
                finalReply = '⚠️ ' + window._t('승인원 표지 생성 중 오류: ', 'Error while generating the approval cover: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: finalReply });
            window._ganttQaApprovalDraft = null; // 성공/실패 무관하게 완료 후 초기화 — 다음 요청은 새로 시작
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 🤔 [2026-09-15 신규, 사용자 요청] SAP 문서 "출력" 모호성 해소 — 아래 배치 다운로드/단일
        //    열기/문서 목록 판정들보다 먼저 체크해야 함(승인원 표지와 같은 이유: 트리거 단어 없는
        //    후속 답변이 엉뚱하게 일반 AI 질문으로 새어나가면 안 됨). sapDocQuestion은 실제로
        //    아래 세 판정 함수에 넘길 "유효 질문" — 애매해서 되묻는 중이면 사람의 짧은 답("저장
        //    해줘"/"목록만 보여줘"/"P01")만으로는 저 판정 함수들이 인식 못 하므로, 기억해둔
        //    자재번호를 다시 붙여서 합성한다(각 판정 함수가 요구하는 "열어/저장/문서" 등 동사가
        //    포함되도록 합성 문구를 고름 — 예: 단일 자재 저장 의도는 실제로는 open_document가
        //    다운로드+열기를 같이 하므로 "열어줘"로 합성).
        let sapDocQuestion = question;
        if (window._ganttQaSapDocClarify) {
            const clarify = window._ganttQaSapDocClarify;
            const replyText = question.trim();
            if (clarify.stage === 'action') {
                // 💡 [2026-09-16] 클릭형 확인 버튼(위 window._ganttQaShowConfirmButtons)이 영문
                // 모드에서는 "save"/"show list"처럼 영문 문구를 그대로 사용자 메시지로 보내므로,
                // 원래 한국어 키워드만 인식하던 이 정규식이 영문 버튼 클릭에도 반응하도록 확장함
                // (기존엔 영문 사용자가 자유 텍스트로 "save"라고 타이핑해도 애초에 인식이 안 되던
                // 잠재 버그였는데, 버튼이 생기면서 이 경로를 훨씬 더 자주 타게 돼 같이 고침).
                const wantsSave = /(저장|다운로드|save|download)/i.test(replyText);
                const wantsList = /(목록|보여|출력|list|show)/i.test(replyText);
                if (wantsSave && !wantsList) {
                    if (clarify.materials.length >= 2) {
                        sapDocQuestion = clarify.materials.join(',') + ' 문서 저장해줘';
                        window._ganttQaSapDocClarify = null;
                    } else {
                        window._ganttQaHistory.push({ role: 'user', text: question });
                        input.value = '';
                        clarify.stage = 'docType';
                        window._ganttQaHistory.push({ role: 'ai', text: window._t(
                            `📄 어떤 문서 타입을 저장할까요? (예: P01) — 어떤 문서가 있는지 먼저 보고 싶으시면 "목록"이라고 말씀해주세요.`,
                            `📄 Which document type would you like to save? (e.g. P01) — If you'd like to see what's available first, just say "list".`
                        )});
                        window._renderGanttQaMessages();
                        input.focus();
                        return;
                    }
                } else if (wantsList) {
                    sapDocQuestion = clarify.materials[0] + ' 문서 목록 보여줘';
                    window._ganttQaSapDocClarify = null;
                } else {
                    // 답을 못 알아들었거나 완전히 다른 얘기로 넘어감 — 조용히 해제하고 평소처럼 처리
                    // (원본 question 그대로, sapDocQuestion도 원본 유지).
                    window._ganttQaSapDocClarify = null;
                }
            } else if (clarify.stage === 'docType') {
                const wantsList2 = /(목록|보여)/.test(replyText);
                if (wantsList2) {
                    sapDocQuestion = clarify.materials[0] + ' 문서 목록 보여줘';
                    window._ganttQaSapDocClarify = null;
                } else {
                    const dt = window._ganttQaExtractSapDocTypeCode(replyText);
                    if (dt) {
                        sapDocQuestion = clarify.materials[0] + ' ' + dt + ' 문서 열어줘';
                        window._ganttQaSapDocClarify = null;
                    } else {
                        window._ganttQaHistory.push({ role: 'user', text: question });
                        input.value = '';
                        window._ganttQaHistory.push({ role: 'ai', text: window._t(
                            `📄 문서 타입을 못 알아들었어요 — "P01"처럼 알파벳+숫자 형식으로 다시 말씀해주시거나 "목록"이라고 해주세요.`,
                            `📄 I couldn't recognize that document type — please reply with a format like "P01", or say "list".`
                        )});
                        window._renderGanttQaMessages();
                        input.focus();
                        return;
                    }
                }
            }
        } else {
            const ambiguousMats = window._ganttQaExtractSapDocAmbiguous ? window._ganttQaExtractSapDocAmbiguous(question) : null;
            if (ambiguousMats) {
                window._ganttQaHistory.push({ role: 'user', text: question });
                input.value = '';
                window._ganttQaSapDocClarify = { materials: ambiguousMats, stage: 'action' };
                const matLabel = ambiguousMats.join(', ');
                window._ganttQaShowConfirmButtons(
                    window._t(`📄 자재 "${matLabel}"의 문서, 어떻게 도와드릴까요?`, `📄 What would you like me to do with the document(s) for material "${matLabel}"?`),
                    [
                        { label: window._t('💾 저장(다운로드)', '💾 Save (download)'), value: window._t('저장해줘', 'save'), style: 'confirm' },
                        { label: window._t('📋 목록만 보기', '📋 Show list only'), value: window._t('목록 보여줘', 'show list'), style: 'neutral' }
                    ]
                );
                window._renderGanttQaMessages();
                input.focus();
                return;
            }
        }

        // 📐 [2026-09-15 신규, 사용자 요청] "SAP에서 502572 BOM 열어줘" — 조회 전에 Explosion
        //    type/Show price/Location Information 옵션을 반드시 먼저 물어보고, 복수(ZPP038)/
        //    단일(ZPP033) 트랜잭션도 "복수/다중" vs "단일/단수" 워딩으로 판정(애매하면 되물음)한
        //    뒤에만 실제 조회를 실행한다 — 실제 ZPP038 초기화면 캡처(Explosion type/Option을
        //    빨간 박스로 표시)를 보여주며 요청. 반드시 사용처(역전개)/배치 다운로드/문서 열기
        //    판정보다 먼저 체크해야 함(트리거 단어 없는 옵션 답변이 다른 로컬 명령으로 새면 안
        //    되고, 무엇보다 "옵션을 안 물어보고 그냥 조회부터 실행"하는 사고를 막아야 하므로 —
        //    아래 2000행대의 _questionMentionsSapIntent 게이트/_aiFetchSapContext의 bomMatch
        //    분기가 실행되기 전에 여기서 먼저 가로채야 한다). 옵션이 다 모이면(같은 메시지에
        //    이미 다 있으면 즉시, 아니면 되물어서) window._ganttQaBomResolvedOptions에 1회성으로
        //    남겨두고 question을 원래 질문으로 되돌려 아래 정상 흐름(로컬명령/AI 호출)이 그대로
        //    이어지게 한다("승인원 표지"처럼 완전히 새 fetch/응답 로직을 만들지 않고, 이미 있는
        //    BOM 자동조회+AI 응답 경로를 재사용하기 위함).
        if (window._ganttQaBomDraft) {
            const bd = window._ganttQaBomDraft;
            const replyText = question.trim();
            if (bd.stage === 'tcode') {
                if (/(복수|다중|multi)/i.test(replyText)) bd.useSingleTcode = false;
                else if (/(단일|single)/i.test(replyText)) bd.useSingleTcode = true;
                else {
                    window._ganttQaHistory.push({ role: 'user', text: question });
                    input.value = '';
                    window._ganttQaHistory.push({ role: 'ai', text: window._t(
                        '"단일" 또는 "복수"로 답해주세요.', 'Please reply "single" or "multiple".'
                    )});
                    window._renderGanttQaMessages();
                    input.focus();
                    return;
                }
                bd.stage = 'options';
                window._ganttQaHistory.push({ role: 'user', text: question });
                input.value = '';
                window._ganttQaShowBomOptionsDropdown(bd.materials);
                window._renderGanttQaMessages();
                input.focus();
                return;
            }
            if (bd.stage === 'options') {
                const parsed = window._ganttQaParseBomOptionReply(replyText);
                if (parsed.explosion !== undefined) bd.explosion = parsed.explosion;
                if (parsed.showPrice !== undefined) bd.showPrice = parsed.showPrice;
                if (parsed.showLocation !== undefined) bd.showLocation = parsed.showLocation;
                if (parsed.layout !== undefined) bd.layout = parsed.layout;
                if (bd.explosion === undefined) bd.explosion = 'single';
                if (bd.showPrice === undefined) bd.showPrice = false;
                if (bd.showLocation === undefined) bd.showLocation = false;
                if (bd.layout === undefined) bd.layout = '/STD_MC'; // 🆕 레이아웃을 안 고르면 기존 기본값 유지

                window._ganttQaHistory.push({ role: 'user', text: question });
                input.value = '';
                window._ganttQaBomResolvedOptions = {
                    materialsKey: bd.materials.slice().sort().join(','),
                    useSingleTcode: bd.useSingleTcode, explosion: bd.explosion,
                    showPrice: bd.showPrice, showLocation: bd.showLocation, layout: bd.layout
                };
                question = bd.originalQuestion; // 원래 질문으로 되돌려 정상 흐름 재개
                sapDocQuestion = question;
                _skipUserHistoryPush = true; // 원래 질문은 draft 시작 시점에 이미 한 번 히스토리에 들어갔음
                window._ganttQaBomDraft = null;
                // return하지 않고 아래로 계속 진행(정상 로컬명령/AI 흐름 재개)
            }
        } else {
            const bomTrig = window._ganttQaExtractBomTrigger(question);
            if (bomTrig) {
                let useSingleTcode; // undefined = 자재 개수로 자동 결정
                if (/(복수|다중)/.test(question)) useSingleTcode = false;
                else if (/(단일|단수)/.test(question)) useSingleTcode = true;

                if (useSingleTcode === true && bomTrig.materials.length >= 2) {
                    window._ganttQaHistory.push({ role: 'user', text: question });
                    input.value = '';
                    window._ganttQaBomDraft = { materials: bomTrig.materials, originalQuestion: question, stage: 'tcode' };
                    window._ganttQaShowBomTcodeDropdown(bomTrig.materials.length);
                    window._renderGanttQaMessages();
                    input.focus();
                    return;
                }
                if (useSingleTcode === undefined) useSingleTcode = bomTrig.materials.length <= 1;

                const inlineOpts = window._ganttQaParseBomOptionReply(question);
                if (inlineOpts.explosion === undefined || inlineOpts.showPrice === undefined || inlineOpts.showLocation === undefined) {
                    window._ganttQaHistory.push({ role: 'user', text: question });
                    input.value = '';
                    window._ganttQaBomDraft = {
                        materials: bomTrig.materials, originalQuestion: question, useSingleTcode: useSingleTcode,
                        explosion: inlineOpts.explosion, showPrice: inlineOpts.showPrice, showLocation: inlineOpts.showLocation,
                        stage: 'options'
                    };
                    window._ganttQaShowBomOptionsDropdown(bomTrig.materials);
                    window._renderGanttQaMessages();
                    input.focus();
                    return;
                }
                // 옵션이 한 메시지에 전부 이미 있음 — 되묻지 않고 바로 진행. 레이아웃은
                // 이 "이미 다 있으면 안 물어보고 진행" 판정에서 제외된 선택 항목이라(위
                // if문이 explosion/showPrice/showLocation만 검사) 안 왔으면 조용히 기본값.
                window._ganttQaBomResolvedOptions = {
                    materialsKey: bomTrig.materials.slice().sort().join(','),
                    useSingleTcode: useSingleTcode, explosion: inlineOpts.explosion,
                    showPrice: inlineOpts.showPrice, showLocation: inlineOpts.showLocation,
                    layout: inlineOpts.layout || '/STD_MC'
                };
                // question은 그대로 두고 아래 정상 흐름(로컬명령/AI 호출)으로 계속 진행 — return 없음
            }
        }

        // 🔍 [2026-09-16 신규] "*01+01*500*로 조회된 아이템 승인원 다운로드해줘" — 와일드카드
        //    패턴(*가 포함된 토큰)이 있으면 자재번호를 직접 나열하는 아래 배치 다운로드 판정보다
        //    먼저 체크한다(패턴 자체가 이미 자재번호 목록과는 성격이 다른, 훨씬 더 구체적인
        //    신호라 순서 문제로 다른 핸들러와 충돌할 일은 적지만, 이 프로젝트의 기존 관례대로
        //    "더 구체적인 요청을 먼저 확인"하는 순서를 지킨다).
        const sapPatternReq = window._ganttQaExtractSapPatternDownloadRequest ? window._ganttQaExtractSapPatternDownloadRequest(sapDocQuestion) : null;
        if (sapPatternReq) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({
                role: 'ai',
                text: '⏳ ' + window._t(
                    `SAP에서 "${sapPatternReq.pattern}" 패턴으로 자재를 조회한 뒤 "${sapPatternReq.docType}" 문서를 일괄 다운로드하는 중... (시간이 걸릴 수 있습니다)`,
                    `Searching SAP for materials matching "${sapPatternReq.pattern}" and batch-downloading "${sapPatternReq.docType}" documents... (this may take a while)`
                ),
                pending: true
            });
            input.value = '';
            window._renderGanttQaMessages();
            let sapPatternReply;
            try {
                const url = 'http://127.0.0.1:5000/sap-download-documents-by-pattern?pattern='
                    + encodeURIComponent(sapPatternReq.pattern)
                    + '&type=' + encodeURIComponent(sapPatternReq.docType);
                const res = await window._withTimeout(
                    fetch(url), 240000,
                    window._t('SAP 패턴 검색 + 문서 일괄 다운로드 시간 초과', 'SAP pattern search + batch document download timed out')
                );
                const data = await res.json();
                sapPatternReply = data.ok
                    ? ('📥 ' + (data.message || window._t('패턴 검색 + 일괄 다운로드가 완료됐습니다.', 'Pattern search + batch download completed.')))
                    : ('⚠️ ' + window._t('SAP 패턴 검색/다운로드 실패: ', 'Failed to search/download by pattern in SAP: ') + (data.error || window._t('알 수 없는 오류', 'unknown error')));
            } catch (e) {
                sapPatternReply = '⚠️ ' + window._t('SAP 패턴 검색/다운로드 실패: ', 'Failed to search/download by pattern in SAP: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: sapPatternReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 💡 [2026-09-16 신규, 사용자 요청] 와일드카드 "*"를 빼먹고 패턴 검색을 시도한 것으로
        //    보이면(위 _ganttQaExtractSapPatternDownloadHint) 조용히 다른 로컬 명령/일반
        //    AI 대화로 새어나가게 두지 않고, "*"를 넣어 다시 물어달라는 사용법 안내를 예시와
        //    함께 즉시 보여준다 — AI 호출 없는 순수 로컬 명령이라 지연이 없다.
        if (window._ganttQaExtractSapPatternDownloadHint && window._ganttQaExtractSapPatternDownloadHint(sapDocQuestion)) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({
                role: 'ai',
                text: window._t(
                    '자재내역 패턴으로 조회하려면 와일드카드 "*"를 포함해서 말씀해주세요.\n예: "*01+01*150*로 조회된 아이템 승인원 다운로드해줘"',
                    'To search by a description pattern, please include the wildcard "*".\nExample: "download the approval doc for items matching *01+01*150*"'
                )
            });
            input.value = '';
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 📦 [2026-09-16 신규, 사용자 요청] "123456 품목 내역 보여줘"류 — 자재번호(들)의
        //    품목(자재내역, ≤40자)/품목2(40자 초과 연속분) 둘 다 항상 같이 보여준다("품목 내역
        //    조회하면 기본적으로 2개 품목 모두 출력해줘"). "문서"/"파일" 키워드를 요구하는
        //    문서열기/목록/배치다운로드 판정들과 겹칠 일이 없어 그 판정들보다 먼저 체크해도
        //    안전 — 자재번호 앵커 + "품목/자재"+"내역/정보/설명" 조합이라 오탐 위험도 낮음.
        const sapMaterialInfoReq = window._ganttQaExtractMaterialInfoRequest ? window._ganttQaExtractMaterialInfoRequest(sapDocQuestion) : null;
        if (sapMaterialInfoReq) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({
                role: 'ai',
                text: '⏳ ' + window._t(
                    `SAP에서 자재 ${sapMaterialInfoReq.length}개의 품목 내역을 조회하는 중...`,
                    `Looking up item description(s) for ${sapMaterialInfoReq.length} material(s) in SAP...`
                ),
                pending: true
            });
            input.value = '';
            window._renderGanttQaMessages();
            let materialInfoReply;
            try {
                const url = 'http://127.0.0.1:5000/sap-approval-fetch?materials=' + encodeURIComponent(sapMaterialInfoReq.join(','));
                const timeoutMs = Math.min(200000, 30000 + 10000 * sapMaterialInfoReq.length);
                const res = await window._withTimeout(fetch(url), timeoutMs, window._t('SAP 품목 내역 조회 시간 초과', 'Looking up SAP item description(s) timed out'));
                const data = await res.json();
                if (data.ok && Array.isArray(data.results)) {
                    const lines = data.results.map(function(r) {
                        if (!r.ok) {
                            return `📦 ${r.code}\n⚠️ ` + window._t('조회 실패: ', 'Lookup failed: ') + (r.err || window._t('알 수 없는 오류', 'unknown error'));
                        }
                        const desc = r.desc || window._t('(없음)', '(none)');
                        const subRaw = (r.sub || '').trim();
                        const sub = subRaw || window._t('(없음)', '(none)');
                        // 🆕 [2026-09-17 신규, 사용자 요청] 품목+품목2를 합친 전체 내역도 같이
                        // 보여주되, 자재번호와 그 내역 사이를 탭(TAB) 문자로 구분한다("6자리 숫자와
                        // 내역 사이에 tab key 넣어서 합친 것도 보여줘") — 엑셀에 그대로 붙여넣으면
                        // 자재번호/내역이 자동으로 별도 열에 들어가게 하려는 용도. desc는 SAP 원본이
                        // 40자에서 끊길 때 끝을 "="로 표시하는 관례가 있는데(예: "...USB="), 이건
                        // 실제 내용이 아니라 SAP 자체의 연속 표시 문자이므로 품목2가 실제로 있을
                        // 때만(=진짜로 이어지는 내용이 있을 때만) 그 끝 "="를 떼고 이어붙인다 —
                        // 사용자가 직접 준 예시 2건(133025/133026, 둘 다 desc가 "="로 끝나는 경우)
                        // 으로 정확히 검증함.
                        const combinedDesc = subRaw ? (desc.replace(/=$/, '') + subRaw) : desc;
                        return `📦 ${r.code}\t${combinedDesc}\n` + window._t('품목: ', 'Item: ') + desc + '\n' + window._t('품목2: ', 'Item2: ') + sub;
                    });
                    materialInfoReply = lines.join('\n\n');
                } else {
                    materialInfoReply = '⚠️ ' + window._t('품목 내역 조회 실패: ', 'Failed to look up item description(s): ') + (data.error || window._t('알 수 없는 오류', 'unknown error'));
                }
            } catch (e) {
                materialInfoReply = '⚠️ ' + window._t('품목 내역 조회 실패: ', 'Failed to look up item description(s): ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: materialInfoReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 📥 [2026-09-15 신규] "SAP에서 133012, 133010, 101831 문서 다운로드해줘"처럼 자재번호
        //    2개 이상 + 다운로드/저장 요청 — 아래 단일 문서 열기 판정 및 "엑셀로 내보내줘" 판정
        //    보다 먼저 체크해야 함(셋 다 "다운로드"/"엑셀" 같은 단어를 부분적으로 공유해서, 순서가
        //    바뀌면 자재번호가 여러 개 딸린 요청이 엉뚱한 핸들러(첫 번째 자재만 처리하는 단일 열기,
        //    또는 아직 조회한 게 없다는 엑셀 내보내기 실패 메시지)로 잘못 판정된다 — 실사용에서
        //    "128808,115518 품목 조회해서 엑셀 출력해주고 P1 문서 열어줘"가 엑셀 내보내기로
        //    잘못 가로채져 "아직 내보낼 SAP 데이터가 없습니다"만 뜨던 버그로 확인됨(2026-09-15).
        //    ZDMSR004("DMS 첨부파일 일괄 다운로드 프로그램")를 실행해 한 번에 C:\SAP_DMS\로
        //    다운로드한다.
        const sapBatchReq = window._ganttQaExtractSapBatchDownloadRequest ? window._ganttQaExtractSapBatchDownloadRequest(sapDocQuestion) : null;
        if (sapBatchReq) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({
                role: 'ai',
                text: '⏳ ' + window._t(
                    `SAP에서 자재 ${sapBatchReq.materials.length}개의 "${sapBatchReq.docType}" 문서를 일괄 다운로드하는 중... (시간이 걸릴 수 있습니다)`,
                    `Batch-downloading "${sapBatchReq.docType}" documents for ${sapBatchReq.materials.length} materials in SAP... (this may take a while)`
                ),
                pending: true
            });
            input.value = '';
            window._renderGanttQaMessages();
            let sapBatchReply;
            try {
                const url = 'http://127.0.0.1:5000/sap-download-documents-batch?materials='
                    + encodeURIComponent(sapBatchReq.materials.join(','))
                    + '&type=' + encodeURIComponent(sapBatchReq.docType);
                const timeoutMs = Math.min(300000, 60000 + 8000 * sapBatchReq.materials.length);
                const res = await window._withTimeout(
                    fetch(url), timeoutMs,
                    window._t('SAP 문서 일괄 다운로드 시간 초과', 'Batch document download timed out')
                );
                const data = await res.json();
                sapBatchReply = data.ok
                    ? ('📥 ' + (data.message || window._t('일괄 다운로드가 완료됐습니다.', 'Batch download completed.')))
                    : ('⚠️ ' + window._t('SAP 문서 일괄 다운로드 실패: ', 'Failed to batch-download SAP documents: ') + (data.error || window._t('알 수 없는 오류', 'unknown error')));
            } catch (e) {
                sapBatchReply = '⚠️ ' + window._t('SAP 문서 일괄 다운로드 실패: ', 'Failed to batch-download SAP documents: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: sapBatchReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 📄 [2026-09-14 신규, 2026-09-15 자재번호 직접조회 지원] "SAP에서 P01 문서 열어줘" 로컬
        //    명령 — AI 호출 없이, MM03에서 이미 열어둔 자재의 "문서 데이터" 탭에서 해당 문서 타입을
        //    찾아 열고 원본 파일을 다운로드+실행한다. 질문에 자재번호(예: "106188")가 같이 있으면
        //    사람이 화면을 미리 열어둘 필요 없이 백엔드가 직접 MM03으로 이동해 조회한다. 비동기
        //    (백엔드 왕복)라 다른 로컬 명령들과 달리 별도 블록으로 처리.
        const sapOpenDocReq = window._ganttQaExtractSapOpenDocRequest ? window._ganttQaExtractSapOpenDocRequest(sapDocQuestion) : null;
        if (sapOpenDocReq) {
            const sapOpenDocType = sapOpenDocReq.docType;
            const sapOpenDocMaterial = sapOpenDocReq.material;
            window._ganttQaHistory.push({ role: 'user', text: question });
            const pendingText = sapOpenDocMaterial
                ? window._t(`SAP에서 자재 "${sapOpenDocMaterial}"의 "${sapOpenDocType}" 문서를 조회해서 여는 중...`, `Looking up material "${sapOpenDocMaterial}" in SAP and opening document "${sapOpenDocType}"...`)
                : window._t(`SAP에서 "${sapOpenDocType}" 문서를 찾아 여는 중...`, `Looking up and opening SAP document "${sapOpenDocType}"...`);
            window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + pendingText, pending: true });
            input.value = '';
            window._renderGanttQaMessages();
            let sapDocReply;
            try {
                let url = 'http://127.0.0.1:5000/sap-open-document?type=' + encodeURIComponent(sapOpenDocType);
                if (sapOpenDocMaterial) url += '&material=' + encodeURIComponent(sapOpenDocMaterial);
                const res = await window._withTimeout(
                    fetch(url),
                    sapOpenDocMaterial ? 60000 : 50000,
                    sapOpenDocMaterial
                        ? window._t('SAP 문서 열기 60초 시간 초과', 'Opening the SAP document timed out after 60s')
                        : window._t('SAP 문서 열기 50초 시간 초과', 'Opening the SAP document timed out after 50s')
                );
                const data = await res.json();
                if (data.ok) {
                    sapDocReply = '📄 ' + (data.message || window._t(`"${sapOpenDocType}" 문서를 열었습니다.`, `Opened document "${sapOpenDocType}".`));
                } else {
                    sapDocReply = '⚠️ ' + window._t('SAP 문서 열기 실패: ', 'Failed to open SAP document: ') + (data.error || window._t('알 수 없는 오류', 'unknown error'));
                }
            } catch (e) {
                sapDocReply = '⚠️ ' + window._t('SAP 문서 열기 실패: ', 'Failed to open SAP document: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: sapDocReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 📄 [2026-09-15 신규] 자재번호는 있지만 문서 타입 코드(P01 등)를 모른 채 말한 경우 —
        //    위 sapOpenDocReq가 null이었을 때만 여기로 온다(순서 중요). 특정 문서를 열지 않고
        //    먼저 그 자재의 "문서 데이터" 화면을 그대로 읽어와 보여준 뒤, 원하는 타입을 골라
        //    다시 물어보라고 안내한다.
        const sapListDocsMaterial = window._ganttQaExtractSapListDocsRequest ? window._ganttQaExtractSapListDocsRequest(sapDocQuestion) : null;
        if (sapListDocsMaterial) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t(`SAP에서 자재 "${sapListDocsMaterial}"의 문서 목록을 조회하는 중...`, `Looking up the document list for material "${sapListDocsMaterial}" in SAP...`), pending: true });
            input.value = '';
            window._renderGanttQaMessages();
            let sapListReply;
            try {
                const res = await window._withTimeout(
                    fetch('http://127.0.0.1:5000/sap-material-documents?material=' + encodeURIComponent(sapListDocsMaterial)),
                    40000, window._t('SAP 문서 목록 조회 40초 시간 초과', 'Looking up the SAP document list timed out after 40s')
                );
                const data = await res.json();
                if (data.ok) {
                    const bodyStart = (data.text || '').indexOf('\n\n');
                    const body = bodyStart !== -1 ? data.text.slice(bodyStart + 2) : (data.text || '');
                    sapListReply = window._t(
                        `📋 자재 "${sapListDocsMaterial}"의 "문서 데이터" 화면입니다:\n\n${body}\n\n특정 문서를 열려면 "SAP에서 ${sapListDocsMaterial} (문서타입) 문서 열어줘"처럼 문서 타입까지 같이 말씀해주세요.`,
                        `📋 Here is the "Document data" screen for material "${sapListDocsMaterial}":\n\n${body}\n\nTo open a specific document, say "Open the (doc type) document for ${sapListDocsMaterial} in SAP" including the document type.`
                    );
                } else {
                    sapListReply = '⚠️ ' + window._t('SAP 문서 목록 조회 실패: ', 'Failed to look up the SAP document list: ') + (data.error || window._t('알 수 없는 오류', 'unknown error'));
                }
            } catch (e) {
                sapListReply = '⚠️ ' + window._t('SAP 문서 목록 조회 실패: ', 'Failed to look up the SAP document list: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: sapListReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 📊 [2026-09-14 신규, 2026-09-15 순서 조정] "엑셀로 내보내줘" 로컬 명령 — API 키 없어도
        //    동작, AI를 거치지 않고 방금 조회된 SAP 원본 데이터를 바로 파일로 저장한다. 위 배치
        //    다운로드/단일 문서 열기/문서 목록 판정들보다 반드시 나중에 체크해야 함 — 자재번호가
        //    같이 언급된 요청은 저 판정들이 먼저 처리하는 게 맞고, 이 명령은 "그것도 아닐 때"의
        //    catch-all(순수하게 "지금 화면/방금 조회한 SAP 데이터를 엑셀로 달라"는 요청)이다.
        //    💡 [2026-09-15] 캐시된 SAP 데이터가 아직 없으면(예: "SAP에서 502572 BOM 열어서
        //    엑셀로 출력해줘"처럼 조회와 내보내기를 한 메시지에 같이 요청한 경우) 곧바로 실패
        //    시키지 않고, 그 자리에서 _aiFetchSapContext()로 한 번 더 조회한 뒤 그 결과를 바로
        //    내보낸다 — 단, 이건 "지금 SAP GUI 화면에 보이는 것"을 그대로 읽어오는 것이라(특정
        //    트랜잭션으로 자동 이동하지 않음), 사람이 미리 SAP GUI에서 원하는 화면(BOM 등)을
        //    열어둔 상태여야 한다(기존 "SAP 조회" 설계 원칙과 동일).
        if (window._ganttQaExtractSapExportRequest && window._ganttQaExtractSapExportRequest(question)) {
            window._ganttQaHistory.push({ role: 'user', text: question });
            input.value = '';
            let cached = window._lastSapFetchResult;
            // 💡 [2026-09-15 버그수정] 질문 자체가 새 SAP 조회 대상을 명시하면(자재번호+BOM/
            //    사용처 등) 캐시가 있어도 무조건 재사용하지 않고 새로 조회한다 — 안 그러면
            //    "104438 사용처 엑셀로 출력해줘" 다음에 "502572 표준가격 표시된 BOM 엑셀로
            //    출력해줘"라고 물어도 무관한 이전 104438 캐시를 그대로 다시 내보내는 버그가
            //    실사용에서 확인됨(둘 다 "엑셀"+"출력" 키워드만으로 이 블록에 걸리는데, 캐시가
            //    "있기만 하면" 내용 일치 여부를 안 보고 그냥 썼던 게 원인). 자재번호가 없는
            //    순수 "엑셀로 저장해줘"류 후속 메시지는 여전히 기존처럼 캐시를 그대로 재사용.
            // 🐛🐛 [2026-09-17 실사용 버그수정] "133025,133026 엑셀 출력해줘"/"ZMM009로 조회해서
            // 133025,133026 엑셀 출력해줘"처럼 자재번호는 있지만 "sap"/"bom"/"역전개"/"사용처"
            // 단어가 전혀 없는 요청은 `_questionMentionsSapIntent`가 false를 반환해서(그 함수는
            // 이 네 신호만 봄), 매번 이미 있던 옛날 캐시(`_lastSapFetchResult`)를 그대로
            // 재사용했다 — 사용자가 뭐라고 다시 말해도(다른 자재번호, 다른 트랜잭션 이름을
            // 명시해도) 항상 똑같은 예전 결과("SAP_MM03_...xlsx")만 나오던 사고. 이 export
            // 요청 블록 안에서만(다른 곳의 `_questionMentionsSapIntent` 용도엔 영향 없도록
            // 국소적으로) 자재번호(5~8자리)가 질문에 있으면 그것만으로도 "새 조회"로 취급한다.
            const looksLikeFreshSapRequest = (window._questionMentionsSapIntent && window._questionMentionsSapIntent(question)) || /\b\d{5,8}\b/.test(question);
            if (!cached || !cached.text || looksLikeFreshSapRequest) {
                window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + window._t('SAP 데이터를 조회하는 중...', 'Looking up SAP data...'), pending: true });
                window._renderGanttQaMessages();
                const sapText = await window._aiFetchSapContext(question);
                window._ganttQaHistory.pop();
                const fetchFailed = !sapText || /^\(/.test(sapText); // _aiFetchSapContext는 실패 시 "(SAP 조회 실패: ...)" 형태 문자열을 반환
                if (fetchFailed) {
                    window._ganttQaHistory.push({ role: 'ai', text: '⚠️ ' + window._t('SAP 데이터를 조회하지 못해 내보낼 수 없습니다: ', 'Could not look up SAP data to export: ') + (sapText || window._t('알 수 없는 오류', 'unknown error')) });
                    window._renderGanttQaMessages();
                    input.focus();
                    return;
                }
                cached = window._lastSapFetchResult;
            }
            let sapExportReply;
            // 💡 [2026-09-16 변경, 사용자 요청 "SAP 관련 저장 경로는 C:\SAP_DMS로 통일해줘"] 예전엔
            // 브라우저 다운로드 후 "해당 폴더로 이동하시겠습니까?"라고 되물어야 했다(서버가 실제
            // 저장 경로를 몰랐으므로) — 이제 백엔드(/sap-save-export)가 직접 C:\SAP_DMS\SAP조회\
            // 에 저장하고 자동으로 폴더를 열어주므로, 다른 SAP 기능들(승인원 표지/구매오더/
            // ZDMSR004 배치 다운로드)과 동일하게 되묻지 않고 바로 완료 메시지만 보여준다.
            try {
                const exported = window._exportSapDataToExcel(cached);
                const res = await window._withTimeout(
                    fetch('http://127.0.0.1:5000/sap-save-export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileName: exported.fileName, dataBase64: exported.base64 })
                    }), 20000, window._t('SAP 엑셀 저장 시간 초과', 'Saving the SAP Excel file timed out')
                );
                const data = await res.json();
                sapExportReply = data.ok
                    ? '📊 ' + (data.message || window._t('SAP 원본 데이터를 저장했습니다.', 'Saved the raw SAP data.'))
                    : '⚠️ ' + window._t('엑셀 저장에 실패했습니다: ', 'Failed to save the Excel file: ') + (data.error || window._t('알 수 없는 오류', 'unknown error'));
            } catch (e) {
                console.warn('[AI 문답] SAP 엑셀 내보내기 실패:', e);
                sapExportReply = '⚠️ ' + window._t('엑셀 내보내기에 실패했습니다: ', 'Failed to export to Excel: ') + (e && e.message ? e.message : e);
            }
            window._ganttQaHistory.push({ role: 'ai', text: sapExportReply });
            window._renderGanttQaMessages();
            input.focus();
            return;
        }

        // 🏷 [Phase 11] 질문 라우터 — 확실할 때만 동작을 바꾼다(SAP 패턴 조회/미지원 SAP 안내/일반 추론). 애매하면 기존 경로 그대로.
        let _qaRoute = null;
        try {
            if (window._qaRouteAndMaybeHandle) {
                const _rr = await window._qaRouteAndMaybeHandle(question, input);
                if (_rr && _rr.handled) return;
                _qaRoute = _rr && _rr.route;
            }
        } catch (e) { console.warn('[QA 라우터] 무시하고 기존 경로로 진행:', e); }
        const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!apiKey) { alert(window._t('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.', 'Please enter and save your AI API key in [🤖 AI Tools → ⚙️ Settings → AI Analysis Settings] first.')); return; }

        // 💡 [2026-09-08 신규] AI 호출 없이 로컬에서만 처리 — 재질문 패턴 감지(위 규칙 참고)는 이번
        //    질문을 히스토리에 넣기 "전"에 검사해야 자기 자신과 비교되지 않는다. 질문 문구 빈도 기록도
        //    실제로 AI에게 보내는 "진짜 질문"에 대해서만(음성/실행취소 같은 로컬 명령 제외) 남긴다.
        const reaskTarget = window._ganttQaCheckReaskPattern ? window._ganttQaCheckReaskPattern(question) : null;
        if (reaskTarget && !reaskTarget.possibleDissatisfaction && !window._qaFeedbackFor(reaskTarget.uid)) {
            reaskTarget.possibleDissatisfaction = true;
        }
        if (window._ganttQaRecordQuestionFreq) window._ganttQaRecordQuestionFreq(question);
        // 🐛 [2026-09-14 버그수정] 위 기록만 하고 드롭다운(#gantt-qa-freq-select)은 모달을 처음 열 때만
        //    채워지고 있어서, 모달을 열어둔 채로 같은 질문을 두 번째 물어 방금 "2회 이상"(자주 쓰는
        //    질문 자격)이 되어도 화면엔 반영되지 않았다(모달을 닫았다 다시 열어야만 보임) — "중복 자주
        //    하는 질문이 드롭다운에 추가되어야 하는데 안 된다"는 실사용 제보의 원인. 기록 직후 바로
        //    다시 채워서 같은 세션 안에서도 즉시 보이게 한다.
        if (window._ganttQaPopulateFreqSelect) window._ganttQaPopulateFreqSelect();

        window._ganttQaSending = true;
        const priorHistory = window._ganttQaHistory.slice(); // 이번 질문/답변을 넣기 전 시점의 대화만 컨텍스트로 사용
        if (!_skipUserHistoryPush) window._ganttQaHistory.push({ role: 'user', text: question });
        input.value = '';
        input.disabled = true;
        const sendBtn = document.getElementById('gantt-qa-send-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳'; }
        window._ganttQaHistory.push({ role: 'ai', text: '⏳ 답변 생성 중...', pending: true });
        window._renderGanttQaMessages();

        // 💡 [2026-09-07 신규] 채팅창 상단 드롭다운으로 다른 프로젝트를 미리 골라둔 상태면, AI가
        //    스스로 [[ACTION:LOAD_PROJECT:번호]]를 요청하고 되돌아올 때까지 기다리지 않고 그 프로젝트
        //    데이터를 먼저 가져와 첫 프롬프트에 바로 실어 보낸다(왕복 1번으로 단축).
        const qaTarget = window._ganttQaTargetProject;
        let manualOtherProjectTexts = null;
        let qaQuestionForPrompt = question;
        if (qaTarget) {
            const pendingIdx = window._ganttQaHistory.length - 1;
            if (window._ganttQaHistory[pendingIdx]) {
                window._ganttQaHistory[pendingIdx].text = `⏳ [${qaTarget.label}] 프로젝트 데이터를 불러오는 중...`;
                window._renderGanttQaMessages();
            }
            const otherCtx = await window._aiFetchManualTargetContext(qaTarget);
            if (otherCtx) {
                manualOtherProjectTexts = [otherCtx];
                qaQuestionForPrompt = `[질문 대상: 다른 프로젝트 "${qaTarget.label}"] ${question}`;
            } else if (window.showToast) {
                window.showToast(window._t(`⚠️ [${qaTarget.label}] 데이터를 불러오지 못해 현재 프로젝트 기준으로 답합니다.`, `⚠️ Couldn't load data for [${qaTarget.label}] — answering based on the current project instead.`), 'warning');
            }
            if (window._ganttQaHistory[pendingIdx]) {
                window._ganttQaHistory[pendingIdx].text = '⏳ 답변 생성 중...';
                window._renderGanttQaMessages();
            }
        }

        // 🏭 [2026-09-14 신규, 2026-09-15 게이트 확장] 질문에 "SAP"가 언급되거나(기존) "사용처/
        //    역전개/BOM"+자재번호만 언급돼도(신규, 위 _questionMentionsSapIntent 주석 참고) AI가
        //    판단할 필요 없이 여기서 바로 로컬 백엔드에 "지금 SAP GUI 화면"을 물어봐서 프롬프트에
        //    실어 보낸다(질문마다 항상 조회하면 느려지고 불필요하므로, 언급이 있을 때만 — CLAUDE.md
        //    "SAP/TIPR" 결정 사항 참고).
        let sapText = null;
        if (window._questionMentionsSapIntent(question) || (_qaRoute && _qaRoute.useSapContext)) {
            const pendingIdx2 = window._ganttQaHistory.length - 1;
            if (window._ganttQaHistory[pendingIdx2]) {
                window._ganttQaHistory[pendingIdx2].text = '⏳ ' + window._t('SAP 화면 조회 중...', 'Reading SAP screen...');
                window._renderGanttQaMessages();
            }
            sapText = await window._aiFetchSapContext(question);
            // 💡 [2026-09-14] 실패 진단용 — "SAP 조회를 눌렀는데 AI가 전혀 모르는 척한다"는 제보가
            //    있어, 최소한 콘솔에서라도 실제로 조회가 됐는지/뭐가 왔는지 바로 확인할 수 있게 남긴다.
            console.info('[AI 문답] SAP 조회 결과:', sapText ? sapText.slice(0, 300) : '(null — 조회 자체가 실행 안 됨)');
            if (window._ganttQaHistory[pendingIdx2]) {
                window._ganttQaHistory[pendingIdx2].text = '⏳ 답변 생성 중...';
                window._renderGanttQaMessages();
            }
        }

        try {
            // 💡 [2026-09-08 신규] "느리다"는 신고가 반복돼서, 어디가 느린지(코드가 컨텍스트를
            //    조립하는 단계 vs AI가 실제로 답을 생성하는 단계) 바로 구분할 수 있게 계측 로그를
            //    남긴다(executeLoadFile의 "[프로젝트 열기 계측]"과 동일한 패턴). 다음에 또 느리면
            //    브라우저 개발자도구 콘솔에서 "[AI 문답 계측]"으로 검색 — 프롬프트 조립이 오래
            //    걸렸으면 코드/Drive 조회 문제, AI 응답 생성이 오래 걸렸으면 AI 백엔드(무료 등급
            //    등)가 느린 것이라 코드로는 더 손댈 부분이 없다는 뜻.
            const _tQa0 = performance.now();
            const prompt = (_qaRoute && _qaRoute.cls === 'general' && window._qaBuildGeneralPrompt)
                ? window._qaBuildGeneralPrompt(qaQuestionForPrompt, priorHistory)   // 🏷 일반 추론 — 프로젝트 JSON 미포함(빠르고 싸며 데이터 없다는 오답 방지)
                : await window._buildGanttQaPrompt(qaQuestionForPrompt, priorHistory, null, manualOtherProjectTexts, sapText);
            const _tQa1 = performance.now();
            const _ctxMs = Math.round(_tQa1 - _tQa0);
            console.info(`[AI 문답 계측] 컨텍스트/프롬프트 조립: ${_ctxMs}ms (프롬프트 길이: ${prompt.length.toLocaleString()}자)`);
            if (_ctxMs > 5000) console.warn(`[AI 문답 계측] ⚠️ 컨텍스트 조립이 ${_ctxMs}ms나 걸림 — Drive 조회(전기부품 라이브러리·다른 프로젝트 목록 등)가 느린 것으로 의심됨`);
            // 💡 위 window._withTimeout 참고 — GAS 호출(callAiBackend)이 네트워크 문제 등으로 응답도
            //    오류도 없이 멈춰버리면 "⏳ 답변 생성 중..."이 영원히 안 바뀌어 "응답 없음"으로 보인다.
            //    60초 안에 안 끝나면 오류로 처리해서 사용자가 재시도할 수 있게 한다.
            // 🐛 [2026-09-08 버그수정] 위 계측 로그가 타임아웃(reject)일 땐 안 찍히던 문제 — await가
            //    던진 예외가 바로 아래 catch로 튀어서 그 사이의 console.info를 건너뛰었다. 정작 "왜
            //    느린지" 가장 궁금한 순간(타임아웃으로 실패한 순간)에 로그가 안 남는 건 계측 자체의
            //    의미가 없으므로, try/finally로 감싸 성공/실패 어느 쪽이든 걸린 시간이 항상 찍히게 한다.
            // 💡 [2026-09-08 신규] "계속 진행 중인데 실패한 것처럼 보인다"는 지적 — AI 응답이 늦어질
            //    때 "⏳ 답변 생성 중..."이 계속 그대로 떠 있으면 사용자는 "멈췄나?" 걱정하게 된다.
            //    실제로 아직 요청이 살아있는(취소된 게 아닌) 동안엔 시간이 지날수록 안심시키는 문구로
            //    바꿔가며 "아직 진행 중"임을 알려준다 — 마지막 60초 시점의 실패 메시지도 덜 놀라도록
            //    "문제"보다는 "시간이 좀 걸린다"는 톤으로 통일.
            const stopWaitingHints = window._ganttQaStartWaitingHints ? window._ganttQaStartWaitingHints() : function() {};
            let result;
            try {
                result = await window._withTimeout(window.callAiBackend(apiKey, prompt, {}), 60000, window._currentLang === 'en'
                    ? '⏱️ Still no response after 60 seconds. Please check your connection and try again.'
                    : '⏱️ 60초가 지나도 응답이 오지 않고 있어요. 네트워크 상태를 확인하고 다시 시도해주세요.');
            } finally {
                stopWaitingHints();
                console.info(`[AI 문답 계측] AI 응답 생성(네트워크 왕복 포함): ${Math.round(performance.now() - _tQa1)}ms`);
            }
            if (!result.ok) throw result.error || new Error('알 수 없는 오류');
            const text = window._extractGanttQaAiText(result);

            const processed = await window._aiProcessGanttQaTurn(text, qaQuestionForPrompt, question, priorHistory, apiKey, manualOtherProjectTexts);

            window._ganttQaHistory.pop(); // "⏳ 답변 생성 중..." placeholder 제거
            // 💡 uid/question을 함께 저장 — 아래 👍/👎 피드백(window.saveGanttQaFeedback)이 이 답변을
            //    질문과 묶어서 기록하고, 나중에 [🤖 일괄개선]이 "무슨 질문에 어떻게 잘못 답했는지"를
            //    AI에게 다시 보여줄 수 있게 한다.
            window._ganttQaHistory.push({ role: 'ai', text: processed.text, uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), question: question, mailDraftId: processed.mailDraftId, noticeDraftId: processed.noticeDraftId, alarmDraftId: processed.alarmDraftId, ganttEditDraftId: processed.ganttEditDraftId, ganttAddDraftId: processed.ganttAddDraftId, openExecDraftId: processed.openExecDraftId });
            if (_qaRoute) { try { window._ganttQaHistory[window._ganttQaHistory.length - 1].route = _qaRoute; } catch (e) { /* ignore */ } }
        } catch (e) {
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: '⚠️ 오류: ' + (e && e.message ? e.message : e), error: true });
        } finally {
            window._ganttQaSending = false;
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

        if (window.showToast && rating === 'good') window.showToast(window._t('👍 피드백이 저장되었습니다.', '👍 Feedback saved.'), 'info');
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
                    <span>✏️ <span id="gantt-qa-improve-comment-title">${window._currentLang === 'en' ? 'What was the problem?' : '어떤 부분이 문제였나요?'}</span></span>
                    <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-improve-comment-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div style="padding:18px;">
                    <textarea id="gantt-qa-improve-comment-input" placeholder="${window._currentLang === 'en' ? "e.g. Said 'not found in the data' even though the value exists (optional)" : "예: 데이터에 있는 값인데도 '데이터에서 확인되지 않습니다'라고 답함 (선택 입력)"}"
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
                alert(window._t('⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 AI 답변 아래 👎 버튼을 눌러 케이스를 쌓아주세요.', '⚠️ No feedback cases to improve from.\nPlease click 👎 under an AI answer first to collect some cases.'));
                return;
            }
            casesText = pending.map(function(fb, i) {
                return `[케이스 ${i + 1}] (${fb.date ? fb.date.slice(0, 10) : ''})\n질문: ${fb.question || ''}\nAI 답변: ${fb.answer || ''}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
            }).join('\n\n---\n\n');
        }

        const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱/치환하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 아래 플레이스홀더는 정확히 이 이름 그대로 유지해야 합니다(삭제/이름변경/오타 금지, 정확히 한 번 이상씩): \${todayStr} \${projectLine} \${overviewText} \${memberText} \${materialText} \${customerSpecText} \${mcTableText} \${elecPartsText} \${addressText} \${totalTasks} \${taskListText} \${mailSection} \${recentLogsText} \${historyText} \${question}\n2. [[ACTION:SET_ALARM:번호]] / [[ACTION:CLEAR_ALARM:번호]] / [[ACTION:VIEW_MAIL:번호]] 태그 형식과 그 사용 규칙 설명은 그대로 유지하세요(이 정확한 문자열 패턴을 다른 코드가 정규식으로 찾아서 실제 알람 설정/원문 조회 기능을 실행합니다).\n표현/지시문/설명 등 나머지는 자유롭게 개선해도 됩니다.`;

        const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 "AI 문답(Gantt 프로젝트에 대해 자유 질문에 답하는 챗봇)" 프롬프트와, 이 프롬프트로 답변했을 때 사용자가 "나쁨"으로 평가한 사례입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

        if (window.showToast) window.showToast(window._t('🤖 AI 개선 요청 중...', '🤖 Requesting AI improvement...'), 'info');
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

            if (!improvedPrompt) throw new Error(window._t('AI 응답 형식을 해석하지 못했습니다.', 'Could not parse the AI response format.'));
            const structIssues = window.validateGanttQaPromptStructure(improvedPrompt);
            window.showQaImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
        } catch (e) {
            alert(window._t('❌ AI 개선 요청 실패: ', '❌ AI improvement request failed: ') + (e && e.message ? e.message : e));
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
                    <span>🤖 <span id="gantt-qa-improve-title">${window._currentLang === 'en' ? 'AI Prompt Improvement Suggestion (AI Q&A)' : 'AI 프롬프트 개선 제안 (AI 문답)'}</span></span>
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
        if (!text) { alert(window._t('프롬프트가 비어있습니다.', 'The prompt is empty.')); return; }

        if (!window.verifyAdminPassword(window._t('🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to adopt the improved prompt.\n(case-insensitive)'))) {
            alert(window._t('❌ 비밀번호 인증 실패. 채택이 취소되었습니다.', '❌ Authentication failed. Adoption cancelled.'));
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
                alert(window._t('✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v', '✅ Improved prompt adopted and saved to Drive. (v') + window._ganttQaPromptVersion + ')');
            } else {
                localStorage.setItem('gantt_qa_prompt_pending_push', '1');
                alert(window._t('⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.', '⚠️ Saved locally, but uploading to Drive failed. It will retry automatically on the next Drive connection.'));
            }
        } else {
            localStorage.setItem('gantt_qa_prompt_pending_push', '1');
            alert(window._t('✅ 개선된 프롬프트가 채택되었습니다. (v', '✅ Improved prompt adopted. (v') + window._ganttQaPromptVersion + window._t(')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)', ')\n(Drive not connected — will sync to the shared team copy on next connection)'));
        }
        modal.style.display = 'none';
        if (document.getElementById('gantt-qa-prompt-textarea')) document.getElementById('gantt-qa-prompt-textarea').value = text;
    };

    window.clearGanttQaChat = function() {
        if (window._ganttQaHistory.length && !confirm(window._t('대화 내용을 모두 지울까요?', 'Clear the entire conversation?'))) return;
        window._ganttQaHistory = [];
        window._ganttQaPendingMailDraft = null; // 💡 대화를 지우면 남아있던 메일 초안도 함께 무효화
        window._ganttQaPendingNoticeDraft = null; // 💡 공지 초안도 함께 무효화
        window._ganttQaPendingAlarmDraft = null; // 💡 알람 세부 설정 초안도 함께 무효화
        window._aiOtherProjectDataCache = {}; // 💡 이전 대화에서 조회했던 다른 프로젝트 데이터도 함께 비움
        window._ganttQaLastSpokenUid = null; // 🎙️ 대화를 지우면 "이미 읽어준 답변" 기록도 초기화
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        window._renderGanttQaMessages();
    };

    // ═══════════════════════════════════════════════════════════
    // 🎙️ [2026-09-08 신규] AI 문답 음성 챗 — 브라우저 내장 Web Speech API만 사용(백엔드/추가
    //    라이브러리 없음). 서버 API 키가 필요 없는 두 축:
    //      1) 🎤 음성 입력(STT) — webkitSpeechRecognition으로 말한 내용을 받아쓰기 → 자동 전송
    //      2) 🔊 음성 출력(TTS) — speechSynthesis로 AI 답변을 소리 내어 읽어줌(토글, localStorage 기억)
    //    Chrome/Edge 계열에서만 완전히 동작(Safari는 SpeechRecognition 미지원 브라우저가 많음) —
    //    미지원 브라우저에선 마이크 버튼 클릭 시 안내만 하고 조용히 실패.
    // ═══════════════════════════════════════════════════════════
    window._ganttQaVoiceOutputEnabled = localStorage.getItem('gantt_qa_voice_output') === '1';
    window._ganttQaLastSpokenUid = null;
    window._ganttQaRecognition = null;

    // 마크다운 기호·내부 액션 태그를 읽었을 때 "별표", "샵" 같은 잡음 없이 자연스럽게 들리도록 정리
    window._ganttQaStripForSpeech = function(text) {
        return (text || '')
            .replace(/\[\[ACTION:[^\]]*\]\]/g, '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^[-*]\s+/gm, '')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ' ')
            .trim();
    };

    // 🐛 [2026-09-08 버그수정] "음성문답" 지속 모드에서, AI 답변이 화면에 그려지는 시점(sendGanttQaMessage
    //    반환 시점)과 실제로 스피커에서 다 읽어주는 시점은 다르다(speechSynthesis.speak는 비동기로 큐에
    //    넣고 바로 반환됨) — 그런데 마이크 재시작 로직(_ganttQaStartListening의 rec.onend)이 "답변까지
    //    받았으면" 바로 재시도했기 때문에, AI가 아직 답을 소리 내어 읽는 도중에 마이크가 다시 켜져서
    //    스피커 소리(AI 자신의 목소리)를 마이크가 되받아 인식 → 새 질문으로 자동전송 → 그 답을 또 읽고
    //    또 되받는 식으로 "혼자 계속 대화"하며 응답이 밀리고 화면이 안 먹히는 것처럼 보이는 문제가 있었다.
    //    이제 utterance가 실제로 끝날 때 resolve되는 Promise를 남겨두고, 듣기 재시작 전에 그걸 기다린다.
    window._ganttQaSpeakPromise = null;

    window._ganttQaSpeak = function(text) {
        if (!window._ganttQaVoiceOutputEnabled || !window.speechSynthesis) return;
        const clean = window._ganttQaStripForSpeech(text);
        if (!clean) return;
        window.speechSynthesis.cancel(); // 이전에 읽던 문장이 남아있으면 끊고 새로 읽음
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = window._currentLang === 'en' ? 'en-US' : 'ko-KR';
        utter.rate = 1.0;
        window._ganttQaSpeakPromise = new Promise(function(resolve) {
            utter.onend = resolve;
            utter.onerror = resolve; // 읽다가 오류가 나도 영원히 안 풀리는 대기가 되지 않게
        });
        window.speechSynthesis.speak(utter);
    };

    // 음성문답 모드가 다시 듣기를 시작하기 전에 호출 — 방금 큐에 넣은 읽어주기가 끝날 때까지 기다린다
    //    (읽어줄 게 없었으면 즉시 통과). 에코 캔슬링이 없는 일반 스피커+마이크 환경을 감안해 다 읽은
    //    뒤에도 짧은 여유 시간을 살짝 더 둔다.
    window._ganttQaWaitForSpeechEnd = async function() {
        if (window._ganttQaSpeakPromise) {
            try { await window._ganttQaSpeakPromise; } catch (e) {}
        }
        await new Promise(function(r) { setTimeout(r, 300); });
    };

    // _renderGanttQaMessages()가 매번 다시 그릴 때 호출 — 아직 안 읽어준 최신 AI 답변(uid 있는 것 =
    //    실제 질문에 대한 답변만, "새 대화 시작" 같은 시스템 메시지는 uid가 없어 자동으로 제외됨)을 찾아 읽는다.
    window._ganttQaMaybeSpeakLatest = function() {
        if (!window._ganttQaVoiceOutputEnabled) return;
        const hist = window._ganttQaHistory || [];
        const last = hist[hist.length - 1];
        if (!last || last.role !== 'ai' || last.pending || last.error || !last.uid) return;
        if (last.uid === window._ganttQaLastSpokenUid) return;
        window._ganttQaLastSpokenUid = last.uid;
        window._ganttQaSpeak(last.text);
    };

    // 🔊/🔇 헤더 버튼 — [2026-09-08 수정] 옆 "📝 프롬프트" 버튼과 동일한 배경/호버 스타일(#e8f4fd →
    //    호버 시 #cfe6fa)로 통일 — 이전엔 항상 녹색 고정이었는데, 다른 헤더 버튼들과 안 어울린다는
    //    피드백으로 변경. 배경은 켜짐/꺼짐 상태와 무관하게 고정이고, 토글 시 아이콘(🔊↔🔇)만 바뀐다.
    window._ganttQaUpdateVoiceBtn = function() {
        const btn = document.getElementById('gantt-qa-voice-toggle-btn');
        if (!btn) return;
        const on = window._ganttQaVoiceOutputEnabled;
        const _vEn = window._currentLang === 'en';
        btn.textContent = on ? '🔊' : '🔇';
        btn.title = on
            ? (_vEn ? 'Voice replies: ON (click to mute)' : '음성 답변: 켜짐 (클릭하면 끄기)')
            : (_vEn ? 'Voice replies: OFF (click to read answers aloud)' : '음성 답변: 꺼짐 (클릭하면 AI 답변을 소리내어 읽어줌)');
    };

    window._ganttQaToggleVoiceOutput = function() {
        window._ganttQaVoiceOutputEnabled = !window._ganttQaVoiceOutputEnabled;
        localStorage.setItem('gantt_qa_voice_output', window._ganttQaVoiceOutputEnabled ? '1' : '0');
        window._ganttQaUpdateVoiceBtn();
        if (!window._ganttQaVoiceOutputEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
        if (window._ganttQaVoiceOutputEnabled && window.showToast) {
            window.showToast(window._currentLang === 'en' ? '🔊 AI answers will now be read aloud.' : '🔊 이제부터 AI 답변을 음성으로 읽어줍니다.', 'info');
        }
    };

    // 🎙️ [2026-09-08 신규] "음성기능 꺼줘"/"음성 답변 켜줘/꺼줘"처럼 채팅창에 직접 타이핑(또는 말)한
    //    명령으로도 음성 관련 기능을 켜고 끌 수 있게 함 — AI에게 물어봐서 태그로 처리하게 하면 AI가
    //    깜빡하거나 다른 식으로 답할 위험이 있으므로, AI 호출 없이 여기서 바로 100% 확실하게 처리한다
    //    (sendGanttQaMessage 맨 앞에서 호출 — 매치되면 그 자리에서 끝내고 AI 호출 자체를 생략함).
    //    "음성문답/음성입력/마이크"가 함께 언급되면 🎤 듣기 모드(_ganttQaVoiceMode)를, 그 외엔
    //    기본적으로 🔊 답변 읽어주기(_ganttQaVoiceOutputEnabled)를 대상으로 한다.
    //    매치 안 되면 null을 반환해서 평소처럼 AI에게 물어보는 흐름으로 그대로 진행된다.
    window._ganttQaTryHandleVoiceCommand = function(question) {
        const text = (question || '').trim();
        if (!/음성/.test(text)) return null;
        const _vcEn = window._currentLang === 'en';
        const voiceIdx = text.indexOf('음성');
        const offMatch = text.match(/(꺼|끄|중지|정지|멈춰)/);
        const onMatch = text.match(/(켜|시작)/);
        // "음성"이라는 단어와 켜기/끄기 동사가 가까이 붙어있을 때만 명령으로 인식 — 멀리 떨어져 있으면
        // (예: 완전히 다른 얘기하다 우연히 "음성"과 "켜다"가 각각 등장) 오작동 방지 차원에서 무시
        // 🐛 [2026-09-08 버그수정] `m && ...`는 m이 null이면 boolean false가 아니라 null을 그대로
        //    반환한다(단락평가) — 그 null이 아래 turnOn·_ganttQaVoiceOutputEnabled까지 흘러들어가
        //    "꺼짐" 상태가 실제로는 false가 아닌 null로 저장되던 문제가 있어 !!로 boolean화한다.
        const near = function(m) { return !!(m && Math.abs(m.index - voiceIdx) <= 14); };
        const isOff = near(offMatch);
        const isOn = near(onMatch);
        if (!isOff && !isOn) return null;
        const turnOn = !!(isOn && (!isOff || onMatch.index < offMatch.index));
        const isMicMode = /문답|입력|마이크/.test(text);

        if (isMicMode) {
            if (turnOn === window._ganttQaVoiceMode) {
                return turnOn
                    ? (_vcEn ? '🎙️ Voice Q&A mode is already on.' : '🎙️ 이미 음성문답 모드가 켜져 있어요.')
                    : (_vcEn ? '⌨️ Voice Q&A mode is already off.' : '⌨️ 이미 글자문답 모드예요.');
            }
            window._ganttQaToggleMic(); // 내부적으로 현재 상태의 반대로 전환 + 필요시 듣기 시작/중지
            return turnOn
                ? (_vcEn ? '🎙️ Voice Q&A mode is now ON — go ahead and speak.' : '🎙️ 음성문답 모드를 켰습니다 — 말씀해주세요.')
                : (_vcEn ? '⌨️ Switched back to Text Q&A mode.' : '⌨️ 글자문답 모드로 돌아왔습니다.');
        }

        if (window._ganttQaVoiceOutputEnabled === turnOn) {
            return turnOn
                ? (_vcEn ? '🔊 Voice replies are already on.' : '🔊 이미 음성 답변이 켜져 있어요.')
                : (_vcEn ? '🔇 Voice replies are already off.' : '🔇 이미 음성 답변이 꺼져 있어요.');
        }
        window._ganttQaVoiceOutputEnabled = turnOn;
        localStorage.setItem('gantt_qa_voice_output', turnOn ? '1' : '0');
        window._ganttQaUpdateVoiceBtn();
        if (!turnOn && window.speechSynthesis) window.speechSynthesis.cancel();
        return turnOn
            ? (_vcEn ? '🔊 Voice replies are now ON — I will read answers aloud.' : '🔊 이제부터 AI 답변을 음성으로 읽어드릴게요.')
            : (_vcEn ? '🔇 Voice replies are now OFF.' : '🔇 음성 답변 기능을 껐습니다.');
    };

    // ↩️↪️ [2026-09-08 신규] "이전으로/앞으로 되돌려줘"(Ctrl+Z/Ctrl+Y와 동일) — AI에게 물어서 판단하게
    //    하면 이미 정의된 태그 체계와 안 맞아 애매하게 추론하다 실패하거나 응답이 느려지므로, 음성 제어
    //    명령과 똑같이 AI 호출 자체를 생략하고 여기서 window.undoLastAction/redoLastAction을 바로
    //    호출한다(sendGanttQaMessage 맨 앞에서 호출). 되돌리기/다시실행과 무관한 문장에서 오작동하지
    //    않도록, "취소"/"복원"처럼 이 앱의 다른 기능(메일/공지/알람 초안 취소, 프롬프트 버전 복원 등)에서
    //    이미 쓰이는 단어는 트리거로 넣지 않고, "이전으로 되돌려/실행취소/undo/ctrl+z"처럼 뜻이 분명한
    //    표현만 인식한다. 매치 안 되면 null을 반환해 평소처럼 AI에게 물어보는 흐름으로 진행된다.
    window._ganttQaTryHandleUndoRedoCommand = function(question) {
        const text = (question || '').trim();
        if (!text) return null;
        const _urEn = window._currentLang === 'en';
        const redoPattern = /다시\s*실행|앞으로\s*되돌려|리두|\bredo\b|ctrl\s*\+?\s*y\b|ctrl\s*\+?\s*shift\s*\+?\s*z\b/i;
        const undoPattern = /이전(으로|\s*상태로)?\s*되돌려|뒤로\s*되돌려|실행\s*취소|되돌리기\s*해줘|언두|\bundo\b|ctrl\s*\+?\s*z\b/i;
        const isRedo = redoPattern.test(text);
        const isUndo = !isRedo && undoPattern.test(text); // "ctrl+shift+z"가 undo의 "ctrl+z"와도 겹쳐 보일 수 있어 redo를 먼저 판정
        if (!isUndo && !isRedo) return null;

        if (isRedo) {
            if (!window._redoStack || window._redoStack.length === 0) {
                return _urEn ? '↪️ Nothing to redo.' : '↪️ 다시 실행할 작업이 없습니다.';
            }
            window.redoLastAction();
            return _urEn ? '↪️ Redone (same as Ctrl+Y).' : '↪️ 다시 실행했습니다. (Ctrl+Y와 동일)';
        }
        if (!window._undoStack || window._undoStack.length < 2) {
            return _urEn ? '↩️ Nothing to undo.' : '↩️ 더 이상 실행 취소할 작업이 없습니다.';
        }
        window.undoLastAction();
        return _urEn ? '↩️ Undone (same as Ctrl+Z).' : '↩️ 실행 취소했습니다. (Ctrl+Z와 동일)';
    };

    // 🔔 [2026-09-12 신규] "알람" / "alarm" 로컬 명령 — AI 호출 없이 Gantt 알람 필터를 즉시 ON/OFF.
    //    ON: _알림=true인 업무만 표시(window._toggleAlarmFilter(true), 배지 표시).
    //    OFF: "알람 해제" / "알림 끄기" / "핀셋 해제" / "alarm off" / "전체" 입력 시.
    //    매치 안 되면 null 반환 → 평소처럼 AI 에게 물어보는 흐름으로 진행.
    //
    //    🔑 동의어 목록 (alarmSynonyms) — 사용자마다 다른 단어를 쓰므로 모두 인식:
    //    · 한국어: 알람, 알림, 핀셋, 핀셋알람, 핀셋알림, 마감알람, 마감알림
    //    · 영문:   alarm, reminder, notification
    //
    //    ⚠️ false positive 방어: 패턴이 ^...$로 전체 일치만 허용하므로
    //    "알람 설정해줘", "알림 관련 처리", "알람이라는 업무 찾아줘" 등은 매칭되지 않아
    //    자동으로 AI로 넘어감 — 업무명 안에 '알람' 글자가 포함된 행을 텍스트 검색으로
    //    찾으려면 "알람이라는 단어 포함된 업무 찾아줘"처럼 입력하면 된다.
    window._ganttQaTryHandleAlarmFilterCommand = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        var _en = window._currentLang === 'en';

        // 알람 관련 동의어 (OR 패턴) — 여기 추가하면 ON/OFF 양쪽 모두에 자동 적용됨
        var _aw = '알람|알림|핀셋알람|핀셋알림|핀셋|마감알람|마감알림|alarm|reminder|notification';

        // OFF 패턴: "알람 해제", "알림 끄기", "핀셋 해제", "alarm off", "전체 보기/표시" 등
        var offPattern = new RegExp('(' + _aw + ')\\s*(해제|끄기|끄|off\\b)|alarm\\s*(filter\\s*)?(off|해제|끄기)|전체\\s*(보기|표시|보여줘)', 'i');
        if (offPattern.test(text)) {
            if (!window._ganttAlarmFilterActive) {
                return _en ? '✅ Alarm filter is already off.' : '✅ 알람 필터는 이미 꺼져 있습니다.';
            }
            if (window._toggleAlarmFilter) window._toggleAlarmFilter(false);
            return _en ? '✅ Alarm filter OFF — all tasks are now visible.' : '✅ 알람 필터 꺼짐 — 전체 업무가 다시 표시됩니다.';
        }

        // ON 패턴: "알람", "알림", "핀셋", "reminder", "알람 보여줘", "알림 걸린 업무" 등
        // — ^...$로 전체 일치만 허용 → "알람 설정해줘"/"알림 관련 처리" 등은 AI에게 넘어감
        var onPattern = new RegExp('^(🔔\\s*)?(' + _aw + ')([\\s]*(보여|보기|있는|걸린|달린|설정된|업무|filter|on|켜|켜줘|보여줘|검색|찾아|정렬|뭐야|뭐|뭐가|있어|있나|있음|list|show))?$', 'i');
        if (onPattern.test(text)) {
            if (window._ganttAlarmFilterActive) {
                return _en ? '🔔 Alarm filter is already ON.' : '🔔 알람 필터가 이미 켜져 있습니다.';
            }
            var count = 0;
            if (typeof globalData !== 'undefined' && globalData) {
                for (var i = 1; i < globalData.length; i++) {
                    if (globalData[i] && globalData[i]._알림) count++;
                }
            }
            if (window._toggleAlarmFilter) window._toggleAlarmFilter(true);
            // 동의어 안내 — 어떤 단어를 써도 된다는 것을 응답에 포함
            var _synHint = _en
                ? '💡 "alarm" / "reminder" / "notification" all work.'
                : '💡 "알람" / "알림" / "핀셋" 중 어느 단어를 써도 됩니다. "해제"를 붙이면 전체가 다시 표시됩니다.';
            if (count === 0) {
                return _en
                    ? '🔔 Alarm filter ON — but no tasks have alarms set yet.\n' + _synHint
                    : '🔔 알람 필터 켜짐 — 아직 알람이 설정된 업무가 없습니다.\n' + _synHint;
            }
            return _en
                ? `🔔 Alarm filter ON — showing ${count} task(s) with alarms. Type "alarm off" to show all.\n` + _synHint
                : `🔔 알람 필터 켜짐 — 알람이 설정된 업무 ${count}건만 표시합니다.\n` + _synHint;
        }

        return null;
    };

    // 📊 [2026-09-14 신규] "엑셀로 내보내줘" 로컬 명령 — AI 호출 없이, 방금 조회에 성공한 SAP 원본
    //    데이터(_aiFetchSapContext가 캐싱해둔 window._lastSapFetchResult)를 곧바로 엑셀 파일로 저장.
    //    AI가 답변할 때 요약/재작성하면서 값이 미묘하게 바뀔 위험(빈 항목을 ``로 얼버무리는 등, 실사용
    //    제보로 확인된 패턴)을 피하려고, AI 답변 텍스트가 아니라 백엔드가 준 원본 탭 구분 텍스트를 그대로
    //    파싱해서 내보낸다 — "SAP 데이터/자재/BOM ... 엑셀로/출력/다운로드/내보내" 류 문구에 매치.
    // 💡 [2026-09-14 신규, 2026-09-15 분리] "엑셀로 내보내줘" 트리거 판정만 하는 함수 — 실제 처리는
    //    (캐시된 SAP 데이터가 없으면 그 자리에서 한 번 더 조회해야 할 수도 있어) sendGanttQaMessage의
    //    비동기 블록으로 옮겼다(예전엔 이 함수가 동기적으로 "캐시 없으면 바로 실패"만 했는데, 실사용
    //    에서 "SAP에서 502572 BOM 열어서 엑셀로 출력해줘"처럼 조회와 내보내기를 한 메시지에 같이
    //    요청하면 캐시가 아직 없어 곧바로 실패하던 문제가 확인됨, 2026-09-15).
    window._ganttQaExtractSapExportRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return false;
        // 💡 "엑셀 출력도 가능해?"처럼 "지금 해달라"가 아니라 "이런 기능이 있는지" 묻는 질문까지
        //    실행 명령으로 오인하면 안 된다(실사용 제보 사례) — 물음표로 끝나거나 "가능"/"되나"/"될까"
        //    같은 여부를 묻는 표현이 있으면 로컬 명령으로 가로채지 않고 평소처럼 AI에게 넘긴다.
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        return !looksLikeQuestion && /(엑셀|excel|xlsx)/i.test(text) && /(출력|내보내|다운로드|저장|export|download)/i.test(text);
    };

    // 📋 [2026-09-15 신규] "승인원 표지 생성" 대화 상태 — window._ganttQaHistory(대화 내용)와
    //    달리 이건 "지금까지 파악된 항목"만 담는 별도 상태다. 값: null(진행 중 요청 없음) 또는
    //    { materials:[...], format, writer, leader, isPre, rev, remark, fetched }.
    //    _ganttQaExtractApprovalUpdate가 매 메시지마다 갱신하고, sendGanttQaMessage가 필수
    //    항목이 다 모였는지 보고 실행 여부를 결정한다. 대화 중간에 모달을 닫아도(브라우저
    //    새로고침 전까지는) 유지된다 — 대화 내용 자체(_ganttQaHistory)는 모달을 닫으면
    //    비워지지만 이 상태는 별개다.
    window._ganttQaApprovalDraft = null;

    // 요청 메시지 하나를 보고 승인원 표지 draft를 새로 시작하거나(트리거 단어+자재번호 포함)
    // 기존 draft를 이어서 채운다(트리거 단어 없이 항목 값만 있는 후속 메시지). 관련 없는
    // 메시지면 null — 이 경우 draft가 있어도 건드리지 않고 그냥 지나간다(예: 딴 얘기를 하다가
    // 다시 돌아와 항목을 채울 수 있게).
    window._ganttQaExtractApprovalUpdate = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        // 💡 [2026-09-15 버그수정] "104446 승인원 표지 만들어줘"처럼 "SAP"란 단어 없이 물으면
        //    (자재번호가 이미 이 요청을 충분히 구체적으로 만들어주는데도) 예전엔 "sap" 리터럴을
        //    요구해서 트리거가 안 걸렸다 — 위 SAP 조회(_questionMentionsSapIntent)와 같은 날 같은
        //    이유로 실사용에서 제보된 버그. "sap" 요구를 빼고, 바로 아래에서 자재번호가 없으면
        //    어차피 null로 걸러지므로(line 2537 근처) "승인원"+동작 동사만으로도 충분히 안전하다.
        var isNewTrigger = /승인원/.test(text) && /(표지|생성|만들|작성)/i.test(text);
        var draft = window._ganttQaApprovalDraft;
        if (!isNewTrigger && !draft) return null;

        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (isNewTrigger && looksLikeQuestion) return null; // "승인원 표지도 만들 수 있어?" 류는 AI에게 넘김

        if (isNewTrigger) {
            var mats = (text.match(/\b\d{5,8}\b/g) || []).filter(function(m, i, arr) { return arr.indexOf(m) === i; });
            if (!mats.length) return null; // 자재번호 없이 트리거 단어만 있으면 대상 아님
            draft = { materials: mats.slice(0, 30), fetched: null }; // 원본 앱과 동일하게 최대 30개
            window._ganttQaApprovalDraft = draft;
        }
        if (!draft) return null;

        // 이번 메시지에서 추가로 파악되는 값이 있으면 draft에 병합(이미 있는 값은 덮어씀 —
        // "역시 워드로 바꿔줘" 같은 정정도 자연스럽게 반영되게).
        if (/(둘\s*다|둘다|모두|both)/i.test(text)) {
            draft.format = 'both';
        } else {
            var wantsXlsx = /(엑셀|excel|xlsx)/i.test(text);
            var wantsDocx = /(워드|word|docx)/i.test(text);
            if (wantsXlsx && wantsDocx) draft.format = 'both';
            else if (wantsXlsx) draft.format = 'xlsx';
            else if (wantsDocx) draft.format = 'docx';
        }
        // 💡 "담당자는 박용훈"처럼 명사 뒤에 조사(는/은/가/이)가 바로 붙는 한국어 어순을 감안
        //    해서, "담당자"/"팀장" 뒤에 조사 하나를 건너뛸 수 있게 함(브라우저 테스트로 이
        //    조사 처리가 빠졌던 버그를 발견해 수정, 2026-09-15).
        var wm = text.match(/담당자(?:는|은|가|이)?\s*(?:이름)?\s*[:：]?\s*([가-힣]{2,4})/);
        if (wm) draft.writer = wm[1];
        var lm = text.match(/팀장(?:는|은|가|이)?\s*(?:이름)?\s*[:：]?\s*([가-힣]{2,4})/);
        if (lm) draft.leader = lm[1];
        if (/가승인원/.test(text)) draft.isPre = true;
        else if (/정식\s*승인원?|정식\s*승인/.test(text)) draft.isPre = false;
        var rm = text.match(/rev(?:ision)?\s*(?:번호)?\s*[:：]?\s*(\d{1,3})/i);
        if (rm) draft.rev = rm[1].length === 1 ? ('0' + rm[1]) : rm[1];
        var mk = text.match(/remark\s*[:：]\s*(.+)$/i) || text.match(/비고\s*[:：]\s*(.+)$/);
        if (mk) draft.remark = mk[1].trim();

        // 💡 [2026-09-15 신규, 사용자 요청] 줄단위 순서 매칭 폴백 — "엑셀/박용훈/박성준/
        //    정식승인/해당없음"처럼 "담당자는"/"팀장은" 같은 라벨 없이 순서대로(한 줄씩 또는
        //    쉼표로 나열해서 한 줄로) 답하면 위 라벨 기반 정규식이 하나도 못 건지고 계속
        //    되묻던 문제 — 질문이 항상 "출력형식→담당자→팀장→가승인원여부(→Revision→
        //    Remark)" 고정 순서로 나열되므로, 사용자도 대개 그 순서 그대로 답한다는 점에
        //    착안했다. emptySlots는 위 라벨 기반 파싱이 끝난 *뒤* 상태 기준이라 이미 채워진
        //    항목(예: "엑셀"이 어디 있든 키워드만으로 바로 잡히는 출력형식)은 자동으로 제외됨.
        //    ⚠️ 그런데 "엑셀"/"정식승인" 같은 키워드 매칭은 줄 위치와 무관하게 전체 텍스트에서
        //    바로 잡히므로, 그 줄을 그대로 두면 "줄 개수"에는 남아서 나머지 빈 항목과 순서가
        //    밀려버린다(실제로 처음 이렇게 짰다가 "엑셀/박용훈/박성준/정식승인/해당없음" 5줄
        //    중 담당자/팀장이 안 채워지는 회귀를 발견해 고침) — 그래서 이미 이번 메시지에서
        //    값이 잡힌 필드에 해당하는 키워드/라벨을 포함한 줄은 `consumedPatterns`로 걸러내
        //    "순서 매칭용 줄" 목록에서 아예 뺀다.
        //    ⚠️ 라벨(담당자/팀장/rev/remark)을 조금이라도 썼으면(wm/lm/rm/mk 중 하나라도 매치)
        //    이 폴백 자체를 건너뛴다 — "담당자는 김철수\n박영수"처럼 라벨+위치가 섞이면, 아직
        //    안 채워진 필드가 고정 순서상 여러 개 있을 때 "그 다음 줄이 정확히 어느 빈 항목을
        //    가리키는지" 확신할 수 없다(예: 이 예시에서 "박영수"는 팀장을 뜻한 것이지만,
        //    "출력형식"이 아직 안 정해졌다면 고정 순서상 그게 먼저 걸려 잘못 배정될 위험이
        //    있음 — 실제로 테스트하다 발견). 라벨을 하나도 안 써서 순서 전체를 그대로 믿을 수
        //    있는 경우(엑셀/정식승인처럼 키워드만으로 잡히는 것 제외)에만 폴백을 적용한다.
        var usedAnyLabel = !!(wm || lm || rm || mk);
        var fieldSlots = [
            { key: 'format', empty: !draft.format },
            { key: 'writer', empty: !draft.writer },
            { key: 'leader', empty: !draft.leader },
            { key: 'isPre', empty: draft.isPre === undefined },
            { key: 'rev', empty: !draft.rev },
            { key: 'remark', empty: !draft.remark },
        ];
        var emptySlots = fieldSlots.filter(function(f) { return f.empty; });
        if (!usedAnyLabel && emptySlots.length) {
            var segments = text.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
            if (segments.length <= 1) segments = text.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
            var consumedPatterns = [];
            if (draft.format) consumedPatterns.push(/(둘\s*다|둘다|모두|both|엑셀|excel|xlsx|워드|word|docx)/i);
            if (draft.isPre !== undefined) consumedPatterns.push(/(가승인원|정식)/);
            if (wm) consumedPatterns.push(/담당자/);
            if (lm) consumedPatterns.push(/팀장/);
            if (rm) consumedPatterns.push(/rev(?:ision)?/i);
            if (mk) consumedPatterns.push(/remark|비고/i);
            var filteredSegments = segments.filter(function(seg) {
                return !consumedPatterns.some(function(p) { return p.test(seg); });
            });
            var naLike = /^(해당\s*없음|없음|no|none|n\/a|-)$/i;
            if (filteredSegments.length >= 1 && filteredSegments.length <= emptySlots.length) {
                for (var i = 0; i < filteredSegments.length; i++) {
                    var slot = emptySlots[i].key;
                    var seg = filteredSegments[i];
                    if (slot === 'format') {
                        if (/(둘\s*다|둘다|모두|both)/i.test(seg)) draft.format = 'both';
                        else if (/(엑셀|excel|xlsx)/i.test(seg)) draft.format = 'xlsx';
                        else if (/(워드|word|docx)/i.test(seg)) draft.format = 'docx';
                    } else if (slot === 'writer' || slot === 'leader') {
                        var nameM = seg.match(/([가-힣]{2,4})/);
                        if (nameM) draft[slot] = nameM[1];
                    } else if (slot === 'isPre') {
                        if (/가승인원/.test(seg)) draft.isPre = true;
                        else if (/정식/.test(seg)) draft.isPre = false;
                    } else if (slot === 'rev') {
                        var revM = seg.match(/(\d{1,3})/);
                        if (revM) draft.rev = revM[1].length === 1 ? ('0' + revM[1]) : revM[1];
                        // "해당없음"류는 그냥 건너뜀(생략 시 기본값 "00" 적용, 위 안내문과 동일).
                    } else if (slot === 'remark') {
                        if (!naLike.test(seg)) draft.remark = seg;
                    }
                }
            }
        }

        return draft;
    };

    // 📄 [2026-09-14 신규] "SAP에서 P01 문서 열어줘/다운로드해줘" — 질문 문자열만 보고 로컬에서
    //    바로 판정(문서 타입 코드를 추출)한다. 실제 실행은 비동기(백엔드 왕복)라 sendGanttQaMessage
    //    쪽에서 이 반환값을 보고 별도 async 블록으로 처리한다(다른 로컬 명령들처럼 여기서 바로
    //    답변 문자열까지 만들지 않는 이유). 문서 타입 코드는 이 회사 SAP의 실제 문서 타입
    //    패턴(P01/C04/Q11/P07 등 — 대문자 1글자 + 숫자 2자리)에 맞춘 정규식으로 추출.
    // 💡 [2026-09-15 신규] 문서 타입 코드 추출 공용 헬퍼 — 이 회사 SAP 문서 타입은 보통 letter+
    //    숫자 2자리(P01/C04/Q11)지만, 사람이 "P1"처럼 자릿수를 안 채우고 줄여 말하는 경우가
    //    실사용에서 확인됨("128808,115518 ... P1 문서 열어줘") — letter+숫자 1~2자리를 다
    //    받아들이고, 1자리면 앞에 0을 채워 표준형(P1→P01)으로 맞춘다. 문서 타입 판정이 필요한
    //    모든 곳(단일 열기/배치 다운로드)이 이 함수 하나를 공유 — 정규식을 각자 따로 두면 나중에
    //    한쪽만 고치고 다른 쪽을 빠뜨리는 실수가 재발하기 쉬움.
    window._ganttQaExtractSapDocTypeCode = function(text) {
        var m = (text || '').match(/\b([A-Za-z])([0-9]{1,2})\b/);
        if (!m) return null;
        var digits = m[2].length === 1 ? ('0' + m[2]) : m[2];
        return (m[1] + digits).toUpperCase();
    };

    window._ganttQaExtractSapOpenDocRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        // 💡 [2026-09-15 게이트 확장] "SAP"를 안 붙이고 "104446 P01 문서 열어줘"처럼 자재번호만
        //    있어도 인식하도록 확장 — 사용처 조회/승인원 표지 트리거를 넓힌 것과 같은 이유로
        //    사용자 요청에 따라 검토·적용함("문서/파일"+동사+자재번호 조합은 SAP 문맥 외엔
        //    나올 일이 거의 없다고 판단). "SAP" 언급이 없으면 자재번호(5~8자리)가 있어야만
        //    통과하고, 아래에서 문서 타입 코드까지 확인하므로 오탐 위험은 낮다. 단, 엑셀
        //    내보내기(`_ganttQaExtractSapExportRequest`)는 자재번호 같은 anchor가 없는 순수
        //    catch-all이라 여기 포함 안 함 — "SAP" 요구를 그대로 유지(무관한 엑셀 저장
        //    요청을 잘못 가로챌 위험이 커서 일부러 안 넓혔다).
        var hasMatNum = /\b\d{5,8}\b/.test(text);
        if (!/sap/i.test(text) && !hasMatNum) return null;
        // 💡 [2026-09-15] "문서"뿐 아니라 "파일"이라고만 말하는 경우도 실사용에서 확인됨
        //    (예: "SAP에서 106188 품번 정보 및 파일 열어줘") — 둘 다 트리거하도록 확장.
        if (!/(문서|파일)/.test(text)) return null;
        if (!/(열어|열기|다운로드|출력|보여|open)/i.test(text)) return null;
        // 💡 "문서 열기 가능해?"류 여부-질문까지 실행으로 오인하지 않도록(엑셀 내보내기 명령과 동일한
        //    가드 패턴 — 위 looksLikeQuestion 참고).
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return null;
        var docType = window._ganttQaExtractSapDocTypeCode(text);
        if (!docType) return null;
        // 💡 [2026-09-15 신규] 자재번호(이 회사 SAP은 5~8자리 순수 숫자)가 같이 언급돼 있으면 같이
        //    추출 — 있으면 "지금 열려 있는 화면"에 의존하지 않고 백엔드가 MM03으로 직접 이동해
        //    조회한다(sap_bridge_32.py의 _navigate_to_material_document_tab). 문서 타입 코드
        //    (P01 등)는 숫자만으로 된 문자열이 아니라 이 정규식과 겹치지 않는다.
        var matM = text.match(/\b(\d{5,8})\b/);
        return { docType: docType, material: matM ? matM[1] : null };
    };

    // 📄 [2026-09-15 신규] "SAP에서 106188 품번 정보 및 파일 열어줘"처럼 자재번호는 있지만
    //    정확한 문서 타입 코드(P01 등)를 모른 채 말했을 때 — 위
    //    _ganttQaExtractSapOpenDocRequest는 문서 타입 코드가 없으면 null을 반환하고 넘어가므로,
    //    그 다음으로 이 함수가 "자재번호만으로 문서 목록을 보여달라"는 요청인지 판정한다.
    //    (sendGanttQaMessage에서 open-doc 판정이 null일 때만 이 함수를 호출 — 순서 중요.)
    window._ganttQaExtractSapListDocsRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        // 💡 [2026-09-15 게이트 확장] 위 _ganttQaExtractSapOpenDocRequest와 동일한 이유 —
        //    "SAP" 없어도 자재번호(5~8자리)가 있으면 통과. 아래에서 자재번호를 어차피 다시
        //    확인하므로(없으면 null) 이중 체크지만, 게이트를 명확히 하기 위해 유지.
        var hasMatNum = /\b\d{5,8}\b/.test(text);
        if (!/sap/i.test(text) && !hasMatNum) return null;
        if (!/(문서|파일)/.test(text)) return null;
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return null;
        // 문서 타입 코드(P01/P1 등)가 이미 명시돼 있으면 이 함수의 대상이 아님(open 쪽에서 처리).
        if (window._ganttQaExtractSapDocTypeCode(text)) return null;
        var matM = text.match(/\b(\d{5,8})\b/);
        if (!matM) return null;
        return matM[1];
    };

    // 🔍 [2026-09-16 신규] "*01+01*500*로 조회된 아이템 승인원 다운로드해줘"처럼 자재번호를
    //    직접 나열하는 대신 자재내역(설명) 와일드카드 패턴으로 매치되는 자재를 전부 찾아
    //    문서를 다운로드하는 요청 — 사용자가 제공한 SAP GUI 매크로("디스크립션 검색.vbs")로
    //    발견한 기능이지만, 실사용 라이브 진단 결과 매크로보다 훨씬 단순하게 구현 가능함을
    //    확인함(MM60의 평범한 자재번호 필드에서 F4만 누르면 같은 검색도움말이 뜨고, 결과를
    //    "라벨 매트릭스"로 전부 읽을 수 있어 매크로처럼 하나씩 더블클릭해 고를 필요가 없음
    //    — sap_bridge_32.py의 resolve_materials_by_description_pattern 주석 참고).
    //    트리거는 "*"가 포함된 공백-구분 토큰 하나(패턴 자체) + "문서/승인원" + "다운로드"류
    //    동사 — 패턴 자체가 이미 충분히 구체적인 신호라 "SAP" 단어 없이도 인식한다(이
    //    프로젝트의 기존 관례 — 자재번호 anchor가 있는 로컬 명령들과 동일한 원칙).
    window._ganttQaExtractSapPatternDownloadRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        var tokens = text.split(/\s+/);
        var patternToken = tokens.filter(function(t) { return t.indexOf('*') !== -1; })[0];
        if (!patternToken) return null;
        if (!/(문서|파일|승인원)/.test(text)) return null;
        if (!/(열어|열기|다운로드|출력|보여|저장|받아|open)/i.test(text)) return null;
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return null;
        var docType = window._ganttQaExtractSapDocTypeCode(text);
        return { pattern: patternToken, docType: docType || 'P01' };
    };

    // 💡 [2026-09-16 신규, 사용자 요청] "01+01*150 승인원 다운로드해줘"처럼 자재내역 패턴
    //    검색을 하려는 게 분명해 보이는데 와일드카드 "*"를 빼먹은 경우 — 위
    //    `_ganttQaExtractSapPatternDownloadRequest`는 `*`가 있는 토큰이 없으면 그냥 null을
    //    반환하고 조용히 넘어가버려서, 사람은 "왜 반응이 없지"라고 헷갈리게 된다(패턴 없이는
    //    AI가 일반 대화로 받아 "그런 자재를 찾을 수 없습니다" 류로 엉뚱하게 답할 위험도 있음).
    //    이 코드베이스가 반복해온 "당연히 될 줄 알았는데 안 된다" 버그 패턴과 같은 종류라,
    //    이번엔 아예 요청을 처리하는 대신 **명확한 사용법 안내로 먼저 되묻는다** — 승인원
    //    표지의 "여러 턴 draft"들과 달리 상태를 남기지 않는 1회성 안내(사람이 "*"를 넣어
    //    다시 물으면 위 함수가 정상적으로 트리거되므로 별도 후속 처리가 필요 없음).
    //    판정 기준: 이미 `*`가 있으면(정상 트리거 대상이므로) 관여 안 함 + "문서/파일/승인원"
    //    +"다운로드"류 동사는 있는데 + `+`로 이어진 코드 조각(이 회사 자재내역 패턴의 특징적
    //    형태, 예: "01+01", "AP01+AP01" — 실사용 라이브 진단으로 확인한 실제 자재내역 표기
    //    관례)이 있고 + 자재번호(5~8자리)가 2개 이상 명시되진 않은(그러면 기존 배치 다운로드
    //    가 정상 처리) 경우만.
    window._ganttQaExtractSapPatternDownloadHint = function(question) {
        var text = (question || '').trim();
        if (!text) return false;
        if (text.indexOf('*') !== -1) return false; // 이미 * 있으면 정상 경로가 처리
        if (!/(문서|파일|승인원)/.test(text)) return false;
        if (!/(열어|열기|다운로드|출력|보여|저장|받아|open)/i.test(text)) return false;
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return false;
        var looksLikePatternFragment = /[0-9A-Za-z]+\+[0-9A-Za-z]+/.test(text);
        if (!looksLikePatternFragment) return false;
        var hasMatNums2 = (text.match(/\b\d{5,8}\b/g) || []).length >= 2;
        if (hasMatNums2) return false; // 이미 자재번호 나열이면 기존 배치 다운로드가 처리
        return true;
    };

    // 📥 [2026-09-15 신규, 같은 날 트리거 단어 확장] "SAP에서 133012, 133010, 101831 문서
    //    다운로드해줘" 또는 "...문서 열어줘"/"...엑셀 출력해주고 문서 열어줘"처럼 자재번호를
    //    2개 이상 말한 경우 — MM03을 자재마다 드릴다운하는 대신 회사 SAP의 전용 배치 리포트
    //    ZDMSR004로 한 번에 C:\SAP_DMS\에 다운로드한다(백엔드 /sap-download-documents-batch).
    //    💡 트리거 단어를 처음엔 "다운로드/저장"만 인정했는데, 실사용에서 "...문서 열어줘"처럼
    //    자재가 2개 이상인데도 "열어줘"만 쓰는 경우가 확인됨(2개 이상 자재는 어차피 한 번에
    //    "여는" 방법이 이 배치 다운로드뿐이라 — 여러 파일을 동시에 인터랙티브하게 열 수는 없음) —
    //    그래서 단일 열기와 동일한 트리거 단어 집합(열어/열기/다운로드/출력/보여/저장/open)을
    //    쓰도록 넓혔다. "열어줘"만 있고 자재가 1개면 이 함수는 materials.length<2 조건에서
    //    걸러지고 기존 _ganttQaExtractSapOpenDocRequest(단일 드릴다운) 쪽에서 처리 —
    //    sendGanttQaMessage에서 이 함수를 그 함수보다 먼저 체크해야 다중 자재 요청이 단일 열기로
    //    잘못 판정되지 않는다.
    window._ganttQaExtractSapBatchDownloadRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        // 💡 [2026-09-15 게이트 확장] 위 두 함수와 동일한 이유 — "SAP" 없어도 자재번호가
        //    2개 이상 있으면 통과(아래에서 다시 확인). 자재번호가 여러 개 나열된 것 자체가
        //    이미 충분히 구체적인 신호라고 판단.
        var hasMatNums2 = (text.match(/\b\d{5,8}\b/g) || []).length >= 2;
        if (!/sap/i.test(text) && !hasMatNums2) return null;
        if (!/(열어|열기|다운로드|출력|보여|저장|open)/i.test(text)) return null;
        if (!/(문서|파일)/.test(text)) return null;
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return null;
        var materials = text.match(/\b\d{5,8}\b/g) || [];
        materials = materials.filter(function(m, i) { return materials.indexOf(m) === i; }); // 중복 제거
        if (materials.length < 2) return null; // 자재 1개면 기존 단일 경로가 처리
        var docType = window._ganttQaExtractSapDocTypeCode(text);
        return { materials: materials, docType: docType || 'P01' };
    };

    // 📦 [2026-09-16 신규, 사용자 요청] "123456 품목 내역 보여줘"/"123456,654321 품목 내역
    // 알려줘" — 자재번호(들)로 "품목"(자재내역, MAKT-MAKTX, 40자 제한)을 물어보는 요청.
    // ⚠️⚠️ SAP에는 이 설명이 실제로는 2개 필드로 나뉘어 있다는 게 라이브 진단+사용자 제공
    // 스크린샷으로 확인됨: MM03 메인 화면의 자재내역(MAKTX)은 딱 40자까지만 담기고, 이름이
    // 40자를 넘으면 나머지가 "추가 데이터 → 기본 데이터 텍스트"(tabpZU05) 장문 텍스트에
    // 이어서 들어간다(사용자가 자재 132931로 실제 확인: MAKTX="GLASS CHEM>320,-,
    // STELLATPR,727X433.8,3T="(40자로 끊김) + 기본 데이터 텍스트=", BLK,-,ASF,-"). ZMM009
    // 같은 다중조회 화면에도 이 둘이 "자재내역(KO)"/"자재내역2(KO)" 두 컬럼으로 그대로
    // 노출됨(사용자 스크린샷으로 확인) — 즉 "품목2"는 새로 조회할 SAP 데이터가 아니라 이미
    // "승인원 표지" 기능이 자재마다 읽고 있던 바로 그 두 값(desc/sub)이다. **그래서 새 SAP
    // 자동화를 하나도 안 만들고, 이미 라이브 검증된 fetch_approval_info(자재마다 MM03 진입
    // → MAKTX 읽기 → VKey(30)로 "추가 데이터" 화면 진입 → tabpZU05 선택 → 장문 텍스트 읽기)
    // 와 그걸 감싼 백엔드 GET /sap-approval-fetch를 그대로 재사용한다** — "승인원 표지
    // 생성" 여러 턴 draft(window._ganttQaApprovalDraft)와는 완전히 무관한 별도의 1회성
    // 조회 명령(담당자/팀장 등을 안 물어봄, 그냥 바로 조회해서 보여줌)이라 별개 함수로 뺐다.
    window._ganttQaExtractMaterialInfoRequest = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        if (!/(품목|자재)/.test(text)) return null;
        if (!/(내역|정보|설명)/.test(text)) return null;
        var materials = (text.match(/\b\d{5,8}\b/g) || []).filter(function(m, i, a) { return a.indexOf(m) === i; });
        if (!materials.length) return null;
        return materials;
    };

    // 🤔 [2026-09-15 신규, 사용자 요청] "104446 문서 출력해줘"처럼 "출력"이라는 동사 하나만으로는
    //    "화면에 목록을 보여달라"는 건지 "파일을 저장(다운로드)해달라"는 건지 구분이 안 되는데,
    //    예전엔 이걸 그냥 조용히 "문서 목록 보기"로 결정해버렸다(다른 명확한 동사가 없으면
    //    _ganttQaExtractSapListDocsRequest가 기본으로 걸림). 사용자가 "파일을 저장하시길
    //    원하시나요? 출력물을 원하시나요?"처럼 애매하면 먼저 물어보는 방식을 요청해서, "열어/
    //    열기/보여/다운로드/저장/open"처럼 의도가 이미 명확한 동사가 하나도 없이 "출력"만 있는
    //    경우만 애매하다고 판단해 가로챈다(의도가 이미 명확하면 기존 경로가 그대로 처리하므로
    //    이 함수는 관여 안 함 — 새 마찰을 최소화). sendGanttQaMessage의 처리는 아래
    //    window._ganttQaSapDocClarify 상태 + 연속 처리 블록 참고.
    window._ganttQaExtractSapDocAmbiguous = function(question) {
        var text = (question || '').trim();
        if (!text) return null;
        if (!/(문서|파일)/.test(text)) return null;
        if (!/출력/.test(text)) return null;
        if (/(열어|열기|보여|다운로드|저장|open)/i.test(text)) return null;
        var looksLikeQuestion = /[?？]\s*$/.test(text) || /(가능|되나|될까|되는지|하나요)/.test(text);
        if (looksLikeQuestion) return null;
        var materials = (text.match(/\b\d{5,8}\b/g) || []).filter(function(m, i, a) { return a.indexOf(m) === i; });
        if (!materials.length) return null;
        return materials;
    };

    // 🤔 [2026-09-15 신규] 위 _ganttQaExtractSapDocAmbiguous가 애매하다고 판단해 되물은 뒤,
    //    사람의 다음 답("저장해줘"/"목록만 보여줘"/문서 타입 등)을 해석하는 상태 — 승인원 표지의
    //    window._ganttQaApprovalDraft와 같은 패턴(대화 내용과 별개로 "지금까지 파악된 것"만
    //    담음). null(진행 중 없음) 또는 {materials:[...], stage:'action'|'docType'}.
    window._ganttQaSapDocClarify = null;

    // 💡 실제 XLSX 조립 — "엑셀로 내보내줘" 처리(sendGanttQaMessage) 전용으로 분리(다른 곳에서도
    //    "마지막 SAP 조회 결과를 엑셀로" 재사용할 수 있게 window에 노출). 그리드 조회(source:'grid')는
    //    _sap_dump_grid(백엔드)가 만든 "제목행 + 탭구분 데이터행" 텍스트를 그대로 파싱하고,
    //    필드 조회(source:'fields', 그리드가 없는 화면)는 한 줄당 한 행짜리 단일 열로 내보낸다.
    // 💡 [2026-09-15 신규] SAP 그리드 헤더가 "MTART/MATNR/WERKS" 같은 내부 필드 코드로 나오는
    //    문제 — 원래는 코드가 `GetColumnTitle`(존재하지 않는 메서드명, 항상 조용히 실패)을
    //    불러서 폴백으로 코드가 그대로 나왔었다. 정확한 메서드명(`GetDisplayedColumnTitle`)을
    //    실사용 SAP GUI 세션에 직접 접속해 진단으로 확인했지만, **그 메서드가 반환하는 한글
    //    텍스트 자체가 SAP GUI Scripting 내부에서 이미 깨져서 나온다**(U+FFFD 복구불가 손실
    //    문자 확인 — Windows/SAP 세션 코드페이지는 둘 다 정상적으로 한국어(949/4110)였는데도
    //    발생 — SAP GUI Scripting 자체의 한글 처리 버그로 추정, Python/JS 쪽에서 되돌릴 방법
    //    없음). 그래서 API로 실시간으로 가져오는 대신, 자주 보이는 표준 SAP 필드명을 코드에
    //    직접 매핑해두는 방식으로 우회한다 — 사용자와 상의해 "헤더만이라도 우선 고치기"로
    //    결정함(전체 데이터 셀 값의 한글 손상은 별개의 더 큰 문제로, 이 사전으로는 해결 안 됨).
    //    ⚠️ [2026-09-15 갱신] 처음엔 표준 SAP 필드는 일반 지식으로, Z 커스텀 필드는 이전 화면
    //    캡처의 컬럼 순서 대조로 추정해서 신뢰도가 낮았는데, 사용자가 같은 조회의 "필드 코드"
    //    버전과 "정상 라벨" 버전 엑셀을 각각 BOM(ZPP038)·원자재(ZMM009) 두 화면 모두에 대해
    //    쌍으로 제공해줘서(BOM.xlsx↔BOM (2).xlsx, 원자재.xlsx↔원자재(2).xlsx), 두 파일의 헤더 행을
    //    같은 열 위치로 1:1 대조해 전부 실측값으로 교체함 — 이제 아래 표 전체가 추정이 아니라
    //    이 회사 실제 SAP 화면에서 직접 확인된 값이다(그래서 이전의 "표준 필드/커스텀 필드 신뢰도
    //    구분" 주석은 더 이상 의미가 없어 제거함). 일부 필드(MSTAV/MSTDV/GROES 등)는 그 회사 SAP가
    //    한국어 번역을 안 갖고 있어 실제로 영문("X-distr.chain status" 등)으로 표시된다는 것도
    //    이번에 확인됨 — 틀린 게 아니라 SAP 화면 자체가 그렇게 보임. MMSTA는 BOM 조회 화면에선
    //    "자재상태", 원자재(ZMM009) 조회 화면에선 "플랜트 고유 자재상태"로 서로 다르게 표시되는데
    //    (같은 필드, 리포트별 컬럼폭에 따른 축약으로 추정) 사전은 코드 하나에 값 하나만 가능해
    //    더 정확한 쪽(원자재 화면의 전체 표현)을 채택함. 목록에 없는 필드는 이전처럼 코드 그대로
    //    표시된다(틀린 한글보다는 원본 코드가 낫다는 판단) — 새 SAP 리포트에서 또 코드로 나오는
    //    필드를 발견하면, 이번처럼 "필드코드 버전"과 "정상라벨 버전" 엑셀을 나란히 받아 같은
    //    방식(열 위치 대조)으로 추가하는 게 화면 캡처 추정보다 훨씬 빠르고 정확하다.
    window._SAP_FIELD_LABEL_MAP = {
        AENNR: 'BOM 변경번호', ALPGR: '대체그룹', ALPRF: '우선순위',
        ALTSL: '선택방법', AWSLS: '원가차이키', BEIKZ: '자재공급지시자',
        BESKZ: '조달 유형', BEZEI1: 'Size Desc', BISMT: '기존자재번호',
        BKLAS: '평가클래스', BRGEW: '총중량', BSTME: '오더 단위',
        BSTMI: '최소 주문 수량', BSTRF: '최소 포장 수량', DISGR: 'MRP 그룹',
        DISLS: '로트크기유형', DISMM: 'MRP 유형', DISPO: 'MRP 관리자',
        DWERK: '납품 플랜트', DZEIT: '내부 생산', EBORT: '설치지점',
        EISBE: '안전 재고', EKALR: 'QS포함원가추정', EKGRP: '구매 그룹',
        EKWSL: '구매값키', EWAHR: '사용율', EXTWG: '외부자재그룹',
        FERTH: '생산/검사 메모', FEVOR: '생산 스케줄러', FHORI: '일정마진키',
        GEWEI: '중량단위', GROES: 'Size/dimensions', HERKL1: '원산국',
        HERKR1: '원산국', HKMAT: '자재원산지', HRKFT: '오리진 그룹',
        IDNRK: '구성부품', KAUSF: '구성부품스크랩 (%)', KORDB: '소스리스트',
        KTGRM: '계정지정그룹', LABOR: 'Laboratory/design office', LABST: '가용재고',
        LADGR: '적하그룹', LGFSB: '외부조달 저장위치', LGORT: '저장위치',
        LGPBE: '저장BIN', LGPRO: '생산저장위치', LOSGR: '원가계산 로트크기',
        MAABC: 'ABC 지시자', MAKTX: '자재내역(KO)', MATKL: '자재그룹',
        MATNR: '자재', MATNR2: '최상위코드', MBRSH: '산업유형',
        MEINH: 'Aun', MEINS: '기본단위', MEINS_B: 'Bun',
        MENGE: '수량', MFRNR: 'Manufacturer', MFRPN: '제조자부품번호',
        MINBE: '재주문점', MISKZ: 'Mixed MRP', MLAST: '가격결정',
        MMEIN: '단위', MMSTA: '플랜트 고유 자재상태', MSTAE: '플랜트간 자재상태',
        MSTAV: 'X-distr.chain status', MSTDV: 'Valid From', MTART: '자재유형',
        MTPOS: '품목범주그룹', MTPOS_MARA: '일반품목범주GR', MTSTB: '상태내역',
        MTVER1: '수출/수입 그룹', MTVFP1: '가용성  점검', MVGR1: 'Size',
        MVGR2: 'Mode', MVGR3: 'Touch Type', MVGR4: 'AD Board',
        MVGR5: 'Buyer', NAME1: '공급업체명', NCOST: '원가계산금지',
        NORMT: '인치 정보', NTGEW: '순중량', OCMPF: '전체프로파일',
        OJTXP: '구성부품내역', PEINH1: '가격단위', PLIFZ: '계획 납품 기간',
        POSNR: 'Item no.', POSTP: 'ICT', PRCTR: '손익 센터',
        RAUBE: '저장조건', RGEKZ: '백플러쉬', SAUFT: '반복제조',
        SBDKZ: '개별/일괄', SCHGT: '벌크자재', SFCPF: '생산일정 프로파일',
        SFEPR: 'REM프로파일', SKTOF: '현금할인', SOBSL: '특별조달유형',
        SPART: '제품군', STAWN1: '상품/수입 코드번호', STPRS1: '표준가',
        STPRS2: '기간별 단가', STRGR: '전략그룹', STUFE: '레벨',
        TAXM1: '세금분류1', TAXM2: '세금분류2', TRAGR: '운송그룹',
        UMREN: 'X', UMREZ: 'Y', USEQU: '쿼터 조정 사용',
        VERSG: '자재통계그룹', VINT1: '역방향소비기간', VINT2: '순방향소비기간',
        VKORG: '판매조직', VPRSV1: '가격지정', VRMOD: '소비모드',
        VTWEG: '유통경로', WEBAZ: '입고소요일수', WERKS: '플랜트',
        WGBEZ: 'Group1', WGBEZ60: 'Group2', XCHPF: '뱃치관리',
        ZDIV: 'Y/X', ZEOLFLG: 'EOL 구분', ZLIST: '대체 그룹 자재',
        ZLIST2: '대체 그룹 자재의 모품목', ZMATNR: '관련 패널품목', ZPLD1: '계획가격일 1',
        ZPLD2: '계획가격일 2', ZPLD3: '계획가격일 3', ZPLP1: '계획가격 1',
        ZPLP2: '계획가격 2', ZPLP3: '계획가격 3',
    };

    window._exportSapDataToExcel = function(cached) {
        if (typeof XLSX === 'undefined') throw new Error(window._t('엑셀 라이브러리를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'The Excel library has not loaded yet — please try again in a moment.'));
        var text = cached.text || '';
        // 헤더 3줄([SAP 화면: ...] / [트랜잭션: ...] / [상태표시줄: ...]?)과 그 뒤 빈 줄을 걷어내고,
        // 트랜잭션 코드는 파일명에 쓰려고 따로 뽑아둔다.
        var txMatch = text.match(/\[트랜잭션:\s*([^\]]*)\]/);
        var transaction = txMatch && txMatch[1].trim();
        if (!transaction) {
            // 💡 [2026-09-15 버그수정] BOM/사용처 헤더는 "[트랜잭션: ...]" 태그가 없어서 항상
            //    기본값 'SAP'로 떨어져 파일명이 "SAP_SAP_20260915.xlsx"처럼 서로 다른 조회여도
            //    매번 똑같아 보였다 — 실제 원인은 위 캐시 재사용 버그였지만, 파일명도 조회
            //    대상에 따라 달라지게 고쳐서 "다른 조회를 냈는데 결과가 똑같아 보이는" 혼란을
            //    줄인다. BOM/사용처 헤더에서 트랜잭션 코드+자재번호를 뽑아 대신 쓴다.
            var bomMatch = text.match(/BOM 전개\(([^)]+)\):\s*자재\s*([^,\]]+)/);
            var whereUsedMatch2 = text.match(/사용처 리스트\(([^)]+)\):\s*자재\s*([^\]]+)/);
            if (bomMatch) transaction = bomMatch[1] + '_' + bomMatch[2].trim().replace(/\s+/g, '');
            else if (whereUsedMatch2) transaction = whereUsedMatch2[1].split(',')[0] + '_' + whereUsedMatch2[2].trim().replace(/[\s,]+/g, '');
            else transaction = 'SAP';
        }
        var bodyStart = text.indexOf('\n\n');
        var body = bodyStart !== -1 ? text.slice(bodyStart + 2) : text;
        var lines = body.split('\n').filter(function(l) { return l.length > 0; });

        var rows;
        if (cached.source === 'grid') {
            rows = lines.map(function(l) { return l.split('\t'); });
            // 헤더 행(rows[0])의 필드 코드를 한글 라벨로 치환(사전에 없으면 코드 그대로 유지).
            if (rows.length) {
                rows[0] = rows[0].map(function(code) {
                    var key = (code || '').trim();
                    return window._SAP_FIELD_LABEL_MAP[key] || code;
                });
            }
        } else {
            rows = [[window._t('내용', 'Content')]].concat(lines.map(function(l) { return [l]; }));
        }
        if (!rows.length) throw new Error(window._t('내보낼 데이터가 없습니다.', 'No data to export.'));

        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(rows);
        var maxCols = rows.reduce(function(m, r) { return Math.max(m, r.length); }, 1);
        ws['!cols'] = new Array(maxCols).fill({ wch: 18 });
        XLSX.utils.book_append_sheet(wb, ws, 'SAP');
        if (typeof applyExcelStyles === 'function') applyExcelStyles(wb);

        var dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        var safeTransaction = String(transaction).replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
        var fileName = `SAP_${safeTransaction}_${dateStr}.xlsx`;
        // 💡 [2026-09-16 변경, 사용자 요청 "SAP 관련 저장 경로는 C:\SAP_DMS로 통일해줘"] 예전엔
        // XLSX.writeFile로 브라우저 다운로드를 직접 트리거해서 파일이 브라우저 기본 다운로드
        // 폴더(대부분 Downloads)에 떨어졌다 — 승인원 표지/구매오더/ZDMSR004 배치 다운로드는
        // 전부 C:\SAP_DMS\ 아래에 쓰는데 이 경로만 어긋나 있었다. 이제 다운로드를 트리거하지
        // 않고 base64로 인코딩해 반환만 한다 — 호출부가 백엔드(/sap-save-export)로 보내
        // C:\SAP_DMS\SAP조회\ 에 저장하고 자동으로 폴더를 열어준다(다른 SAP 기능들과 동일).
        var base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        return { fileName: fileName, base64: base64Data };
    };

    // ═══════════════════════════════════════════════════════════
    // 💡 [2026-09-08 신규] "대화가 그냥 버려지는 게 아깝다"는 피드백 대응 — 다만 매 턴마다 AI에게
    //    통째로 다시 분석시키면 토큰·속도만 늘어나므로(사용자와 상의해 결정), 여기선 AI 호출이
    //    전혀 없는 두 가지만 한다:
    //      1) 재질문 패턴 감지 — 방금 질문이 최근 대화 속 질문과 거의 같으면 "그 답변에 문제가
    //         있었을 수 있다"는 힌트만 표시(최종 👎 확정은 사람이 버튼으로). 기존 피드백/일괄개선
    //         파이프라인을 그대로 재사용 — 새 AI 호출 없음.
    //      2) 질문 문구 빈도 기록(gantt_qa_question_freq, localStorage) — "자주 묻는 질문"을
    //         AI 문답 빈 화면에 보여줘서 다른 사람이 뭘 물어봤는지 발견하기 쉽게 한다. 저장하는 건
    //         "질문 문구"뿐이고 답변 내용은 저장하지 않는다(모달 설명 문구에도 명시).
    // ═══════════════════════════════════════════════════════════
    window._ganttQaNormalizeQ = function(s) {
        return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?!.,~，。！]+$/g, '');
    };

    // 두 질문이 "거의 같은 질문"인지 판단 — 공백 기준 단어 비교는 한국어 조사("수요량이"/"수요량은"/
    // "수요량을")가 단어 끝에 그대로 붙어버려 같은 단어를 다른 단어로 오판하기 쉽다(실측 결과 "얼마야?"
    // vs "얼마입니까?"처럼 흔한 표현 차이에도 유사도가 절반 이하로 뚝 떨어짐). 형태소 분석기 없이도
    // 조사/어미 차이에 덜 민감하도록, 공백을 없앤 뒤 글자 2-그램(bigram) 집합의 자카드 유사도로 판단.
    // 🐛 [실측 검증 중 발견] 순수 bigram만 쓰면 "김철수님 지연 업무 있어?" ↔ "이철수님 지연 업무
    //    있어?"(사람이 다름!)가 0.82로 오히려 "김철수님"↔"김철수님 지연 업무 있나요?"(진짜 같은
    //    질문, 0.54)보다 더 비슷하다고 나옴 — 문장 틀이 같으면 이름 한 글자만 달라도 나머지 글자가
    //    다 겹쳐서 점수가 튀는 bigram의 약점. "OOO님"(이름)·"#G번호/번호"(행 번호)처럼 이 질문이
    //    "누구/무엇을 가리키는지" 결정하는 핵심 단서가 서로 다르면, 문장 형태가 아무리 비슷해도
    //    먼저 완전히 다른 질문으로 판정하고(0 반환), 그런 단서가 없거나 서로 같을 때만 bigram으로 비교.
    window._ganttQaQuestionSimilarity = function(a, b) {
        const na = window._ganttQaNormalizeQ(a);
        const nb = window._ganttQaNormalizeQ(b);
        if (!na || !nb) return 0;
        if (na === nb) return 1;

        const names = function(s) { return (s.match(/[가-힣]{2,4}님/g) || []).sort(); };
        const numbers = function(s) { return (s.match(/#?g?\d+/gi) || []).map(function(x) { return x.replace(/[^\d]/g, ''); }).sort(); };
        const eq = function(x, y) { return JSON.stringify(x) === JSON.stringify(y); };
        const namesA = names(na), namesB = names(nb);
        if (namesA.length && namesB.length && !eq(namesA, namesB)) return 0;
        const numsA = numbers(na), numsB = numbers(nb);
        if (numsA.length && numsB.length && !eq(numsA, numsB)) return 0;

        const flatA = na.replace(/\s+/g, ''), flatB = nb.replace(/\s+/g, '');
        const bigrams = function(s) {
            const set = new Set();
            for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
            return set;
        };
        const ga = bigrams(flatA), gb = bigrams(flatB);
        if (!ga.size || !gb.size) return 0;
        let inter = 0;
        ga.forEach(function(g) { if (gb.has(g)) inter++; });
        const union = ga.size + gb.size - inter;
        return union ? inter / union : 0;
    };

    // 최근 대화(최대 4턴=8메시지) 안에서 지금 질문과 비슷한 이전 질문 + 그 답변을 찾는다 — 너무
    // 옛날 대화까지 뒤지면 "그냥 관심사가 겹치는 것"까지 오탐할 위험이 있어 최근 것만 본다.
    window._ganttQaCheckReaskPattern = function(question) {
        const hist = window._ganttQaHistory || [];
        const RECENT_WINDOW = 8;
        const start = Math.max(0, hist.length - RECENT_WINDOW);
        for (let i = hist.length - 1; i >= start; i--) {
            const m = hist[i];
            if (m.role !== 'user') continue;
            // 💡 임계값 0.5 — 이 힌트는 잘못 떠도 사람이 클릭 한 번으로 넘기면 그만이라(AI 호출도,
            //    데이터 변경도 없음) 놓치는 것보다 조금 과하게 잡는 쪽이 낫다고 보고 다소 낮게 잡음.
            if (window._ganttQaQuestionSimilarity(question, m.text) >= 0.5) {
                for (let j = i + 1; j < hist.length; j++) {
                    if (hist[j].role === 'ai' && hist[j].uid && !hist[j].pending && !hist[j].error) return hist[j];
                }
            }
        }
        return null;
    };

    // "아니에요" 클릭 — 힌트만 조용히 지움(피드백을 남기지 않음, AI 호출도 없음)
    window._ganttQaDismissReaskHint = function(uid) {
        const m = (window._ganttQaHistory || []).find(function(x) { return x.uid === uid; });
        if (m) m.possibleDissatisfaction = false;
        window._renderGanttQaMessages();
    };

    // 🐛 [2026-09-12 개선] "자주 묻는 질문"이 이 브라우저(localStorage) 안에서만 쌓여서, 팀원이
    //    여러 명이면 한 사람 몫으로 "2번 이상"을 채우기 어렵고, 다른 사람이 뭘 자주 묻는지도 전혀
    //    안 보였다("운영이 안 된다"는 실사용 피드백). AI 학습 데이터(js/25-ai-learning.js)와 동일한
    //    패턴으로 확장 — ①localStorage 저장을 프로젝트(fileId)별로 나누고 ②저장할 때 프로젝트 JSON에
    //    같이 실어 Drive로 올리고(saveData.qaQuestionFreq) ③프로젝트를 열 때 Drive에서 받아온 걸
    //    로컬과 병합해서 팀 전체가 이 프로젝트에서 실제로 자주 묻는 질문을 서로 볼 수 있게 한다.
    //    질문 "문구"만 저장하고 답변 내용은 여전히 저장하지 않음(기존 방침 그대로).
    const _QA_FREQ_KEY = 'gantt_qa_question_freq_v2'; // v2: 구조가 [항목...] → {fileKey:[항목...]}로 바뀌어 키를 새로 씀
    const _QA_FREQ_MAX = 150; // 프로젝트당 localStorage 무한 증가 방지용 상한

    function _qaFreqStore() {
        try { return JSON.parse(localStorage.getItem(_QA_FREQ_KEY)) || {}; } catch (e) { return {}; }
    }
    function _qaFreqSaveStore(store) {
        try { localStorage.setItem(_QA_FREQ_KEY, JSON.stringify(store)); } catch (e) {}
    }
    // 프로젝트를 아직 저장하기 전(새 프로젝트, fileId 없음)이면 '_unsaved' 키에 임시로 쌓아두되,
    // 이 키는 saveData에 실어 Drive로 올리지 않는다(어느 프로젝트 것인지 알 수 없으므로).
    function _qaFreqKey(projectKey) { return projectKey || window.currentDriveFileId || window.currentDriveFileName || '_unsaved'; }

    window._ganttQaRecordQuestionFreq = function(question, projectKey) {
        const norm = window._ganttQaNormalizeQ(question);
        if (!norm || norm.length < 2) return;
        const key = _qaFreqKey(projectKey);
        const store = _qaFreqStore();
        let list = store[key] || [];
        const entry = list.find(function(x) { return x.norm === norm; });
        if (entry) {
            entry.count = (entry.count || 1) + 1;
            entry.lastAsked = Date.now();
            entry.sample = question; // 화면 표시용 — 가장 최근에 입력된 자연스러운 원문 표기를 씀
        } else {
            list.push({ norm: norm, sample: question, count: 1, lastAsked: Date.now() });
        }
        if (list.length > _QA_FREQ_MAX) {
            list.sort(function(a, b) { return (b.lastAsked || 0) - (a.lastAsked || 0); });
            list = list.slice(0, _QA_FREQ_MAX);
        }
        store[key] = list;
        _qaFreqSaveStore(store);
    };

    // "2번 이상" 물어본 것만 "자주"로 인정 — 한 번만 물어본 걸 예시로 보여주는 건 의미가 없음.
    // 지금 열려있는 프로젝트 것만 보여준다(다른 프로젝트에서 자주 묻던 질문은 여기 안 섞임).
    window._ganttQaGetTopQuestions = function(n, projectKey) {
        const key = _qaFreqKey(projectKey);
        const list = _qaFreqStore()[key] || [];
        return list
            .filter(function(x) { return (x.count || 1) >= 2; })
            .sort(function(a, b) { return (b.count - a.count) || ((b.lastAsked || 0) - (a.lastAsked || 0)); })
            .slice(0, n || 6);
    };

    /** 저장 시 호출 — 현재 프로젝트의 질문 빈도 배열을 반환하여 saveData.qaQuestionFreq에 담음. */
    window._ganttQaGetFreqForSave = function(projectKey) {
        const key = _qaFreqKey(projectKey);
        if (key === '_unsaved') return []; // 어느 프로젝트인지 모르는 임시 기록은 Drive에 올리지 않음
        return _qaFreqStore()[key] || [];
    };

    /**
     * 프로젝트 로드 시 호출 — Drive에서 받아온 질문 빈도를 이 브라우저의 기록과 병합.
     * norm(정규화된 질문 문구) 기준 union — 같은 질문이면 더 큰 count를 채택(정확한 팀 전체 합산은
     * 아니지만, 여러 사람이 각자 다른 브라우저에서 쌓은 기록이 저장될 때마다 한 값으로 수렴하므로
     * "이 질문을 여러 사람이 반복해서 물었다"는 신호로는 충분하다 — 정밀 집계가 필요한 데이터가 아님).
     */
    window._ganttQaMergeFreqFromDrive = function(driveEntries, projectKey) {
        if (!driveEntries || !driveEntries.length) return;
        const key = _qaFreqKey(projectKey);
        if (key === '_unsaved') return;
        const store = _qaFreqStore();
        const local = store[key] || [];
        const byNorm = {};
        local.forEach(function(e) { if (e && e.norm) byNorm[e.norm] = e; });
        driveEntries.forEach(function(e) {
            if (!e || !e.norm) return;
            const existing = byNorm[e.norm];
            if (!existing || (e.count || 1) > (existing.count || 1)) {
                byNorm[e.norm] = { norm: e.norm, sample: e.sample || e.norm, count: Math.max(e.count || 1, existing ? (existing.count || 1) : 0), lastAsked: Math.max(e.lastAsked || 0, existing ? (existing.lastAsked || 0) : 0) };
            }
        });
        let merged = Object.values(byNorm).sort(function(a, b) { return (b.lastAsked || 0) - (a.lastAsked || 0); });
        if (merged.length > _QA_FREQ_MAX) merged = merged.slice(0, _QA_FREQ_MAX);
        store[key] = merged;
        _qaFreqSaveStore(store);
    };

    // 💡 [2026-09-12 신규] "자주 묻는 질문" 원본은 문구가 토씨 하나만 달라도 별개 항목으로 쌓인다
    //    (_ganttQaNormalizeQ가 조사/어미까지는 안 지움) — 그대로 다 보여주면 "지연된 업무 있어?"/
    //    "지연된 업무가 있어?"가 각각 count=1인 채 따로 떠서 정작 "여러 사람이 자주 묻는 질문"이
    //    거의 안 뜬다. AI로 의미상 같은 질문을 묶어서 대표 문구 + 합산 횟수로 보여준다.
    //    비용/속도 때문에 매번 부르지 않고, 원본 구성(문구+횟수)이 실제로 바뀌었을 때만 새로 호출해
    //    캐시하고, 그 전까지는 캐시(또는 원본 그대로)를 즉시 보여준다 — 화면이 AI 응답을 기다리며
    //    멈추는 일은 없음.
    const _QA_CLUSTER_CACHE_KEY = 'gantt_qa_cluster_cache_v1';
    const _QA_CLUSTER_MIN_RAW   = 4; // 원본이 이보다 적으면 묶어봐야 의미 없어 AI 호출 안 함

    function _qaClusterCacheStore() {
        try { return JSON.parse(localStorage.getItem(_QA_CLUSTER_CACHE_KEY)) || {}; } catch (e) { return {}; }
    }
    function _qaClusterCacheSave(store) {
        try { localStorage.setItem(_QA_CLUSTER_CACHE_KEY, JSON.stringify(store)); } catch (e) {}
    }
    // 원본 목록의 "서명" — 문구+횟수 조합이 하나라도 바뀌면 달라짐(캐시 무효화 판단용)
    function _qaRawSignature(list) {
        return list.map(function(x) { return x.norm + ':' + (x.count || 1); }).sort().join('|');
    }

    /**
     * 빈 채팅창에 보여줄 "자주 묻는 질문" 목록 — AI로 묶은 결과가 있으면 그걸, 없으면(원본이 적거나
     * AI 키가 없거나 아직 클러스터링 전이면) 기존 방식("2번 이상"만 필터링한 원본)을 즉시 반환한다.
     * 캐시가 낡았으면 뒤에서 조용히 AI를 불러 캐시를 새로 채우고, 끝나면 onUpdated(clusters)로 알린다
     * (호출부에서 그 시점에도 채팅이 여전히 비어있으면 다시 그려서 자연스럽게 갱신).
     */
    window._ganttQaGetDisplayQuestions = function(n, projectKey, onUpdated) {
        const key = _qaFreqKey(projectKey);
        const raw = (_qaFreqStore()[key] || []).slice().sort(function(a, b) { return (b.count || 1) - (a.count || 1); });
        const fallback = function() { return raw.filter(function(x) { return (x.count || 1) >= 2; }).slice(0, n || 6); };
        if (raw.length < _QA_CLUSTER_MIN_RAW) return fallback();

        const apiKey = window.getActiveAiKey && window.getActiveAiKey();
        if (!apiKey) return fallback(); // AI 키 없으면 클러스터링 불가 — 기존 방식 그대로

        const sig = _qaRawSignature(raw);
        const cached = _qaClusterCacheStore()[key];
        if (!cached || cached.sig !== sig) {
            window._ganttQaRefreshClusterCache(key, raw, sig, onUpdated); // fire-and-forget
        }
        return (cached && cached.sig === sig && cached.clusters && cached.clusters.length) ? cached.clusters.slice(0, n || 6) : fallback();
    };

    window._ganttQaClusterInFlight = null; // 같은 서명으로 중복 호출 방지용
    window._ganttQaRefreshClusterCache = async function(key, raw, sig, onUpdated) {
        if (window._ganttQaClusterInFlight === sig) return;
        window._ganttQaClusterInFlight = sig;
        try {
            const apiKey = window.getActiveAiKey();
            const listText = raw.slice(0, 60).map(function(x, i) { return (i + 1) + '. "' + x.sample + '" (x' + (x.count || 1) + ')'; }).join('\n');
            const prompt = '다음은 어떤 회사 프로젝트 Gantt 챗봇에 실제로 입력된 사용자 질문 목록이다. 괄호 안 숫자는 그 문구가 입력된 횟수다.\n\n' +
                listText +
                '\n\n의미가 사실상 같은 질문(표현·조사·어미만 다름, 예: "지연된 업무 있어?"와 "지연된 업무가 있어?")끼리 묶어서, ' +
                '그룹마다 가장 자연스러운 대표 문구 하나와 그 그룹에 속한 항목들의 횟수 합계를 계산하라. ' +
                '완전히 다른 질문끼리는 절대 묶지 말 것. 합산 횟수 내림차순으로 최대 6개 그룹만, 다른 설명 없이 JSON 배열로만 응답하라:\n' +
                '[{"sample":"대표 질문 문구","count":합산횟수}, ...]';
            const result = await window.callAiBackend(apiKey, prompt, { isCancelled: function() { return false; }, maxRetryPerModel: 1 });
            if (!result || !result.ok) { console.warn('[AI문답 질문 클러스터링] 실패:', result && result.error); return; }
            const text = (result.data && result.data.result && result.data.result.candidates && result.data.result.candidates[0] &&
                result.data.result.candidates[0].content && result.data.result.candidates[0].content.parts &&
                result.data.result.candidates[0].content.parts[0].text) || '';
            const m = text.match(/\[[\s\S]*\]/);
            if (!m) { console.warn('[AI문답 질문 클러스터링] JSON 배열을 찾지 못함:', text.slice(0, 200)); return; }
            let clusters = JSON.parse(m[0]);
            if (!Array.isArray(clusters)) return;
            clusters = clusters.filter(function(c) { return c && c.sample; })
                .map(function(c) { return { sample: String(c.sample).slice(0, 120), count: Number(c.count) || 1 }; })
                .sort(function(a, b) { return b.count - a.count; })
                .slice(0, 6);
            const store = _qaClusterCacheStore();
            store[key] = { sig: sig, clusters: clusters, ts: Date.now() };
            _qaClusterCacheSave(store);
            console.info('[AI문답 질문 클러스터링] 갱신 완료:', key, clusters.length + '개 그룹');
            if (onUpdated) onUpdated(clusters);
        } catch (e) {
            console.warn('[AI문답 질문 클러스터링] 오류:', e.message);
        } finally {
            if (window._ganttQaClusterInFlight === sig) window._ganttQaClusterInFlight = null;
        }
    };

    // 💡 [2026-09-12 신규] 헤더에 항상 떠 있는 "자주 쓰는 질문" 드롭다운(#gantt-qa-freq-select) 채우기.
    //    대화 중에도(비어있지 않아도) 계속 갱신 가능하도록 _renderGanttQaMessages와 분리했다 —
    //    "한 번 대화하면 안 나오네" 실사용 피드백 반영. 실제 기록이 없으면(신규 프로젝트 등) 예전
    //    "예시 질문"과 같은 문구를 그대로 보여주되, 라벨은 항상 "자주 쓰는 질문"으로 통일한다.
    window._ganttQaPopulateFreqSelect = function(projectKey) {
        const sel = document.getElementById('gantt-qa-freq-select');
        if (!sel) return;
        const _fqEn = window._currentLang === 'en';
        const top = window._ganttQaGetDisplayQuestions
            ? window._ganttQaGetDisplayQuestions(6, projectKey, function() { window._ganttQaPopulateFreqSelect(projectKey); })
            : (window._ganttQaGetTopQuestions ? window._ganttQaGetTopQuestions(6, projectKey) : []);
        const examples = _fqEn
            ? ['Any delayed tasks?', "What's this project's annual demand volume?", 'Who is in charge of mechanical design?']
            : ['지연된 업무가 있어?', '이 프로젝트 연간 수요량이 얼마야?', '기구 담당자가 누구야?'];
        const options = top.length ? top.map(function(t) { return t.sample; }) : examples;
        const placeholderHtml = `<option value="">${_fqEn ? '(select a question)' : '(질문 선택하기)'}</option>`;
        sel.innerHTML = placeholderHtml + options.map(function(t) { return `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`; }).join('');
    };

    // 🎙️ [2026-09-08 수정] "음성문답" 버튼 — 한 번 말하면 풀리던 것을 "모드"로 바꿔 고정시킴.
    //    한 번 켜면(음성문답 모드 ON) 질문 → 자동전송 → 답변 수신까지 끝난 뒤 알아서 다시 듣기를
    //    시작해서, 사용자가 "글자문답"을 눌러 직접 끄기 전까지는 계속 음성으로 주고받을 수 있다.
    //    🐛 [2026-09-09 버그수정] 이 "계속 듣기" 방식이 모바일(특히 안드로이드)에서 문제였다 — rec.
    //    continuous=false라 잠깐이라도 조용하면(사용자가 아직 말을 안 했어도) onend가 발생하고, 그때마다
    //    아래 _ganttQaStartListening의 재시작 루프가 다시 rec.start()를 부른다. 그런데 안드로이드의
    //    SpeechRecognition은 start()/stop() 시점마다 브라우저/OS가 자체적으로 "띵" 알림음을 재생하는데
    //    (우리 코드가 만드는 소리가 아니라 안드로이드 SpeechRecognizer 서비스가 내는 네이티브 소리라
    //    Web Speech API에 볼륨 조절 파라미터 자체가 없음 — 미디어 볼륨을 낮춰도 안 줄어드는 게 바로
    //    이 때문이다), 이 재시작 루프가 사용자가 아무 말도 안 하는 동안에도 무음 타임아웃마다 계속
    //    돌면서 "띵동띵동"이 반복 재생되는 것으로 제보됨. 데스크톱은 이런 시끄러운 알림음이 없어
    //    "계속 듣기"가 원래 의도대로 편리하지만, 모바일에서는 한 번 듣고(말을 하든 못 하든) 자동으로
    //    "글자문답"으로 풀리게 원래 방식으로 되돌린다(_ganttQaStartListening의 onend 참고) — 재시작
    //    루프 자체가 없어지므로 반복 재생 문제가 사라진다(알림음 자체의 존재/음량은 안드로이드
    //    OS·브라우저 영역이라 이 앱에서 조절할 방법이 없음).
    window._ganttQaIsMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    window._ganttQaVoiceMode = false;

    window._ganttQaUpdateMicBtn = function() {
        const btn = document.getElementById('gantt-qa-mic-btn');
        if (!btn) return;
        const _mEn = window._currentLang === 'en';
        const on = window._ganttQaVoiceMode;
        btn.innerHTML = on ? (_mEn ? 'Text<br>Q&A' : '글자<br>문답') : (_mEn ? 'Voice<br>Q&A' : '음성<br>문답');
        btn.style.background = on ? '#c9ecd3' : '#e8f4fd';
        btn.style.borderColor = on ? '#a8dab8' : '#a5c8f0';
        btn.style.color = on ? '#1f7a3d' : '#1a4f7a';
        btn.title = on
            ? (_mEn ? 'Voice Q&A is ON — click to switch back to typing' : '음성문답 모드 켜짐 — 클릭하면 글자로 묻는 방식으로 돌아갑니다')
            : (_mEn ? 'Turn on voice Q&A — speak your question, hear the answer' : '음성문답 모드 켜기 — 말로 묻고 답도 음성으로 들을 수 있습니다');
    };

    // 실제로 한 번 듣기를 시작하는 내부 함수 — 음성문답 모드가 켜져있는 동안 질문 하나가 끝날 때마다
    //    (전송 + 답변까지 기다린 뒤) 스스로 다시 호출되어 "계속 듣는" 것처럼 동작한다.
    window._ganttQaStartListening = function() {
        if (!window._ganttQaVoiceMode) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            alert(window._currentLang === 'en'
                ? '⚠️ This browser does not support voice input. Please use Chrome or Edge.'
                : '⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다. Chrome이나 Edge를 사용해주세요.');
            window._ganttQaVoiceMode = false;
            window._ganttQaUpdateMicBtn();
            return;
        }
        const rec = new SR();
        rec.lang = window._currentLang === 'en' ? 'en-US' : 'ko-KR';
        rec.interimResults = true;
        // 🐛 [2026-09-09 버그수정] "몇 초 후 바로 분석이 시작돼서 말을 다 못 끝냈는데 잘림" 제보 —
        //    continuous=false에서는 브라우저 자체 VAD(음성감지)가 짧은 침묵만 감지해도 곧바로 마이크를
        //    끊어버려서(onend 발생), 그 시점 이후엔 뒤에 한 말이 아예 녹음조차 안 된다. continuous=true로
        //    바꿔서 마이크 자체는 끊기지 않고 계속 듣게 하고, "언제를 진짜 끝으로 볼지"는 아래 자체
        //    침묵 타이머(_ganttQaSilenceTimeout)로 직접 통제한다 — 말하는 동안엔(onresult) 계속 타이머를
        //    늘려서 절대 안 끊기고, 실제로 잠깐 멈추면(NO_SPEECH_MS/PAUSE_MS) 그때 rec.stop()을 호출해
        //    마무리한다.
        rec.continuous = true;
        rec.maxAlternatives = 1;
        let finalTranscript = '';
        // 🐛 [2026-09-18 버그수정] "음성으로 명령 내리면 단어를 반복해서 받아쓴다" 제보 — 바로 위
        //    2026-09-09 수정(continuous=true 전환)의 부작용이었다. continuous=false일 때는 발화
        //    1건당 결과가 딱 한 번씩만 오니 e.resultIndex부터 finalTranscript에 그냥 이어붙여도(+=)
        //    안전했는데, continuous=true에서는(특히 모바일 Chrome/Android SpeechRecognition
        //    구현체에서 흔히 보고되는 결함) 이미 isFinal로 확정된 구간을 e.resultIndex가 다시
        //    가리키며 재전송하는 경우가 있다 — 그때마다 이미 붙어있는 문장 뒤에 같은 단어를 또
        //    이어붙이니 "단어 반복" 증상이 된다. 수정: 문자열을 계속 이어붙이는(+=) 방식 대신,
        //    결과 인덱스별로 슬롯을 두고(finalSegments[i]) 매번 "그 자리 값을 덮어쓰는" 방식으로
        //    바꿨다 — 같은 인덱스가 몇 번을 다시 와도 그 자리 텍스트만 갱신될 뿐 누적되지 않는다
        //    (엔진이 resultIndex를 올바르게 매번 새 구간으로만 보내주는 정상 케이스에서도 결과는
        //    동일하므로 회귀 없음).
        let finalSegments = [];
        let _silenceTimer = null;
        const NO_SPEECH_MS = 8000; // 마이크를 켠 뒤 이 시간 안에 말을 시작 안 하면 포기하고 종료
        const PAUSE_MS = 3000;     // 한 번이라도 말한 뒤, 이만큼 조용해지면 "다 말했다"로 보고 종료
        const _armSilenceTimeout = function(ms) {
            if (_silenceTimer) clearTimeout(_silenceTimer);
            _silenceTimer = setTimeout(function() { try { rec.stop(); } catch (e) {} }, ms);
        };
        rec.onstart = function() { _armSilenceTimeout(NO_SPEECH_MS); };

        rec.onresult = function(e) {
            let interim = '';
            // 💡 위 주석 참고 — resultIndex부터가 아니라 매번 e.results 전체를 인덱스 기준으로
            //    다시 훑는다(누적 아님, 매번 최신 상태로 재구성). interim은 이벤트마다 새로 계산되니
            //    원래도 중복 위험이 없었고, final만 슬롯 덮어쓰기로 바꾸면 충분하다.
            for (let i = 0; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) finalSegments[i] = t;
                else interim += t;
            }
            finalTranscript = finalSegments.join('');
            const input = document.getElementById('gantt-qa-input');
            if (input) input.value = finalTranscript + interim;
            _armSilenceTimeout(PAUSE_MS); // 말이 들어올 때마다 타이머 리셋 — 계속 말하는 동안은 절대 안 끊김
        };
        rec.onerror = function(e) {
            // 🔒 마이크 권한 거부/마이크 없음처럼 재시도해도 절대 해결 안 되는 오류는 무한 재시도 루프로
            //    빠지지 않도록 음성문답 모드 자체를 끄고 한 번만 안내한다(그 외 no-speech/aborted 같은
            //    일시적 오류는 조용히 넘어가고 아래 onend에서 계속 듣기를 이어간다).
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
                window._ganttQaVoiceMode = false;
                window._ganttQaUpdateMicBtn();
                alert(window._currentLang === 'en'
                    ? '⚠️ Microphone access was denied (or no microphone found). Voice Q&A has been turned off.'
                    : '⚠️ 마이크 권한이 거부되었거나 마이크를 찾을 수 없습니다. 음성문답 모드를 껐습니다.');
            } else if (e.error !== 'aborted' && e.error !== 'no-speech' && window.showToast) {
                window.showToast((window._currentLang === 'en' ? '🎤 Voice recognition error: ' : '🎤 음성 인식 오류: ') + e.error, 'error');
            }
        };
        rec.onend = async function() {
            if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; } // 이미 끝났으니 남은 타이머 정리
            const input = document.getElementById('gantt-qa-input');
            if (finalTranscript.trim() && input) {
                input.value = finalTranscript.trim();
                await window.sendGanttQaMessage(); // 텍스트 답변까지 다 받은 뒤 진행
                await window._ganttQaWaitForSpeechEnd(); // 🐛 그 답을 스피커로 다 읽어줄 때까지 기다렸다가 다시 들어야 AI 목소리를 되받아 인식하지 않음
            }
            // 📱 [2026-09-09 버그수정] 모바일에서는 계속 재시작하지 않고(위 _ganttQaIsMobile 선언부 주석
            //    참고) 한 번 듣고(말을 했든 못 했든) 바로 "글자문답"으로 자동 복귀 — 반복 재시작으로
            //    인한 "띵동띵동" 무한 루프 자체를 없앤다.
            if (window._ganttQaIsMobile) {
                if (window._ganttQaVoiceMode) { window._ganttQaVoiceMode = false; window._ganttQaUpdateMicBtn(); }
                return;
            }
            // 그 사이 사용자가 "글자문답"을 눌러 모드를 껐으면 다시 듣지 않고 조용히 종료
            if (window._ganttQaVoiceMode) {
                setTimeout(function() { if (window._ganttQaVoiceMode) window._ganttQaStartListening(); }, 400);
            }
        };

        window._ganttQaRecognition = rec;
        try {
            rec.start();
        } catch (e) {
            // 이미 다른 인식이 돌고 있거나 마이크 오류 — 모드가 계속 켜져있으면 잠시 뒤 재시도
            if (window._ganttQaVoiceMode) setTimeout(function() { if (window._ganttQaVoiceMode) window._ganttQaStartListening(); }, 800);
        }
    };

    // "음성문답"/"글자문답" 버튼 클릭 — 모드 전체를 켜고 끄는 토글(순간 녹음 on/off가 아님)
    window._ganttQaToggleMic = function() {
        if (window._ganttQaVoiceMode) {
            window._ganttQaVoiceMode = false;
            if (window._ganttQaRecognition) {
                try { window._ganttQaRecognition.onend = null; window._ganttQaRecognition.stop(); } catch (e) {}
            }
            window._ganttQaUpdateMicBtn();
        } else {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                alert(window._currentLang === 'en'
                    ? '⚠️ This browser does not support voice input. Please use Chrome or Edge.'
                    : '⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다. Chrome이나 Edge를 사용해주세요.');
                return;
            }
            window._ganttQaVoiceMode = true;
            window._ganttQaUpdateMicBtn();
            window._ganttQaStartListening();
        }
    };

    // ✕ 닫기 — 모달을 닫을 때 켜져 있던 음성문답 모드/읽어주던 음성도 함께 정리
    window._ganttQaCloseModal = function() {
        if (window._ganttQaVoiceMode) {
            window._ganttQaVoiceMode = false;
            if (window._ganttQaRecognition) { try { window._ganttQaRecognition.onend = null; window._ganttQaRecognition.stop(); } catch (e) {} }
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const modal = document.getElementById('gantt-qa-modal');
        if (modal) modal.style.display = 'none';
    };

    // 📱 [2026-09-08 신규] 모바일(특히 iOS Safari)에서 "질문하고 답을 받을 때 화면이 크게 확대되어
    //    보이고, 직접 손가락으로 다시 줄여야 하는" 불편 대응. 이 앱은 <meta viewport>가 이미
    //    "width=1200, initial-scale=0.35"로 축소돼 있는데(데스크톱 레이아웃을 모바일 화면에 맞춰
    //    통째로 줄여 보여주는 방식), 그 위에서 글자 크기가 작은 입력창(gantt-qa-input, 12.5px)에
    //    포커스하면 브라우저가 "글자를 읽을 수 있는 배율까지" 자동으로 확대한다 — 이미 0.35배로
    //    축소된 상태라 그 보정폭이 매우 커 보이고(예: 1.2배 이상), blur해도 iOS는 배율을 자동으로
    //    되돌려주지 않아 사용자가 직접 핀치줌으로 축소해야 했다.
    //    포커스하는 동안 최대 배율을 "정상(1:1) 배율" 근처로만 제한해서 과도한 확대를 막고, blur 시
    //    원래 배율 지시문을 재적용해 확대 상태가 남지 않게 한다(blur 직전에 이미 최대 배율로 눌려
    //    있던 걸 그대로 복원하는 것이라 다시 튀어오르지 않음). 대부분의 휴대폰(화면 폭 <600px)에서는
    //    아래 계산식이 항상 1.0으로 수렴해 딱 정상 배율까지만 확대되고, 화면이 넓은 태블릿에서는
    //    AI 문답 모달(--modal-w-md: 600px)이 화면을 채우는 정도까지 좀 더 여유 있게 허용한다.
    window._ganttQaGuardMobileZoom = function(el) {
        if (!el || el._zoomGuardAttached) return;
        el._zoomGuardAttached = true;
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (!viewportMeta) return;
        const original = viewportMeta.getAttribute('content');
        const screenW = (window.screen && window.screen.width) || window.innerWidth || 400;
        const idealScale = Math.max(1, Math.min(3, screenW / 600)); // 600 = --modal-w-md, 휴대폰에선 사실상 항상 1.0
        el.addEventListener('focus', function() {
            viewportMeta.setAttribute('content', original + ', maximum-scale=' + idealScale.toFixed(2));
        });
        el.addEventListener('blur', function() {
            setTimeout(function() { viewportMeta.setAttribute('content', original); }, 300);
        });
    };

    // 💡 [2026-09-13 신규→버그수정] AI 문답 창 투명도 조절 — 헤더 슬라이더로 실시간 변경, localStorage에 저장.
    //    기본값은 100%(완전 불투명).
    //    🐛 [2026-09-13 버그수정 2] 원래 100% 미만일 때 backdrop-filter:blur(14px)를 같이 걸었는데(frosted
    //    glass 의도), 지난 세션까지는 투명도 슬라이더 자체가 드래그가 안 되는 버그(19-shared-modal-drag.js
    //    쪽 별도 수정 완료) 때문에 실사용자가 100% 미만 값을 낼 방법이 없어 이 blur 경로를 아무도 못 타고
    //    있었다 — 슬라이더 드래그를 고치고 나서야 비로소 "좁은 화면에서 뒤 내용을 살짝 보이게" 켜보면,
    //    ① 일부 환경에서 blur가 있는 상태로 알파 배경을 합성하는 게 아예 깨져 창 전체가 불투명한 흰색
    //    그대로 렌더링되고(맨 위 모듈 주석에 남아있던 "일부 환경에서 모달이 아예 안 보이는 렌더링 버그"와
    //    동일 계열), ② 설령 정상 렌더링되는 환경이어도 14px 블러는 뒤 텍스트를 알아볼 수 없을 만큼
    //    뭉개버려 "뒤에 뭐가 있는지 보려고" 만든 기능의 목적 자체를 무력화했다. blur를 완전히 제거하고
    //    순수 알파(rgba) 반투명만 쓰도록 변경 — 블러 없이 알파만 쓰면 렌더링도 안정적이고, 뒤 텍스트도
    //    (흐릿하지만) 실제로 식별 가능하게 비쳐 보인다.
    window._ganttQaSetBgAlpha = function(val) {  // val: 20~100 정수
        val = Math.max(20, Math.min(100, parseInt(val) || 100));
        const box = document.getElementById('gantt-qa-box');
        const drag = document.getElementById('gantt-qa-drag');
        if (!box) return;
        const a = val / 100;
        box.style.backdropFilter = '';
        box.style.webkitBackdropFilter = '';
        if (val >= 100) {
            box.style.background = '#ffffff';
            if (drag) drag.style.background = '#e7f3ff';
        } else {
            box.style.background = 'rgba(255,255,255,' + a + ')';
            if (drag) drag.style.background = 'rgba(231,243,255,' + Math.min(1, a + 0.1) + ')';
        }
        const lbl = document.getElementById('gantt-qa-opacity-label');
        if (lbl) lbl.textContent = val + '%';
        const sld = document.getElementById('gantt-qa-opacity-slider');
        if (sld && sld.value !== String(val)) sld.value = val;
        try { localStorage.setItem('gantt_qa_bg_alpha', val); } catch(e) {}
    };

    window.openGanttQaModal = function() {
        let modal = document.getElementById('gantt-qa-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9150; pointer-events:none; background:none;';
            // 💡 [2026-09-07 신규] "질문 대상" UI는 이 모달이 처음 만들어질 때 딱 한 번만 그려지고, 이후엔
            //    toggleLang()이 id 기반으로 다시 패치해줘야 언어 전환 시에도 즉시 반영된다(04j-core-app-
            //    upload-utils-5.js의 toggleLang() 안 'gantt-qa-target-label'/'gantt-qa-desc' 참고).
            const _qEn = window._currentLang === 'en';
            // 🐛 [2026-09-13 버그수정] 이전 세션에서 backdrop-filter:blur(14px)를 하드코딩했더니
            //    일부 환경에서 모달이 아예 안 보이는 렌더링 버그 발생 → 기본값을 완전 불투명(#fff)으로
            //    복원하고, 투명도는 헤더 슬라이더로 사용자가 직접 조절하는 방식으로 변경.
            modal.innerHTML = `
            <div id="gantt-qa-box" onclick="event.stopPropagation()" ondragover="window._ganttQaHandleDragOver(event)" ondragleave="window._ganttQaHandleDragLeave(event)" ondrop="window._ganttQaHandleDrop(event)" style="pointer-events:all; position:fixed; background:#ffffff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:380px;">
                <div id="gantt-qa-drag" style="padding:10px 14px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>💬 <span id="gantt-qa-title">${_qEn ? 'AI Q&A' : 'AI 문답'}</span></span>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <!-- 💡 [2026-09-13 버그수정] 기본 배경을 다른 모달의 헤더 버튼(예: AI 업무 분석 프롬프트
                             편집창의 🕒 이력 버튼)과 동일한 톤(#e8f4fd, 테두리 없음)으로 맞춰 헤더(#e7f3ff)
                             위에서 튀지 않게 통일 — 예전엔 #d8edfb로 더 진하게 박혀 있어 다른 모달과 이질적이었음. -->
                        <button id="gantt-qa-voice-toggle-btn" onclick="event.stopPropagation(); window._ganttQaToggleVoiceOutput()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:13px; cursor:pointer; padding:0 9px; height:26px; white-space:nowrap; transition:background .15s;">🔇</button>
                        <button id="gantt-qa-open-prompt-btn" onclick="event.stopPropagation(); window.openGanttQaPromptModal()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" title="AI 문답 프롬프트 편집" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 9px; height:26px; white-space:nowrap; transition:background .15s;">📝 프롬프트</button>
                        <!-- 💡 [2026-09-13 신규] 투명도 슬라이더 — 드래그해서 창 배경 투명도 실시간 조절.
                             배경도 위 두 버튼과 같은 개념(#e8f4fd, 테두리 없음)으로 통일. -->
                        <div onclick="event.stopPropagation()" style="display:flex; align-items:center; gap:3px; background:#e8f4fd; border-radius:6px; padding:2px 6px; border:none;" title="${_qEn ? 'Window opacity' : '창 투명도 조절'}">
                            <span style="font-size:11px; color:#5585a8; user-select:none;">🪟</span>
                            <input type="range" id="gantt-qa-opacity-slider" min="20" max="100" value="100" step="5"
                                   oninput="window._ganttQaSetBgAlpha(this.value)"
                                   style="width:55px; height:14px; cursor:pointer; accent-color:#1971c2; vertical-align:middle;">
                            <span id="gantt-qa-opacity-label" style="font-size:10px; color:#5585a8; min-width:28px; text-align:right; user-select:none;">100%</span>
                        </div>
                        <button onclick="event.stopPropagation(); window._ganttQaCloseModal()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:26px; height:26px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                    </div>
                </div>
                <div id="gantt-qa-desc" style="padding:8px 18px 0; font-size:10.5px; color:#999;">${_qEn ? 'Answers based on the currently open project\'s Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · Address Book (name/dept/title) data. (Conversation content isn\'t saved — only the question text is kept, anonymously, to power the "Frequently asked" suggestions)' : '현재 열려있는 프로젝트의 Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · 주소록(이름/부서/직함) 데이터를 근거로 답변합니다. (대화 내용 자체는 저장되지 않으며, 질문 문구만 "자주 묻는 질문" 추천에 쓰입니다)'}</div>
                <!-- 💡 [2026-09-08 신규] "답변이 늦어지면 사용자가 문제라고 오해하지 않게, 미리 안내해두면
                     좋겠다"는 요청 — 질문하기 전부터 "늦어질 수도 있다"는 기대치를 심어둬서, 실제로 늦어질
                     때 뜨는 단계별 안내(_ganttQaStartWaitingHints)가 "어? 왜 이러지"가 아니라 "아, 미리
                     말해준 그거구나"로 받아들여지게 한다. -->
                <div id="gantt-qa-delay-notice" style="padding:4px 18px 0; font-size:10.5px; color:#adb5bd;">${_qEn ? '⏱️ Some questions may take a bit longer to answer — if so, we\'ll keep you posted on screen.' : '⏱️ 질문에 따라 답변이 조금 늦어질 수 있어요 — 그럴 땐 화면에 진행 상황을 안내해드려요.'}</div>
                <!-- 💡 [2026-09-07 신규] 다른 프로젝트를 직접 골라서 물어보기 — AI가 스스로 판단해 찾아가는
                     자동 경로(🌐 다른 프로젝트 조회 규칙)와 별개로, 사람이 미리 지정해두면 왕복 없이 바로 답한다. -->
                <div style="padding:6px 18px 0; display:flex; align-items:center; gap:6px;">
                    <label id="gantt-qa-target-label" for="gantt-qa-target-project" style="font-size:10.5px; color:#888; white-space:nowrap;">${_qEn ? '📂 Target' : '📂 질문 대상'}</label>
                    <select id="gantt-qa-target-project" onchange="window._ganttQaOnTargetChange()" style="flex:1; min-width:0; font-size:11px; padding:3px 6px; border:1px solid #ccc; border-radius:5px; background:#fff; color:#333;">
                        <option value="">${_qEn ? 'Current project' : '현재 프로젝트'}</option>
                    </select>
                    <!-- 💡 [2026-09-07 신규] "질문 대상"만 고르면 왕복 없이 답하는 가벼운 조회 경로와 별개로,
                         진짜로 그 프로젝트를 열어서(=현재 프로젝트로 전환) 100% 동일한 조건으로 묻고 싶을
                         때를 위한 지름길 — AI가 실행형 요청에서만 띄우던 [[ACTION:OPEN_PROJECT_TO_EDIT]]
                         확인카드와 똑같이 executeLoadFile을 그대로 재사용한다. 다른 프로젝트가 선택된
                         동안에만 보임(현재 프로젝트일 땐 열 대상이 없으므로 숨김).
                    -->
                    <button id="gantt-qa-target-open-btn" onclick="window._ganttQaOpenTargetProject(this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" title="${_qEn ? 'Open this project (switch the current tab to it) and ask exactly as if it were already open' : '이 프로젝트를 열어서(현재 탭이 이 프로젝트로 전환됨) 실제로 열람 중인 것과 동일한 조건으로 질문합니다'}" style="display:none; flex-shrink:0; font-size:11px; padding:3px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:5px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">${_qEn ? '🔓 Open' : '🔓 열기'}</button>
                </div>
                <!-- 💡 [2026-09-12 신규] "자주 쓰는 질문" — 예전엔 채팅이 비어있을 때만(_renderGanttQaMessages
                     안에서) 잠깐 보이다가 질문 한 번 하면 사라졌음("한 번 대화하면 안 나오네" 실사용 피드백).
                     대화 중에도 계속 골라 쓸 수 있게 위 "질문 대상"과 같은 자리에 항상 보이는 행으로 고정.
                     선택하면 입력창에 채워짐(바로 전송 안 됨) — window._ganttQaFillQuestion 재사용. -->
                <div style="padding:4px 18px 0; display:flex; align-items:center; gap:6px;">
                    <label id="gantt-qa-freq-label" for="gantt-qa-freq-select" style="font-size:10.5px; color:#888; white-space:nowrap;">${_qEn ? '💡 Frequently used' : '💡 자주 쓰는 질문'}</label>
                    <select id="gantt-qa-freq-select" onchange="if(this.value){ window._ganttQaFillQuestion(this.value); this.selectedIndex=0; }" style="flex:1; min-width:0; font-size:11px; padding:3px 6px; border:1px solid #ccc; border-radius:5px; background:#fff; color:#333;">
                        <option value="">${_qEn ? '(select a question)' : '(질문 선택하기)'}</option>
                    </select>
                </div>
                <div id="gantt-qa-messages" style="overflow-y:auto; flex:1; padding:12px 16px; background:transparent;"></div>
                <!-- 📎 [2026-09-15 신규] "구매오더 요청" 기능용 PDF 첨부 — 지금은 이 용도가
                     유일한 첨부 기능이라, 첨부가 있는 채로 전송하면 항상 구매오더 추출 흐름을
                     탄다(window._ganttQaPendingAttachments 참고). 나중에 다른 첨부 용도가
                     추가되면 이 가정을 반드시 재검토할 것. -->
                <div id="gantt-qa-attach-strip" style="display:none; padding:6px 14px 0; flex-wrap:wrap; gap:6px;"></div>
                <div style="padding:10px 14px; border-top:1px solid #d0dde8; background:#f6f8fa; display:flex; gap:8px; align-items:stretch;">
                    <button id="gantt-qa-clear-btn" onclick="window.clearGanttQaChat()" onmouseover="this.style.background='#f8d4d4'; this.style.borderColor='#e59a9a';" onmouseout="this.style.background='#fdecec'; this.style.borderColor='#f0b8b8';" title="${_qEn ? 'Clear all messages in the current chat' : '현재 대화 내용을 모두 지웁니다'}" style="flex-shrink:0; padding:0 16px; background:#fdecec; color:#b03a3a; border:1px solid #f0b8b8; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:normal; line-height:1.25; text-align:center; transition:background .15s, border-color .15s;">${_qEn ? 'Clear<br>Chat' : '대화<br>삭제'}</button>
                    <!-- 📎 [2026-09-15 UI 변경, 사용자 요청] 아이콘 대신 다른 버튼들과 통일된
                         2줄 텍스트 라벨로, 색상은 초록 파스텔톤(이 앱의 "확인/승낙" 계열 버튼과
                         동일한 팔레트 — 🔓 열기/🤖 요청 버튼 참고)으로, 음성문답 버튼과 자리를
                         바꿔서(첨부 → 음성문답 순서) 배치. -->
                    <button id="gantt-qa-attach-btn" onclick="document.getElementById('gantt-qa-file-input').click()" title="${_qEn ? 'Attach a PDF (e.g. tax invoice/quote) — used for Purchase Order requests' : 'PDF 첨부(전자세금계산서/견적서 등) — 구매오더 요청에 사용됩니다'}" style="flex-shrink:0; padding:0 16px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:normal; line-height:1.25; text-align:center; transition:background .15s, border-color .15s;" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';">${_qEn ? 'Attach<br>File' : '첨부<br>파일'}</button>
                    <input type="file" id="gantt-qa-file-input" accept=".pdf,application/pdf" multiple style="display:none;" onchange="window._ganttQaHandleFileSelect(this)">
                    <button id="gantt-qa-mic-btn" onclick="window._ganttQaToggleMic()" title="${_qEn ? 'Turn on voice Q&A — speak your question, hear the answer' : '음성문답 모드 켜기 — 말로 묻고 답도 음성으로 들을 수 있습니다'}" style="flex-shrink:0; padding:0 16px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:normal; line-height:1.25; text-align:center; transition:background .15s, border-color .15s;">${_qEn ? 'Voice<br>Q&A' : '음성<br>문답'}</button>
                    <textarea id="gantt-qa-input" rows="3" placeholder="${_qEn ? 'Ask about this project... (Enter=Send, Shift+Enter=New line, ↑↓=History)' : '이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈, ↑↓=이전 질문)'}" style="flex:1; resize:none; padding:8px 10px; border:1px solid #b4c3d2; border-radius:6px; font-size:12.5px; font-family:inherit; line-height:1.4; background:#fff;" onkeydown="window._ganttQaHandleInputKeydown(event)"></textarea>
                    <button id="gantt-qa-send-btn" onclick="window.sendGanttQaMessage()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:0 16px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">${_qEn ? 'Send' : '전송'}</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('gantt-qa-box', 'gantt-qa-drag');
            window._bindClickToFront('gantt-qa-modal');
            window._ganttQaGuardMobileZoom(document.getElementById('gantt-qa-input')); // 📱 모바일 과도확대 방지
            // 저장된 투명도 복원 (최초 생성 시 1회)
            try {
                const saved = parseInt(localStorage.getItem('gantt_qa_bg_alpha') || '100');
                if (saved < 100) window._ganttQaSetBgAlpha(saved);
            } catch(e) {}
        }
        // 🐛 [2026-09-13 버그수정] 아래 함수들이 정의되기 전에(또는 04g 스크립트 로드 실패 시)
        //    openGanttQaModal이 호출되면 TypeError가 발생해 _openAndMinimize의 try-catch에 잡혀
        //    칩이 생성되지 않고 모달도 열리지 않았다. 모두 방어적 호출로 전환.
        if (window._renderGanttQaMessages)       window._renderGanttQaMessages();
        if (window._ganttQaPopulateProjectSelect) window._ganttQaPopulateProjectSelect(); // 열 때마다 다른 프로젝트 목록 최신화(그 사이 추가/삭제됐을 수 있음)
        if (window._ganttQaPopulateFreqSelect)    window._ganttQaPopulateFreqSelect(); // 열 때마다 "자주 쓰는 질문" 최신화
        if (window._ganttQaUpdateVoiceBtn)        window._ganttQaUpdateVoiceBtn(); // 🔊/🔇 저장된 상태(localStorage) 반영
        if (window._ganttQaUpdateMicBtn)          window._ganttQaUpdateMicBtn();
        modal.style.display = 'block';
        window.bringModalToFront('gantt-qa-modal');
        setTimeout(function() { const inp = document.getElementById('gantt-qa-input'); if (inp) inp.focus(); }, 50);
    };

    // 🐛 [2026-09-07 버그수정] "새로고침 후 로그인+프로젝트 열기 전에 이미 하단 taskbar에 AI 문답이
    //    최소화돼 있고, 그 칩으로 복원하면 질문 대상 드롭다운이 비어있음" — 페이지 로드 시 자동으로
    //    최소화되는 4개 모달(19-shared-modal-drag.js의 DEFAULTS)은 로그인/프로젝트 로드가 끝나기
    //    전(300ms 시점)에 이 모달을 열어 드롭다운을 딱 한 번 채운다 — 그 시점엔 구글 토큰이 없어
    //    _msLoadProjectIndex()가 빈 목록을 반환하므로 "현재 프로젝트"만 있는 채로 굳어버린다.
    //    상단 메뉴로 새로 열면(openGanttQaModal이 매번 _ganttQaPopulateProjectSelect를 다시 부름)
    //    멀쩡했던 이유가 이거였음. 타스크바 칩으로 "복원"만 하는 경로는 openGanttQaModal을 다시
    //    거치지 않으므로, 복원 시 다시 채우도록 공용 훅(window._modalRefreshOnRestore)에 등록해둔다.
    // 🐛 [2026-09-07 버그수정 2] 위 등록의 키를 'gantt-qa-modal'로 썼었는데, 최소화/복원 시스템은
    //    실제로 window._makeDraggable('gantt-qa-box', 'gantt-qa-drag')에 넘긴 첫 인자(박스 id)를
    //    키로 쓴다(19-shared-modal-drag.js의 window._modalMinimized/_modalRefreshOnRestore 조회 모두
    //    이 modalId로 이뤄짐) — 'gantt-qa-modal'은 실제로 표시/숨김 되는 오버레이 id일 뿐, 최소화
    //    시스템이 내부적으로 관리하는 키가 아니었다. 그래서 복원해도 이 훅이 영영 매칭되지 않아
    //    드롭다운이 계속 비어있었다("여전히 미해결" 재현 결과 실측 확인). 실제 키인 'gantt-qa-box'로
    //    수정.
    window._modalRefreshOnRestore = window._modalRefreshOnRestore || {};
    window._modalRefreshOnRestore['gantt-qa-box'] = function() {
        if (window._ganttQaPopulateProjectSelect) window._ganttQaPopulateProjectSelect();
    };

    // 💡 [2026-09-07 신규] "질문 대상" 드롭다운 채우기 — project_index.json의 가벼운 목록만 사용(전체
    //    프로젝트 데이터를 미리 다 불러오지 않음). 현재 열려있는 프로젝트는 어차피 기본값(현재 프로젝트)과
    //    같으므로 목록에서 제외.
    window._ganttQaPopulateProjectSelect = async function() {
        const sel = document.getElementById('gantt-qa-target-project');
        if (!sel) return;
        const _pEn = window._currentLang === 'en';
        try {
            const all = window._msLoadProjectIndex ? await window._msLoadProjectIndex() : [];
            const others = all.filter(function(p) { return p && p.drive_file_id && p.drive_file_id !== window.currentDriveFileId; });
            sel.innerHTML = '<option value="">' + (_pEn ? 'Current project' : '현재 프로젝트') + '</option>' + others.map(function(p) {
                // 💡 [2026-09-07] 모델명만으로는 같은 모델의 다른 인치가 헷갈려서 인치도 같이 표시.
                const label = [p.model ? (p.model + (p.inch ? ' ' + p.inch + '"' : '')) : '', p.customer].filter(Boolean).join(' · ') || p.file_name || (_pEn ? '(untitled)' : '(이름없음)');
                return `<option value="${escapeHtml(p.drive_file_id)}" data-label="${escapeHtml(label)}" data-filename="${escapeHtml(p.file_name || '')}">🌐 ${escapeHtml(label)}${p.completed ? (_pEn ? ' [Done]' : ' [완료]') : ''}</option>`;
            }).join('');
        } catch (e) {
            console.warn('[AI 문답] 질문 대상 프로젝트 목록 로드 실패:', e.message);
        }
        // 이전에 골라둔 프로젝트가 새로 채운 목록에도 있으면 선택 유지, 없으면(삭제됐거나 첫 로드) 현재 프로젝트로
        const target = window._ganttQaTargetProject;
        const stillExists = target && Array.from(sel.options).some(function(o) { return o.value === target.drive_file_id; });
        sel.value = stillExists ? target.drive_file_id : '';
        if (!stillExists && target) window._ganttQaTargetProject = null; // 목록에서 사라진 프로젝트를 조용히 가리키고 있지 않도록
        window._ganttQaUpdateOpenBtnVisibility();
    };

    // 💡 [2026-09-07 신규] "🔓 열기" 버튼 — 다른 프로젝트가 선택된 동안에만 보임(현재 프로젝트 선택 시 숨김)
    window._ganttQaUpdateOpenBtnVisibility = function() {
        const btn = document.getElementById('gantt-qa-target-open-btn');
        if (!btn) return;
        btn.style.display = window._ganttQaTargetProject ? 'block' : 'none';
    };

    // 💡 [2026-09-07 신규] "질문 대상" 드롭다운 변경 — 프로젝트를 바꾸면 이전 대화가 다른 프로젝트
    //    얘기와 섞여 혼란스러우므로 대화를 새로 시작한다(대화는 애초에 저장되지 않는 휘발성이라 손실 없음).
    window._ganttQaOnTargetChange = function() {
        const sel = document.getElementById('gantt-qa-target-project');
        if (!sel) return;
        const _tcEn = window._currentLang === 'en';
        const val = sel.value;
        const prevId = window._ganttQaTargetProject ? window._ganttQaTargetProject.drive_file_id : '';
        if (val === prevId) return; // 실제로 안 바뀜

        let newTarget = null;
        if (val) {
            const opt = sel.selectedOptions[0];
            newTarget = { drive_file_id: val, file_name: (opt && opt.dataset.filename) || '', label: (opt && opt.dataset.label) || val };
        }
        window._ganttQaTargetProject = newTarget;
        window._ganttQaUpdateOpenBtnVisibility();

        window._ganttQaHistory = [];
        window._ganttQaPendingMailDraft = null;
        window._ganttQaPendingNoticeDraft = null;
        window._ganttQaPendingAlarmDraft = null;

        const input = document.getElementById('gantt-qa-input');
        if (input) {
            input.placeholder = newTarget
                ? (_tcEn ? `Ask about [${newTarget.label}]... (Enter=Send, Shift+Enter=New line)` : `[${newTarget.label}] 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)`)
                : (_tcEn ? 'Ask about this project... (Enter=Send, Shift+Enter=New line)' : '이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)');
        }
        window._ganttQaHistory.push({
            role: 'ai',
            text: newTarget
                ? (_tcEn ? `🔀 You can now ask about **[${newTarget.label}]**. (New chat started)` : `🔀 이제부터 **[${newTarget.label}]** 프로젝트에 대해 질문할 수 있습니다. (새 대화 시작)`)
                : (_tcEn ? `🔀 Back to asking about the **currently open project**. (New chat started)` : `🔀 다시 **현재 열려있는 프로젝트**에 대해 질문합니다. (새 대화 시작)`)
        });
        window._renderGanttQaMessages();
        // 💡 [2026-09-12 신규] "자주 쓰는 질문"도 질문 대상이 바뀌면 그 프로젝트 기준으로 다시 채움
        window._ganttQaPopulateFreqSelect(newTarget ? newTarget.drive_file_id : null);

        // 💡 [2026-09-07 신규] 선택한 순간 미리 가져와둔다(fire-and-forget) — 사용자가 질문을 타이핑하는
        //    동안 Drive 조회가 끝나 있으면, 실제로 전송을 누를 때는 이미 캐시에 있어 지연이 거의 안 느껴짐.
        //    실패해도 여기선 조용히 넘어가고(에러 UI 없음) sendGanttQaMessage가 그때 다시 시도한다.
        if (newTarget) window._aiFetchManualTargetContext(newTarget).catch(function() {});
    };

    // 💡 [2026-09-07 신규] "🔓 열기" 버튼 — "질문 대상"으로 고른 다른 프로젝트를 실제로 열어(=현재 탭을
    //    그 프로젝트로 전환) executeLoadFile 100% 동일 경로(autosave/실행취소/변경이력/저장충돌감지가
    //    그대로 적용됨)로 진짜 "현재 프로젝트"로 만든다. AI가 실행형 요청에서만 스스로 판단해 띄우던
    //    [[ACTION:OPEN_PROJECT_TO_EDIT]] 확인카드(_aiOpenProjectAndReask)와 완전히 같은 open 경로를
    //    재사용하되, 여기선 "이어서 다시 물어볼 질문"이 아직 없으므로(사람이 먼저 대상만 고른 상태)
    //    재질문 없이 열기만 하고 안내 메시지를 남긴다 — 이후엔 평소 sendGanttQaMessage와 완전히 동일.
    window._ganttQaOpenTargetProject = async function(btn) {
        const target = window._ganttQaTargetProject;
        if (!target) return;
        const _oEn = window._currentLang === 'en';
        const openBtn = btn || document.getElementById('gantt-qa-target-open-btn');
        const prevLabel = openBtn ? openBtn.textContent : '';
        if (openBtn) { openBtn.disabled = true; openBtn.textContent = _oEn ? '⏳ Opening...' : '⏳ 여는 중...'; }
        try {
            if (!window.executeLoadFile) throw new Error(_oEn ? 'Could not find the project-open function.' : '프로젝트 열기 기능을 찾을 수 없습니다.');
            await window.executeLoadFile(target.drive_file_id, target.file_name, true); // silent=true — 안내는 아래서 직접 표시

            // 이제 이 프로젝트가 "현재 프로젝트"가 됐으므로 질문 대상 드롭다운을 되돌리고 버튼도 숨긴다.
            window._ganttQaTargetProject = null;
            const sel = document.getElementById('gantt-qa-target-project');
            if (sel) sel.value = '';
            window._ganttQaUpdateOpenBtnVisibility();
            window._ganttQaHistory = [];
            window._ganttQaPendingMailDraft = null;
            window._ganttQaPendingNoticeDraft = null;
            window._ganttQaPendingAlarmDraft = null;
            const input = document.getElementById('gantt-qa-input');
            if (input) input.placeholder = _oEn ? 'Ask about this project... (Enter=Send, Shift+Enter=New line)' : '이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)';

            window._ganttQaHistory.push({
                role: 'ai',
                text: _oEn
                    ? `🔓 Opened **[${target.label}]** — it is now the current project. Ask about it exactly as you would any open project. (New chat started)`
                    : `🔓 **[${target.label}]** 프로젝트를 열었습니다 — 이제 현재 프로젝트가 되었습니다. 실제로 열람 중인 프로젝트와 동일한 조건으로 자유롭게 질문해주세요. (새 대화 시작)`
            });
        } catch (e) {
            window._ganttQaHistory.push({ role: 'ai', text: (window._currentLang === 'en' ? '⚠️ Error: ' : '⚠️ 오류: ') + (e && e.message ? e.message : e), error: true });
        } finally {
            if (openBtn) { openBtn.disabled = false; openBtn.textContent = prevLabel; }
            window._renderGanttQaMessages();
        }
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
            const _en = window._currentLang === 'en';
            modal = document.createElement('div');
            modal.id = 'gantt-qa-prompt-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="gantt-qa-prompt-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="gantt-qa-prompt-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>📝 <span id="gantt-qa-prompt-title">${_en ? 'AI Q&A — Edit Prompt' : 'AI 문답 — 프롬프트 편집'}</span></span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <!-- 🐛 [2026-09-13 버그수정] 다른 프롬프트 편집창(예: AI 업무 분석 — 프롬프트 편집의
                             🕒 이력 버튼, js/14a-ai-mail-analysis-1.js)과 달리 테두리(border)가 남아있어
                             이질적으로 보였다 — border 제거 + 배경/호버 개념 통일(#e8f4fd → hover #cfe6fa, 테두리 없음). -->
                        <button id="gantt-qa-history-btn" onclick="event.stopPropagation(); window.showQaPromptLogs()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s;">🕒 ${_en ? 'History' : '이력'}</button>
                        <button onclick="document.getElementById('gantt-qa-prompt-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                    </div>
                </div>
                <div id="gantt-qa-prompt-notice" style="margin:10px 18px 0; padding:8px 12px; font-size:11px; color:#495057; background:#eef3f8; border-radius:6px; line-height:1.5;"></div>
                <div id="gantt-qa-prompt-meta" style="padding:4px 18px 0; font-size:10.5px; color:#aaa;"></div>
                <div style="flex:1; padding:10px 18px; overflow:hidden; display:flex; flex-direction:column;">
                    <textarea id="gantt-qa-prompt-textarea" readonly style="flex:1; width:100%; resize:none; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:12px; font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic'; line-height:1.5; background:#f8f9fa; color:#555;"></textarea>
                    <input id="gantt-qa-save-memo" type="text" maxlength="40" placeholder="${_en ? '💬 Memo for this save (optional, e.g. Added inference-allowed phrase v1)' : '💬 이번 저장 메모 (선택, 예: 추론 허용 문구 추가 v1)'}"
                        style="display:none; width:100%; margin-top:8px; padding:7px 10px; border:1px solid #ced4da; border-radius:6px; font-size:12px; box-sizing:border-box; flex-shrink:0;">
                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="gantt-qa-prompt-unlock-btn" onclick="window.unlockGanttQaPrompt()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="비밀번호 필요" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔒 수정하기</button>
                    <button id="gantt-qa-prompt-save-btn" onclick="window.saveGanttQaPromptFromModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">저장</button>
                    <button id="gantt-qa-prompt-reset-btn" onclick="window.resetGanttQaPromptInModal()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; min-width:120px; padding:8px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">🔄 기본값으로 초기화</button>
                    <button id="gantt-qa-batch-improve-btn" onclick="window.triggerGanttQaPromptImprove('batch')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" title="쌓인 👎 피드백 케이스를 모아 한 번에 프롬프트 개선" style="flex:1; min-width:120px; padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🤖 일괄개선</button>
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
        if (metaEl) metaEl.textContent = (meta && meta.updatedBy)
            ? (window._t('마지막 수정: ', 'Last edited: ') + `${meta.updatedBy} · ${meta.updatedAt}`)
            : '';

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
            ? window._t('💡 팀 공용(드라이브) 프롬프트입니다. 수정하려면 관리자 비밀번호가 필요합니다.', '💡 This is the shared team prompt (Drive). Admin password required to edit.')
            : window._t('⚠️ 구글 드라이브 미연동 상태 — 이 PC에만 저장되며 팀과 공유되지 않습니다. 수정하려면 관리자 비밀번호가 필요합니다.', '⚠️ Google Drive is not connected — this is stored only on this PC and not shared with the team. Admin password required to edit.');

        modal.style.display = 'block';
        window.bringModalToFront('gantt-qa-prompt-modal');
    };

    window.unlockGanttQaPrompt = function() {
        const success = verifyAdminPassword(window._t('🔒 프롬프트 수정을 위해 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to edit the prompt.\n(case-insensitive)'));
        if (!success) { alert(window._t('❌ 비밀번호 인증 실패. 프롬프트 수정이 취소되었습니다.', '❌ Authentication failed. Edit cancelled.')); return; }

        document.getElementById('gantt-qa-prompt-textarea').readOnly = false;
        document.getElementById('gantt-qa-prompt-textarea').style.background = '#fffde7';
        document.getElementById('gantt-qa-prompt-textarea').style.color = '#333';
        document.getElementById('gantt-qa-prompt-unlock-btn').style.display = 'none';
        document.getElementById('gantt-qa-prompt-save-btn').style.display = 'block';
        document.getElementById('gantt-qa-prompt-reset-btn').style.display = 'block';
        const memoEl = document.getElementById('gantt-qa-save-memo');
        if (memoEl) memoEl.style.display = 'block';
        const notice = document.getElementById('gantt-qa-prompt-notice');
        notice.textContent = window._t(
            '✏️ 프롬프트를 자유롭게 수정하세요. "${todayStr}"·"${taskListText}"·"${question}" 처럼 "${...}"로 표시된 자리는 실제 답변 생성 시 데이터로 자동 치환되니 그대로 유지하세요(지우거나 철자를 바꾸면 그 자리엔 데이터 대신 글자 그대로 나갑니다).',
            '✏️ Feel free to edit the prompt. Placeholders like "${todayStr}"·"${taskListText}"·"${question}" — anything written as "${...}" — are automatically replaced with real data when generating an answer, so keep them as-is (deleting or misspelling one makes it appear literally instead of the data).'
        );
        notice.style.color = '#0056b3';
        notice.style.background = '#e7f1ff';
    };

    window.saveGanttQaPromptFromModal = async function() {
        const text = document.getElementById('gantt-qa-prompt-textarea').value.trim();
        if (!text) { alert(window._t('프롬프트 내용이 비어있습니다.', 'The prompt content is empty.')); return; }

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
            if (window.showToast) window.showToast(ok
                ? window._t('✏️ 프롬프트를 팀 공용으로 저장했습니다.', '✏️ Prompt saved to the shared team copy.')
                : window._t('⚠️ 로컬엔 저장됐지만 팀 공용(Drive) 저장은 실패했습니다.', '⚠️ Saved locally, but saving to the shared team copy (Drive) failed.'), ok ? 'info' : 'error');
        } else {
            localStorage.setItem('gantt_qa_prompt_pending_push', '1');
            if (window.showToast) window.showToast(window._t('✏️ 이 PC에만 저장했습니다 (Drive 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다).', '✏️ Saved on this PC only (Drive not connected — will sync to the shared team copy on next connection).'), 'info');
        }
    };

    window.resetGanttQaPromptInModal = function() {
        if (!confirm(window._t('편집 중인 내용을 버리고 기본 프롬프트로 되돌릴까요?', 'Discard your edits and reset to the default prompt?'))) return;
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
        // 💡 [2026-09-12 i18n] showPsPromptLogs와 동일한 이유로 _en을 함수 최상단으로 끌어올림 —
        // 표(html)는 열 때마다 새로 그려지므로 if(!logModal) 블록 밖에서도 필요함.
        const _en = window._currentLang === 'en';
        let logs = JSON.parse(localStorage.getItem('gantt_qa_prompt_logs') || '[]');
        let versions = JSON.parse(localStorage.getItem('gantt_qa_prompt_versions') || '[]');
        if (logs.length === 0) { alert(window._t('프롬프트 변경 이력이 없습니다.', 'No prompt change history.')); return; }

        let logModal = document.getElementById('gantt-qa-prompt-log-modal');
        if (!logModal) {
            logModal = document.createElement('div');
            logModal.id = 'gantt-qa-prompt-log-modal';
            logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; pointer-events:none; background:none; align-items:center; justify-content:center;';
            logModal.innerHTML = `
                <div id="gantt-qa-prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                    <div id="gantt-qa-prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                        <span>🕒 <span id="gantt-qa-prompt-log-title">${_en ? 'AI Q&A — Prompt History' : 'AI 문답 — 프롬프트 변경 이력'}</span></span>
                        <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-prompt-log-modal').style.display='none'"
                            style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                                   color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                            onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                            title="${_en ? 'Close' : '닫기'}">✕</button>
                    </div>
                    <div id="gantt-qa-prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                    <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                        <button id="gantt-qa-prompt-log-clear-btn" onclick="window.clearQaPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ ${_en ? 'Delete History' : '이력 삭제'}</button>
                        <button id="gantt-qa-prompt-log-close-btn" onclick="document.getElementById('gantt-qa-prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">${_en ? 'Close' : '닫기'}</button>
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
        html += _en
            ? '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">Time</th><th style="padding:8px;border:1px solid #dee2e6;">Editor</th><th style="padding:8px;border:1px solid #dee2e6;">Before (first 200 chars)</th><th style="padding:8px;border:1px solid #dee2e6;">After (first 200 chars)</th><th style="padding:8px;border:1px solid #dee2e6;">Restore</th></tr>'
            : '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">변경일시</th><th style="padding:8px;border:1px solid #dee2e6;">수정자</th><th style="padding:8px;border:1px solid #dee2e6;">변경 전 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">변경 후 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">복원</th></tr>';
        [...logs].reverse().forEach((log) => {
            const matched = versions.find(v => v.time === log.time);
            const restoreBtn = matched
                ? `<button onclick="window.restoreQaPromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 ${_en ? 'Restore' : '복원'}</button>`
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
        if (!target) { alert(window._t('해당 버전을 찾을 수 없습니다.', 'That version could not be found.')); return; }

        document.getElementById('gantt-qa-prompt-log-modal').style.display = 'none';
        const textarea = document.getElementById('gantt-qa-prompt-textarea');
        if (textarea) textarea.value = target.prompt;
        alert(window._t('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 저장] 버튼을 눌러야 최종 반영됩니다.', '📋 Loaded version v' + version + '.\nReview the content, then click [💾 Save] to actually apply it.'));
    };

    window.clearQaPromptLogs = function() {
        if (!confirm(window._t('프롬프트 변경 이력을 전부 삭제할까요? 되돌릴 수 없습니다.', 'Delete all prompt change history? This cannot be undone.'))) return;
        localStorage.removeItem('gantt_qa_prompt_logs');
        localStorage.removeItem('gantt_qa_prompt_versions');
        document.getElementById('gantt-qa-prompt-log-modal').style.display = 'none';
        alert(window._t('✅ 이력이 삭제되었습니다.', '✅ History deleted.'));
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
