
    // =========================================================
    // 🛠️ 전역 변수 선언 (순서 꼬임 및 TDZ 에러 방지)
    // =========================================================

// 💡 sessionStorage/window.name은 강력 새로고침(Ctrl+F5) 시 브라우저에 따라 리셋될 수 있어,
//    탭을 닫아도·새로고침해도 살아있는 localStorage로 "이미 팝업 전환했음"을 영구 기록합니다.
//    → 이후로는 Ctrl+F5를 아무리 눌러도 새 창이 다시 열리지 않고 지금 창 그대로 새로고침됩니다.
if (!localStorage.getItem('gantt_popup_done')) {
    localStorage.setItem('gantt_popup_done', '1');
    if (window.name !== 'gantt_popup') {
        const newWin = window.open(location.href, 'gantt_popup',
            `width=${screen.width},height=${screen.height},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`);
        if (newWin) {
            newWin.focus();
            window.close();
            // 💡 주소창에 직접 입력해 연 탭은 스크립트로 닫을 수 없어 close()가 무시될 수 있음
            //    → 그런 경우 원래 탭은 안내 문구로 교체해서 중복 창처럼 혼란스럽지 않게 함
            setTimeout(function() {
                document.body.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;' +
                    'font-family:\'Malgun Gothic\',sans-serif;color:#555;font-size:16px;text-align:center;padding:20px;">' +
                    '✅ 새 창으로 이동했습니다.<br>이 탭은 닫아주셔도 됩니다.</div>';
            }, 300);
        }
    }
}

// 🌟 프롬프트를 통합 관리하는 전용 함수
window.getSystemPrompt = function(assignee, customer, model, inch, mailText, mailDate) {
    const savedPrompt = localStorage.getItem('gantt_mail_prompt');
    if (savedPrompt) {
        const todayStr = new Date().toISOString().split('T')[0];
        return savedPrompt
            .replace('${projectAssignee}', assignee || "")
            .replace('${projectCustomer}', customer || "")
            .replace('${projectModel}', model || "")
            .replace('${projectInch}', inch || "")
            .replace('${todayStr}', todayStr)
            .replace('${mailDate}', mailDate || todayStr)
            .replace('${mailText}', mailText || "");
    }
    return window._msBuildDefaultPrompt(assignee, customer, model, inch, mailText, mailDate);
};

// 💡 [2026-08-20][버그 수정] 예전엔 이 코드 기본 프롬프트가 getSystemPrompt() 안에만 있었고,
//    "🔄 초기화" 버튼이 참조하는 window._defaultPromptTemplate도 getSystemPrompt()를 호출해서
//    만들었음 — 근데 그 함수는 localStorage에 저장된 프롬프트가 있으면 그걸 먼저 반환하므로,
//    "초기화"를 눌러도 진짜 코드 기본값이 아니라 이미 저장돼 있던(구버전/팀공용 드라이브에서
//    동기화된) 프롬프트를 다시 저장하는 자기순환 버그가 있었음. → 코드 기본 프롬프트를 이 별도
//    함수로 분리해서, localStorage 상태와 무관하게 항상 "진짜 코드 기본값"을 얻을 수 있게 함.
window._msBuildDefaultPrompt = function(assignee, customer, model, inch, mailText, mailDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    // 💡 [2026-08-20][주요 자재 목록] Summary에 등록된 자재(PN/설명/단가)를 배경정보로 제공 —
    //    메일 본문에 실제 언급된 자재/PN을 정확히 식별하도록 돕는 참고용. 인치와 동일하게, 본문에
    //    없는 자재를 임의로 끌어다 쓰지 않도록 강하게 경고. 현재 열려있는 프로젝트 기준이라
    //    다른 프로젝트로 매칭된 메일에는 반영되지 않을 수 있음(담당자/모델명 등과 동일한 한계).
    //    💡 [분석용/참고용 분리] 자재는 여러 프로젝트가 공용으로 쓰는 경우가 흔함(POWER/METAL/MOLD 등) —
    //    "분석용" 체크된 것만 "이 프로젝트가 맞다"는 확증 신호로 쓰게 하고, 나머지는 상세내용을
    //    정확히 쓰는 데만 참고하되 프로젝트 확증에는 쓰지 말라고 명시적으로 구분해서 지시.
    const materialLines = (function() {
        const mats = (window.tabData && window.tabData.projectMaterials) || [];
        const filled = mats.filter(function(m) { return m && (m.ktkPn || m.description || m.cost); });
        if (!filled.length) return '';
        const fmt = function(m) { return `  · ${m.category}: ${m.ktkPn || '(PN 미기재)'} / ${m.description || ''} / ${m.cost || ''}`; };
        const trusted = filled.filter(function(m) { return m.useForAnalysis; });
        const refOnly = filled.filter(function(m) { return !m.useForAnalysis; });
        let out = '';
        if (trusted.length) {
            out += '\n- 주요 자재(신뢰 가능 — 이 PN/자재가 메일 본문에 언급되면 이 프로젝트 얘기라는 강한 신호로 사용 가능):\n' + trusted.map(fmt).join('\n');
        }
        if (refOnly.length) {
            out += '\n- 주요 자재(참고용 — 여러 프로젝트가 공용으로 쓸 수 있는 부품이므로, 언급돼도 "이 프로젝트"라는 확증으로 쓰지 마세요. 상세내용을 정확히 서술하는 데만 참고):\n' + refOnly.map(fmt).join('\n');
        }
        return out;
    })();
    return `당신은 전자제품 개발 프로젝트 관리자입니다. 아래 이메일을 분석하여 간트차트 업무 항목을 JSON으로 추출해주세요.

프로젝트 정보 (⚠️ 이 메일이 어느 프로젝트로 분류됐는지 참고용 배경정보일 뿐, 이 메일의 실제 내용이라고 확신할 수 없습니다.
자동 매칭이 틀렸을 수도 있으니, 아래 항목이 메일 본문에 없으면 상세내용에 그대로 베껴 쓰지 마세요 — 특히 "인치"는
절대 이 값을 사실인 것처럼 인용하지 말고, 메일 본문에 실제로 적힌 인치/사이즈 숫자만 쓰세요):
- 프로젝트 담당자: ${assignee || ""}
- 고객사: ${customer || ""}
- 모델명: ${model || ""}
- 인치(참고용, 본문에 없으면 절대 언급 금지): ${inch || ""}${materialLines}
- 오늘 날짜(기준일): ${todayStr}
- 메일 발송일: ${mailDate || todayStr}

추출 규칙:
- 업무명: 핵심내용에서 추출하여 20자 이내 명사형으로 요약
- 시작일: 메일 하단에 섞여 있는 과거 포워딩(Fwd/RE) 날짜에 현혹되지 마세요. **현재 새로 요청하는 업무의 실제 시작일**을 유추하되, 본문에 명시되지 않았다면 위에 명시된 '메일 발송일'을 반드시 시작일로 사용하세요. 간트차트에 이미 등록된 다른 업무의 날짜를 절대 참조하지 마세요. 반드시 "YYYY-MM-DD" 형식으로 출력하며 알 수 없으면 "날짜확인필요"- 완료일: 마감일이 명시된 경우만 추출 (규칙은 시작일과 동일), 없으면 "날짜확인필요"
- 상태: 진행/대기/완료/보류 중 하나
- 개발단계: RFI/RFQ/NRE/AWARD/KICK-OFF/DESIGN/SAMPLE/EVT/ES/DVT/PVT/FAI/PP/SOP/MP/EC/RMA/EOL 중 해당하는 단계 (불명확하면 빈값)
- 담당구분: 이 업무를 실제로 처리해야 할 담당 영역을 아래 목록 중에서 판단 (기술 키워드·요청 내용 기준).
  ⚠️ 원칙은 "하나만" 고르는 것입니다. 메일 하나에 여러 담당 영역 얘기가 섞여 있어도, 이 업무 자체를 처리할
  핵심 담당 영역은 대부분 하나로 좁혀집니다 — 정말로 이 업무에서 **두 영역 모두가 각자 실질적인 조치를
  취해야 하는 경우**(예: "회로 변경"과 "펌웨어 로직 변경"이 이 업무 안에 함께 명시적으로 요청된 경우)에만
  콤마와 공백으로 구분해 최대 2개까지 기재하세요(예: "HW, FW"). 한쪽이 단순 참고·공유 대상이거나 조금이라도
  애매하면 절대 욕심내지 말고 더 핵심적인 하나만 기재하세요. 3개 이상은 절대 기재하지 마세요. 애매하면 "미분류":
  PM(일정·전반 총괄, 견적, 계약, 프로젝트 전반 이슈) / 기구(하우징·구조·기구설계·금형·조립) / HW(회로·보드·부품 하드웨어) / FW(펌웨어·소프트웨어·제어로직) / BLU(백라이트유닛·디스플레이 모듈) / TSP(터치스크린패널·터치) / LCM(LCM 패널 자체 사양·회전·구조) / Slimming(두께·슬리밍) / Cutting(절단·가공) / Tooling(금형·툴링) / 영업(가격·발주·영업) / CS(고객 클레임·AS) / FA(현장기술지원·설치) / 미분류(위 어디에도 명확히 속하지 않음)
- 상세내용: 아래 형식으로 600자 이내 작성 (기존 대비 약 2배 더 상세하게, 배경·수량·모델명·수치 등 구체적 사실을 최대한 포함), 반드시 줄바꿈(\n)으로 구분
  * ⚠️ 환각 방지(특히 인치/사이즈 숫자): 인치·크기·수치는 반드시 **메일 본문에 그 숫자가 실제로 적혀 있을 때만** 쓰세요.
    위 "프로젝트 정보"의 인치 값은 자동 매칭이 추정한 참고용일 뿐 이 메일 자체의 사실이 아닙니다 — 본문에 인치가
    안 적혀 있으면 상세내용에 인치를 아예 쓰지 마세요(추측·차용 금지). 다른 수치(nits, 색좌표, 수량 등)도 마찬가지로
    본문에 명시된 것만 쓰고, 프로젝트 정보나 이전 지식으로 채워 넣지 마세요.
  * [발신자→수신자] 판별 가이드 (★문맥 분석 필수★):
    - 인사말(Hi, Regards)이나 서명이 없을 수 있으므로, 문장의 주어·목적어 등 문맥을 분석해 발신자/수신자를 정확히 식별하세요.
    - 발신자: 자료를 첨부/발송(attached, sending)하거나 피드백·승인을 요청(wondering, requesting)하는 주체 (예: "I'd like to send~"에서 'I')
    - 수신자: 자료를 받아 검토해야 하거나 피드백을 제공(provide feedback)해야 하는 대상 (예: "Please provide~", "your CAD update"에서 'You')
    - 본문에 언급된 이름(영문/국문)을 있는 그대로 추출하되, 발신자/수신자 정보가 본문에 드러나지 않는다면 프로젝트 담당자명 등으로 임의 추정해 치환하지 마세요. 본문에 쓰인 영문 표기(예: Anthony→Andy 같은 애칭)를 최우선으로 사용하세요.
  * 출력 형식: [업무유형][발신자→수신자] YYYY-MM-DD\n[핵심내용]내용(기존보다 2배 더 구체적으로 배경·수치·조건까지 서술)\n[To do]후속조치(누가, 무엇을, 언제까지 해야 하는지 구체적으로 서술)\n[출처]메일 본문 안에서 확인 가능한 제목(Subject)이나 첫 줄 요약 문구, 날짜, 발신자명을 "제목_날짜_발신자" 형태로 간단히 기재 (본문에 제목이 명시되어 있지 않으면 첫 문장을 20자 이내로 축약해서 대신 사용)
  * 업무유형은 아래 중 가장 적합한 하나 선택:
    [요청/문의] 검토요청 / 자료요청 / 견적요청 / 일정·납기문의 / 승인요청 / 샘플요청 / 분석·테스트요청 / 변경·확인·협조요청
    [회신/답변] 검토답변 / 자료제공 / 견적회신 / 납기회신 / 승인완료 / 샘플발송 / 분석·테스트회신 / 변경수락·거절
    [공유/안내] 진행·결과보고 / 변경안내 / 이슈·지연안내 / 회의안내·공유 / 인증·단종·가격안내
    [조치/처리] 문제해결·조치 / 개선·대안제시 / 결정사항 / 보류·취소
    [계약/구매] 발주 / 계약검토·완료 / 인보이스·결제
    위 목록에 없으면: 기타
  * 예시(형식만 참고, 아래 예시 속 인명·모델명·수치는 실제 데이터가 아니므로 절대 그대로 가져다 쓰지 마세요): "[샘플발송] [Taylor Kim → Morgan Lee] 2025-05-01\n[핵심내용]TestUnit-A Proto 샘플(LV 9ea, UK 28ea) 발송 예정. AD보드 FW 4종 첨부\n[To do]Fast Touch Response 튜닝 확인 및 회신 요청"
    - wbs레벨: 3 (일반 업무)

- 상세내용 추가 규칙: 메일 본문에 실제 문제 상황(이슈/장애/지연/불량/부족 등)이 있는 경우 또는 그에 대한 해결책/조치 방향이 "둘 다 명확히" 언급된 경우, 상세내용 맨 끝에 아래 두 줄을 이어서 추가하세요(무리하게 추정하지 말 것. 둘 중 하나라도 불명확하면 추가하지 마세요):
  \n[문제점]문제 상황 1줄 요약\n[대책]해결책/조치 방향 1줄 요약
  예시: "...[To do]후속조치\n[문제점]Die-Casting 자재 부족으로 출하 일정 지연\n[대책]자재 추가 입고 일정 파악 후 재작업 진행"

- 우선순위 판단 (마감일임박도, 업무영향도): 아래 두 항목을 메일 전체 맥락을 종합적으로 고려하여 판단하되, 반드시 아래 기준점(앵커)에 맞춰 채점하세요. 같은 성격의 메일에는 항상 같은 점수대를 매겨야 합니다 — 즉흥적으로 판단하지 마세요.
  * 마감일임박도 (0~30점, 기준일=${todayStr} 대비 마감/회신 요청 시점 기준):
    - 0점: 마감·회신 기한 언급이 전혀 없음
    - 10점: 기한이 막연함("가까운 시일 내", "편하실 때") 또는 1~2주 이상 여유
    - 20점: 기한이 명시적이며 2~5일 이내(예: "이번 주까지", "금요일까지")
    - 30점: 오늘 또는 내일까지, 또는 "긴급/ASAP/즉시" 등 명시적 초긴급 표현, 또는 이미 기한을 넘긴 상태
  * 업무영향도 (0~30점, 방치 시 파급력 기준):
    - 0점: 단순 정보공유·참고용, 회신/조치 없이 넘어가도 무방
    - 10점: 내부 업무 지연 정도(특정 담당자 일정에만 영향)
    - 20점: 고객사에 직접 영향(납기 지연, 검토·승인 지연으로 고객 일정 밀림) 또는 금전적 영향이 있으나 소규모
    - 30점: 양산/출하 중단, 품질 클레임, 계약·발주 관련 금액 규모가 큰 사안, 고객 신뢰에 직접 타격
    - 위 기준 중 애매하면 더 낮은 점수를 선택하세요(과대평가보다 과소평가가 안전).

반드시 아래 JSON 형식으로만 응답. 다른 텍스트 없이 JSON만:
{
  "업무명": "",
  "시작일": "",
  "완료일": "",
  "상태": "",
  "개발단계": "",
  "담당구분": "미분류",
  "상세내용": "",
  "wbs레벨": 4,
  "마감일임박도": 0,
  "업무영향도": 0
}

이메일:
${mailText}`;
};

    window._mailParsedRaw = null;    // 💡 현재 분석 중인 메일의 파싱 원문 보관 (2000자 + 메타)
    window._aiResultSnapshot = null; // 💡 AI가 뽑은 원본 결과 스냅샷 (수정 전 비교용)
    var globalData = []; 
    var filterColumns = []; 
    var currentFilters = {}; 
    var existingDevStages = [];
    var colIdx = { no: -1, bogo: -1, start: -1, plan: -1, period: -1, dur1: -1, dur2: -1, dur3: -1, dur4: -1, assignee: -1, taskType1: -1, taskType2: -1, taskType3: -1, taskType4: -1, status: -1, customer: -1, model: -1, inch: -1, devStage: -1, content: -1, answer: -1, chart: -1 };

    window.currentDriveFileId = null;
    window.currentUserName = "비로그인 (로컬)"; // 표시용: 언어별로 auth_button에서 처리
    window.lastSavedLogCount = 0;
    window.exportFilenameStr = "GanttChart_All";
    window.ganttViewStartTs = null;
    window.ganttViewDuration = null;
    window.changeLogs = [];

    // 💡 [2026-08-21][버그 수정] "저장 필요 여부" 판단이 지금까지 changeLogs(Gantt 표 행 편집)만 봐서,
    //    프로젝트 파일에 같이 저장되는 다른 탭(Summary/Brief SPEC/M.C Table) 편집은 시트 전환/3분
    //    자동저장/창닫기 경고 셋 다 못 잡아냈음(예: 주요자재만 채우고 바로 다른 시트로 넘어가면 저장
    //    없이 그냥 넘어가버림). 아래 3개 탭 안의 입력 변화를 이 플래그로 따로 추적해서, 위 세 안전장치가
    //    changeLogs와 함께 같이 참고하게 함.
    //    💡 [범위 근거] collectTabData()가 실제로 window.tabData(프로젝트 파일에 저장됨)에 담는 건
    //    Summary(+주요자재/멤버)/Brief SPEC/M.C Table 3개뿐 — 주소록(#tab-address)은 프로젝트 파일이
    //    아니라 별도 공용 저장소를 쓰고, 알람(#tab-alarm)은 프로젝트와 무관한 localStorage 전용
    //    개인설정이라 둘 다 이 감시 대상에서 제외. 캘린더/주간보고서 탭은 Gantt 데이터를 그대로
    //    보여주기만 하는 뷰라 별도 입력 필드가 없음.
    window._nonGanttDirty = false;
    window._markNonGanttDirty = function() { window._nonGanttDirty = true; };
    // 💡 [2026-08-25] Panel Compare(Note 열 입력 등)도 여기 추가 — 안 넣으면 그 안에서 뭘 고쳐도
    //    "저장 안 한 변경사항 있음" 판정에 안 잡혀서, 탭 이동/닫기 시 저장 여부를 안 물어보고 조용히 날아감.
    const _NON_GANTT_DIRTY_SELECTORS = '#tab-summary, #tab-briefspec, #tab-mctable, #tab-elecparts';
    document.addEventListener('input', function(e) {
        if (e.target && e.target.closest && e.target.closest(_NON_GANTT_DIRTY_SELECTORS)) window._markNonGanttDirty();
    });
    document.addEventListener('change', function(e) {
        if (e.target && e.target.closest && e.target.closest(_NON_GANTT_DIRTY_SELECTORS)) window._markNonGanttDirty();
    });

    const CLIENT_ID = '107026313229-jh5qm0pbkhe505gt3pvgbpbjurg1v0ej.apps.googleusercontent.com';
    const API_KEY = 'AIzaSyCYavFb6m88K8T7rhKQwnfv5ygpwG9ah48';
    const SHARED_FOLDER_ID = '1ldb3Bc7dNNSKKgmNviw43aCgrvxQG9bS';
    const SCOPES = 'https://www.googleapis.com/auth/drive'; 

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;
// =========================================================
    // 🛠️ 구글 드라이브 연동 로직 (인증 토큰 배달 사고 및 먹통 해결 버전)
    // =========================================================
    window.gapiLoaded = function() { gapi.load('client', window.intializeGapiClient); }
    if (window._gapiReady) window.gapiLoaded(); // 스크립트가 이 정의보다 먼저 로드 완료된 경우 즉시 실행

    window.intializeGapiClient = async function() {
        await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
        gapiInited = true;
    }
    
    window.gisLoaded = function() {
        tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '' });
        gisInited = true;
    }
    // 🐛 [2026-08-31 버그 수정] 바로 위 gapiLoaded와 달리 이 gisLoaded 정의에는 "스크립트가 이 정의보다
    //    먼저 로드 완료된 경우 즉시 실행" catch-up 체크가 빠져 있었다 — 구글 gsi/client 스크립트가
    //    이 줄에 도달하기 전에 이미 로드를 마치면(문서 최상단의 스텁 gisLoaded가 대신 호출되어
    //    window._gisReady만 true로 기록되고 tokenClient는 여태 안 만들어진 상태), 이 실제 정의로
    //    덮어써도 아무도 다시 호출해주지 않아 tokenClient가 계속 비어있었다 — "구글 로그인 버튼을
    //    눌러도 반응이 없다(⏳ 준비 중 알림만 뜸)"는 간헐적 증상의 실제 원인. (아래쪽 12500행대 부근의
    //    두 번째 gisLoaded 재정의에는 이 체크가 있어서 그쪽이 대신 만회해줄 때만 우연히 정상 동작했음 —
    //    타이밍에 따라 그마저도 못 만회하면 로그인이 완전히 막혔다.)
    if (window._gisReady) window.gisLoaded(); // 스크립트가 이 정의보다 먼저 로드 완료된 경우 즉시 실행

    // 💡 [2026-08-25 신규] 상단 어디서든 눈에 띄는 연결 상태 표시등. Drive 연동 성공/끊김이 있을 때마다
    //    호출해서 갱신한다 — 저장 실패로 401을 맞기 전까지는 끊긴 줄 몰랐던("헛수고") 문제를 줄이기 위함.
    window._updateDriveConnBadge = function() {
        const el = document.getElementById('drive-conn-badge');
        if (!el) return;
        const _en = window._currentLang === 'en';
        if (window.isDriveConnected) {
            el.textContent = '🟢';
            el.title = _en ? 'Google Drive connected' : '구글 드라이브 연결됨';
            el.style.cursor = 'default';
            el.onclick = null;
        } else {
            el.textContent = '🔴';
            el.title = _en ? 'Google Drive disconnected — click to reconnect' : '구글 드라이브 연결 끊김 — 클릭해서 재연동';
            el.style.cursor = 'pointer';
            el.onclick = function() { window.handleAuthClick(); };
        }
        // 💡 아직 한 번도 연동을 시도한 적 없는 최초 상태(currentUserName 없음)에서는 굳이 "끊김"으로
        //    붉게 표시하지 않는다 — 로그인 전인 것과 "로그인했다가 끊긴 것"은 사용자에게 다른 의미이므로.
        el.style.display = (window.isDriveConnected || window._driveWasEverConnected) ? 'inline-flex' : 'none';
    };

    // 💡 [2026-08-25 신규] 저장 401/무토큰, 조용한 토큰 갱신 실패 등 "연결이 끊겼다"고 판단되는 모든
    //    지점에서 공통으로 호출하는 단일 진입점. 상태 갱신 + 토스트 + (설정돼 있으면) 본인 텔레그램 알림까지
    //    한 번에 처리해서, 사람이 저장을 시도해보고 나서야("헛수고") 끊김을 알게 되는 일을 줄인다.
    window._driveDisconnectNotified = false;
    // 💡 [2026-08-25 신규] 연결이 끊긴 동안 작업이 메모리(globalData 등)에만 있으면, 그 상태에서 브라우저
    //    탭이 강제로 닫히거나 죽으면(beforeunload 경고를 무시하고 닫는 경우 포함) 그대로 유실된다.
    //    끊김이 감지될 때마다 지금 화면 내용을 localStorage에 스냅샷으로 남겨, 다음에 이 프로젝트를 다시
    //    열 때 "저장 안 된 로컬 백업이 있다"고 알아채고 복원을 제안할 수 있게 한다.
    window._LOCAL_BACKUP_PREFIX = 'gantt_local_backup_';
    window._saveLocalBackup = function(reason) {
        try {
            if (!window._hasUnsavedChangesNow || !window._hasUnsavedChangesNow()) return; // 바뀐 게 없으면 백업할 필요 없음
            if (typeof globalData === 'undefined' || !globalData) return;
            const key = window._LOCAL_BACKUP_PREFIX + (window.currentDriveFileId || 'new');
            const serializedGlobalData = globalData.map(function(row) {
                const obj = { data: Array.from(row) };
                for (const k in row) { if (k.startsWith('_')) obj[k] = row[k]; }
                return obj;
            });
            const payload = {
                savedAt: new Date().toISOString(),
                reason: reason || '',
                fileId: window.currentDriveFileId || null,
                fileName: window.currentDriveFileName || '',
                changeLogsCount: window.changeLogs ? window.changeLogs.length : 0,
                data: {
                    globalData: serializedGlobalData,
                    changeLogs: window.changeLogs,
                    colIdx: (typeof colIdx !== 'undefined') ? colIdx : null,
                    filterColumns: (typeof filterColumns !== 'undefined') ? filterColumns : null,
                    projectMeta: window.projectMeta || {},
                    tabData: window.collectTabData ? window.collectTabData() : (window.tabData || {}),
                    distributions: window.projectDistributions || [],
                    scheduleBaselines: window._scheduleBaselinesForSave ? window._scheduleBaselinesForSave() : (window._scheduleBaselines || [])
                }
            };
            localStorage.setItem(key, JSON.stringify(payload));
            console.info('[로컬 백업] 저장됨 (' + (reason || '') + '):', key);
        } catch (e) {
            console.warn('[로컬 백업] 저장 실패(용량 초과 등 — 무시하고 진행):', e.message);
        }
    };
    window._clearLocalBackup = function(fileId) {
        try { localStorage.removeItem(window._LOCAL_BACKUP_PREFIX + (fileId || 'new')); } catch (e) {}
    };
    // 프로젝트를 열었을 때, 그 파일에 대한 로컬 백업이 방금 받아온 원격 내용보다 "앞서 있으면"(더 많은
    // changeLogs) 복원을 제안 — 연결이 끊긴 동안 저장 못 하고 남겨졌던 변경사항일 가능성이 높음.
    window._checkLocalBackupOnOpen = function(fileId, remoteChangeLogsCount) {
        try {
            const key = window._LOCAL_BACKUP_PREFIX + fileId;
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const backup = JSON.parse(raw);
            if (!backup || !backup.data || (backup.changeLogsCount || 0) <= (remoteChangeLogsCount || 0)) {
                localStorage.removeItem(key); // 이미 반영됐거나 원격보다 오래된 백업 — 정리
                return;
            }
            const _en = window._currentLang === 'en';
            const when = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : '';
            const restore = confirm(_en
                ? `A local backup of unsaved changes for "${backup.fileName || fileId}" was found (saved on this browser at ${when} — likely because Google Drive was disconnected at that time).\n\nRestore it now? (Review it, then save normally.)`
                : `"${backup.fileName || fileId}" 프로젝트의 저장되지 않은 로컬 백업이 이 브라우저에 남아있습니다 (저장 시각: ${when} — 당시 구글 드라이브 연결이 끊겼을 가능성이 있습니다).\n\n지금 복원할까요? (복원 후 내용을 확인하고 직접 저장해주세요)`);
            if (restore) {
                window._applyLocalBackupData(backup.data);
                if (window.showToast) window.showToast(_en ? '📥 Local backup restored — please review and save.' : '📥 로컬 백업을 복원했습니다 — 확인 후 저장해주세요.', 'info', 8000);
            } else {
                localStorage.removeItem(key); // 복원 안 하기로 했으면 더는 물어보지 않게 정리
            }
        } catch (e) { console.warn('[로컬 백업] 복원 확인 실패:', e.message); }
    };
    window._applyLocalBackupData = function(data) {
        globalData = (data.globalData || []).map(function(obj) {
            const row = obj.data;
            for (const k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        window.changeLogs = data.changeLogs || window.changeLogs;
        window._nonGanttDirty = true; // 복원 직후는 아직 저장 전 상태이므로 "안 저장한 변경사항"으로 취급
        if (data.colIdx) colIdx = data.colIdx;
        if (data.filterColumns) filterColumns = data.filterColumns;
        window.projectMeta = data.projectMeta || window.projectMeta;
        window.tabData = data.tabData || window.tabData;
        window.projectDistributions = data.distributions || window.projectDistributions;
        if (data.scheduleBaselines && data.scheduleBaselines.length) window._scheduleBaselines = data.scheduleBaselines;
        if (window.mcNormalizeAfterLoad) window.mcNormalizeAfterLoad();
        if (window.populateTabData) window.populateTabData();
        window.recalculateSchedules();
    };

    window._handleDriveDisconnected = function(reason) {
        const wasConnected = window.isDriveConnected;
        window.isDriveConnected = false;
        window._updateDriveConnBadge();
        // 💡 [2026-08-28 버그 수정] "연결이 끊겼는데도 상단이 계속 초록색으로 표시된다"는 지적 — 위
        //    drive-conn-badge(🔴/🟢 점)는 여기서 같이 갱신되지만, 바로 옆 auth_button("🟢 사용자이름"
        //    드롭다운 행)은 로그인 성공 시에만 "🟢 이름"으로 바뀌고 끊겼을 때 되돌리는 코드가 여태
        //    없었다 — 그래서 배지는 빨간불이어도 이 버튼만 계속 초록색 이름으로 남아 혼란을 줬다.
        //    더 나아가 다른 코드(6650줄)가 "로그인 여부"를 이 버튼 텍스트에 '🟢'이 있는지로 판정하고
        //    있어서, 안 되돌리면 그 판정까지 같이 낡은 상태를 참으로 잘못 본다 — 여기서 같이 되돌린다.
        const authBtn = document.getElementById('auth_button');
        if (authBtn) {
            const _enBtn = window._currentLang === 'en';
            authBtn.innerText = _enBtn ? '🔴 Reconnect needed (click)' : '🔴 재연동 필요 (클릭)';
            authBtn.style.borderColor = '#e03131';
            authBtn.style.color = '#e03131';
            authBtn.disabled = false;
        }
        window._saveLocalBackup('drive-disconnected:' + (reason || ''));
        if (!wasConnected && window._driveDisconnectNotified) return; // 이미 끊긴 상태에서 또 감지된 건 중복 알림 생략
        window._driveDisconnectNotified = true;
        const _en = window._currentLang === 'en';
        if (window.showToast) {
            window.showToast(_en
                ? '🔴 Google Drive connection lost. Please reconnect from the top menu.'
                : '🔴 구글 드라이브 연결이 끊어졌습니다. 상단 메뉴에서 재연동해 주세요.', 'error', 8000);
        }
        console.warn('[구글 인증] 연결 끊김 감지:', reason);
        // 💡 본인 텔레그램 알림 — 주소록에 내 이름으로 등록된 텔레그램 ID가 있고, 로컬 백엔드(kortek_backend)가
        //    켜져 있을 때만 실제 전송됨. 둘 중 하나라도 없으면 sendTelegramAlarm이 조용히 실패하므로 그냥 무시.
        try {
            const me = window._addrFindByName ? window._addrFindByName(window.currentUserName || '') : null;
            if (me && me.telegramId && window.sendTelegramAlarm) {
                window.sendTelegramAlarm(
                    `🔴 [Gantt Chart] 구글 드라이브 연결이 끊어졌습니다.\n다시 로그인해 주세요. (사유: ${reason || '알 수 없음'})`,
                    { chatId: me.telegramId }
                );
            }
        } catch (e) { /* 텔레그램 알림 실패는 무시 — 화면 표시/토스트가 주 경로 */ }
    };

    window._silentRefreshTimer = null;
    // 💡 [2026-08-28 개선] "연결이 끊겼는데도 45분 동안 상단이 계속 초록색"이라는 지적에 대한 후속 조치 —
    //    저장을 시도해야만 즉시 감지되던 것과 별개로, 아무 조작 없이 조용히 끊긴 경우를 얼마나 빨리
    //    잡아낼지는 순전히 이 주기에 달려있었다. 45분 → 12분으로 줄여 최대 지연을 크게 단축하되,
    //    한 번 실패했다고 바로 "끊김"으로 단정하지 않고 연속 2회(24분 이내) 실패해야만 끊김 처리한다
    //    (아래 _silentRefreshFailCount) — 순간적인 네트워크 hiccup이나 서드파티 쿠키 차단 등으로 어쩌다
    //    한 번 조용한 갱신이 스치듯 실패하는 오탐까지 "연결 끊김" 토스트·텔레그램 알림으로 이어지는 걸
    //    막기 위함(주기를 짧게 줄일수록 이런 우연한 1회성 실패를 만날 기회도 그만큼 늘어나므로 필수적인 안전장치).
    window._silentRefreshFailCount = 0;
    window.startSilentTokenRefresh = function() {
        if (window._silentRefreshTimer) return;
        window._silentRefreshTimer = setInterval(() => {
            if (!tokenClient || !window.isDriveConnected) return;
            // 💡 [2026-08-25] 예전엔 여기서도 handleAuthClick이 마지막으로 심어둔 callback을 그대로 재사용해서,
            //    조용한 갱신 성공 시에도 "로그인 성공" 전체 처리(프로젝트 목록 재조회 등 무거운 부수효과)가
            //    배경에서 통째로 다시 실행되고 있었다. 조용한 갱신 전용 콜백으로 토큰만 갈아끼우고,
            //    실패하면(=브라우저 세션 만료 등으로 prompt:''가 실패) 연결 끊김으로 간주해 사람이 알 수 있게 표시한다.
            tokenClient.callback = (resp) => {
                if (resp.error !== undefined) {
                    window._silentRefreshFailCount++;
                    console.warn(`[구글 인증] 조용한 토큰 갱신 실패 (${window._silentRefreshFailCount}회 연속):`, resp.error);
                    if (window._silentRefreshFailCount >= 2) {
                        window._handleDriveDisconnected('silent-refresh-failed:' + resp.error);
                    }
                    return;
                }
                window._silentRefreshFailCount = 0; // 성공하면 연속 실패 카운트 리셋
                gapi.client.setToken(resp);
                window.googleAccessToken = resp.access_token;
                console.info('[구글 인증] 조용한 토큰 갱신 성공');
            };
            // 💡 [2026-08-31] 브라우저에 구글 계정이 여러 개 로그인돼 있으면 hint 없는 조용한 요청은
            //    "계정 선택" 창을 띄운 채 사용자 입력을 기다리며 안 닫힌다 — 이게 상단 배지는 초록색
            //    (아직 연결 끊김 판정 전)인데 팝업만 계속 떠 있던 증상의 실제 원인. 로그인 성공 시
            //    기억해둔 이메일을 hint로 넘겨 계정을 미리 지정해서 이 창 자체가 뜨지 않게 한다.
            const _emailHint = window.currentUserEmail || (function() { try { return localStorage.getItem('gantt_google_email_hint') || ''; } catch(e) { return ''; } })();
            tokenClient.requestAccessToken(_emailHint ? { prompt: '', hint: _emailHint } : { prompt: '' });
        }, 12 * 60 * 1000);
    }

    window.handleAuthClick = function() {
        if (!tokenClient) {
            alert("⏳ 구글 인증 모듈을 준비 중입니다. 1~2초 뒤에 다시 클릭해 주세요.\n(지속적으로 안 될 경우 Ctrl+F5를 눌러주세요)");
            return;
        }

        const authBtn = document.getElementById('auth_button');
        if (authBtn) {
            authBtn.innerText = window._currentLang === 'en' ? "🔄 Connecting..." : "🔄 연동 진행 중...";
            authBtn.disabled = true;
        }

        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) { 
                console.error("구글 인증 실패:", resp.error);
                if (authBtn) {
                    authBtn.innerText = window._currentLang === 'en' ? "🔵 Connect Google Drive" : "🔵 구글 드라이브 연동하기";
                    authBtn.disabled = false;
                }
                return; 
            }
            
            // 💡 [🔑 핵심 해결] 획득한 토큰을 GAPI 엔진과 브라우저 전역 공간에 확실하게 주입합니다!
            gapi.client.setToken(resp);
            window.googleAccessToken = resp.access_token;
            window.isDriveConnected = true;
            window._driveWasEverConnected = true;
            window._driveDisconnectNotified = false; // 💡 재연동 성공 — 다음에 또 끊기면 다시 알림 가능하도록 리셋
            window._silentRefreshFailCount = 0; // 💡 재연동 성공 — 연속 실패 카운트도 같이 리셋
            window._updateDriveConnBadge();
            window.startSilentTokenRefresh();

            // 💡 드라이브 연동 성공 시 팀 공용 AI 프롬프트 자동 동기화
            if (typeof window.loadPromptFromDrive === 'function') window.loadPromptFromDrive();
            if (typeof window.loadProjectSummaryPromptFromDrive === 'function') window.loadProjectSummaryPromptFromDrive();
            if (typeof window.loadGanttQaPromptFromDrive === 'function') window.loadGanttQaPromptFromDrive();
            if (typeof window.loadHolidaysFromDrive === 'function') window.loadHolidaysFromDrive();
            // 💡 비밀번호 변경 감지 + Telegram 설정 자동 동기화
            setTimeout(() => { if (typeof window.checkPasswordSync === 'function') window.checkPasswordSync(); }, 1500);

            try {
                let aboutResp = await gapi.client.drive.about.get({fields: 'user'});
                window.currentUserName = aboutResp.result.user.displayName || "알 수 없는 사용자";
                window.showToast(window._currentLang === 'en' ? `🎉 Google Drive connected! Welcome, ${window.currentUserName}!` : `🎉 구글 드라이브 연동 완료! 반갑습니다, ${window.currentUserName}님!`);
                if (authBtn) authBtn.innerText = `🟢 ${window.currentUserName}`;
                if (window.TaskInbox && window.TaskInbox.loadFromDrive) window.TaskInbox.loadFromDrive(); // 💡 개인 보관함 드라이브 복원
                if (window.AddressBook && window.AddressBook.loadFromDrive) {
                    window.tabData = window.tabData || {};
                    window.tabData.addressBook = window.AddressBook.load(); // 로컬 캐시 즉시 반영
                    window.AddressBook.loadFromDrive().then(function(list) {
                        if (list) { window.tabData.addressBook = list; if (window.renderAddressTable) window.renderAddressTable(); }
                    }); // 💡 공용 주소록 드라이브 최신본 복원
                }
            } catch(e) {
                console.error("사용자 정보 추출 실패, 공용 모드로 진입:", e);
                window.currentUserName = "익명 사용자";
                window.showToast(window._currentLang === 'en' ? '✅ Google Drive connected! Synced with shared team folder.' : '✅ 구글 드라이브 연동 완료! 팀 공용 폴더와 동기화됩니다.');
                if (authBtn) authBtn.innerText = "🟢 공용 드라이브 연동됨";
            }
            
            if (authBtn) authBtn.disabled = true;
            document.getElementById('drive_save_btn').disabled = false;
            document.getElementById('drive_load_btn').disabled = false;
            const bkBtn1 = document.getElementById('backup_restore_btn'); if (bkBtn1) bkBtn1.disabled = false;
            
            // 연동 성공 직후 프로젝트 리스트 팝업 자동 동기화
            setTimeout(() => {
                if (typeof window.loadFromGoogleDrive === 'function') {
                    window.loadFromGoogleDrive();
                }
            }, 600);
        };
        tokenClient.requestAccessToken({prompt: 'consent'}); 
    }

    window.findSaveFile = async function(dynamicFileName) {
        try {
            let response = await gapi.client.drive.files.list({
                q: `name='${dynamicFileName}' and trashed=false and '${SHARED_FOLDER_ID}' in parents`,
                fields: 'files(id, name)', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
            });
            return response.result.files && response.result.files.length > 0 ? response.result.files[0].id : null;
        } catch (err) { console.error("클라우드 파일 검색 실패:", err); return null; }
    }

    // 💡 "프로젝트 선택": 현재 프로젝트를 먼저 저장한 뒤에만 다른 프로젝트 목록을 연다 (미저장 유실 방지)
    window.selectProject = async function() {
        if (!window.isDriveConnected) {
            alert(window._t("🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.", "🔒 Please connect Google Drive first."));
            return;
        }
        window.closeAllTopbarMenus();
        const _en = window._currentLang === 'en';
        // 💡 [2026-08-25] 예전엔 저장할 데이터가 조금이라도 있으면(_hasUnsavedProjectData) 무조건
        //    조용히 자동저장부터 했다 — 이미 저장된 상태라도 매번 실제로 Drive에 다시 쓰는 낭비였고,
        //    사용자가 "저장할지 말지"를 고를 기회도 없었다. 이제는 실제로 "안 저장한 변경사항"이
        //    있을 때만(_hasUnsavedChangesNow) 3지선다 모달로 물어보고, 변경사항이 없으면 그냥 바로 이동한다.
        if (window._hasUnsavedChangesNow && window._hasUnsavedChangesNow()) {
            const choice = await window._showSaveChoiceModal(window.currentDriveFileName, 'open');
            if (choice === 'cancel') return;
            if (choice === 'save') {
                window.showToast(_en ? "💾 Saving current project before opening the list..." : "💾 프로젝트 이동 전, 현재 작업을 저장하는 중...", 'info');
                // 💡 [진단용 계측] "프로젝트 열기가 느리다"는 신고가 반복돼서, 다음에 또 느려질 때 정확히
                //    어느 단계(전환 전 저장 vs 목록 조회 vs 파일 열기)가 느린지 바로 알 수 있게 시간을 잰다.
                const _t0 = performance.now();
                // 💡 [UX 수정] 저장이 막혀도 여기서 alert을 띄우지 않게 하고(suppressAlert), 사유만 받아온다.
                //    예전엔 ①저장 실패 안내 alert + ②"그래도 목록을 여시겠습니까?" confirm — 모달이 두 번
                //    연달아 떴고, 두 번째에서 취소하면 프로젝트 목록 자체를 못 열었다.
                const saved = await window.saveToGoogleDrive({ suppressAlert: true });
                const _saveMs = Math.round(performance.now() - _t0);
                console.info(`[프로젝트 열기 계측] 전환 전 저장(saveToGoogleDrive): ${_saveMs}ms`);
                if (_saveMs > 3000) console.warn(`[프로젝트 열기 계측] ⚠️ 전환 전 저장이 ${_saveMs}ms나 걸림 — Drive 응답 지연 또는 병합 처리가 원인일 수 있음`);
                // 💡 저장이 막힌 경우(필수정보 미입력 / 새 프로젝트 비밀번호 미입력 등)에도 프로젝트 목록은
                //    항상 열어준다 — 저장된 다른 프로젝트를 여는 것 자체는 막을 이유가 없고, 지금 화면 내용은
                //    멀티시트 탭에 그대로 남아 있어 유실되지 않는다. 안내는 사유와 함께 "한 번만" 표시.
                if (!saved) {
                    const _why = window._lastSaveBlockReason || '';
                    alert(_en
                        ? (_why ? _why + '\n\n' : '') + '→ Skipping the save and opening the project list.\n(Current screen content stays in its sheet tab — nothing is lost.)'
                        : (_why ? _why + '\n\n' : '') + '→ 저장은 건너뛰고 프로젝트 목록을 엽니다.\n(지금 화면 내용은 시트 탭에 그대로 남아 있어 사라지지 않습니다)');
                }
            }
            // choice === 'discard' → 저장 없이 그대로 목록을 엶
        }
        const _t1 = performance.now();
        window.loadFromGoogleDrive().then(function() {
            console.info(`[프로젝트 열기 계측] 목록 조회(loadFromGoogleDrive): ${Math.round(performance.now() - _t1)}ms`);
        });
    }

    // 💡 상단바 현재 프로젝트 파일명 표시 갱신 — 로드된 파일이 없으면 아예 숨김
    window.updateCurrentFileLabel = function() {
        const el  = document.getElementById('current-project-filename');
        const sep = document.getElementById('current-file-sep');
        if (!el) return;
        if (window.currentDriveFileName) {
            el.textContent = '📄 ' + window.currentDriveFileName;
            el.style.display = 'inline-flex';
            if (sep) sep.style.display = 'block';
        } else {
            el.style.display = 'none';
            if (sep) sep.style.display = 'none';
        }
    };

    // 💡 [공용화] 팀 공용 폴더의 "실제 프로젝트 파일" 목록만 걸러서 반환 — 공유설정/인덱스/백업류
    //    (project_index.json·PriorityScore_Shared.json 등)는 프로젝트가 아니므로 제외.
    //    loadFromGoogleDrive(열기)와 deleteProjectFlow(삭제) 양쪽에서 같은 필터 기준을 공유한다.
    window._listProjectFiles = async function() {
        let response = await gapi.client.drive.files.list({
            q: `mimeType='application/json' and trashed=false and '${SHARED_FOLDER_ID}' in parents`,
            fields: 'files(id, name, modifiedTime, appProperties)', orderBy: 'modifiedTime desc', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
        });
        return (response.result.files || []).filter(function(f) {
            return !f.name.startsWith('TaskInbox_')
                && f.name !== PROMPT_DRIVE_FILENAME
                && f.name !== HOLIDAY_DRIVE_FILENAME
                && f.name !== PRIORITY_CONFIG_FILENAME
                && f.name !== PROJECT_INDEX_FILENAME
                && f.name !== MS_FILTER_RULES_DRIVE_FILENAME
                && f.name !== (window.AddressBook ? window.AddressBook.FILE_NAME : 'AddressBook_Shared.json');
        });
    };

    window.loadFromGoogleDrive = async function() {
        const _ldEn = window._currentLang === 'en';
        try {
            let files = await window._listProjectFiles();
            if (!files || files.length === 0) {
                window.showToast(_ldEn ? "No project files found in the shared team folder." : "팀 공용 폴더에 저장된 간트차트 프로젝트 파일이 없습니다.", 'error');
                return;
            }
            window.closeAllTopbarMenus(); // ✅ 드라이브 파일 목록 팝업 뜨기 전, 열려있던 파일 드롭다운 자동 닫기
            window.showDriveFileModal(files);
            window.showToast(_ldEn ? "✅ Project list loaded. Please select a file." : "✅ 공용 프로젝트 목록을 불러왔습니다. 화면에서 파일을 선택해 주세요.");
        } catch (err) { alert(_ldEn ? "Failed to load list: insufficient permissions or invalid folder ID." : "목록 호출 실패: 권한이 없거나 폴더 ID가 잘못되었습니다."); }
    }

    // 💡 [2026-08-25 신규] "🗑️ 프로젝트 삭제" — 구글 드라이브에서 프로젝트 파일을 지워도
    //    project_index.json(메일 자동매칭용 인덱스)엔 그 항목이 유령처럼 계속 남아있던 문제 해결.
    //    같은 목록 모달을 'delete' 모드로 열어서, 여기서 지우면 ①드라이브 파일 휴지통 이동
    //    ②project_index.json 항목 제거 ③열려있던 시트 탭 정리까지 한 번에 처리한다.
    window.deleteProjectFlow = async function() {
        const _en = window._currentLang === 'en';
        if (!window.isDriveConnected) {
            alert(_en ? "🔒 Please connect Google Drive first." : "🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.");
            return;
        }
        window.closeAllTopbarMenus();
        try {
            const files = await window._listProjectFiles();
            if (!files || files.length === 0) {
                window.showToast(_en ? "No project files found in the shared team folder." : "팀 공용 폴더에 저장된 간트차트 프로젝트 파일이 없습니다.", 'error');
                return;
            }
            window.showDriveFileModal(files, 'delete');
        } catch (err) {
            alert((_en ? "Failed to load list: " : "목록 호출 실패: ") + err.message);
        }
    };

    // project_index.json에서 특정 프로젝트 항목만 제거 (드라이브에서 파일을 지운 뒤, 메일 자동매칭
    // 후보 목록에 유령으로 남지 않도록 함께 정리). 인덱스 파일 자체가 없으면 지울 것도 없으니 통과.
    window._removeProjectIndexEntry = async function(driveFileId) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;
            const indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return true;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const loaded = await res.json();
            if (!loaded || !Array.isArray(loaded.projects)) return true;
            const before = loaded.projects.length;
            loaded.projects = loaded.projects.filter(function(p) { return p.drive_file_id !== driveFileId; });
            if (loaded.projects.length === before) return true; // 원래 인덱스에 없었음
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(loaded)
            });
            return true;
        } catch (err) { console.warn('project_index.json 항목 제거 실패:', err.message); return false; }
    };

    // 실제 삭제 실행 — ①파일명 직접 입력 확인(오클릭 방지) ②관리자 비밀번호 확인 ③드라이브 휴지통 이동
    // ④project_index.json 정리 ⑤열려있는 시트 탭 정리, 순서로 진행. 완전삭제가 아니라 "휴지통 이동"이라
    // 구글 드라이브 휴지통에서 30일 내 복구는 가능함(실수 대비 최소 안전장치).
    window._confirmDeleteProjectFile = async function(file) {
        const _en = window._currentLang === 'en';
        const typed = prompt(_en
            ? `⚠️ This permanently removes the project from the shared folder (recoverable from Google Drive Trash for a limited time).\nType the exact file name to confirm:\n\n${file.name}`
            : `⚠️ 이 프로젝트를 공용 폴더에서 삭제합니다 (구글 드라이브 휴지통에서 일정 기간 복구 가능).\n확인을 위해 파일명을 정확히 입력하세요:\n\n${file.name}`);
        if (typed !== file.name) {
            if (typed !== null) alert(_en ? '❌ File name did not match. Cancelled.' : '❌ 파일명이 일치하지 않습니다. 삭제가 취소되었습니다.');
            return;
        }
        if (!verifyAdminPassword(_en
            ? '🔒 Enter the admin password to delete this project.\n(case-insensitive)'
            : '🔒 프로젝트를 삭제하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert(_en ? '❌ Authentication failed. Deletion cancelled.' : '❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.');
            return;
        }
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) { alert(_en ? '🔒 Auth token lost. Please reconnect Google Drive.' : '🔒 구글 인증 토큰을 확보하지 못했습니다. 연동 버튼을 다시 클릭해 주세요.'); return; }

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashed: true })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(function() { return {}; });
                throw new Error((errBody.error && errBody.error.message) || ('HTTP ' + res.status));
            }

            await window._removeProjectIndexEntry(file.id);

            // 지금 열려있는 시트 중 이 파일과 연결된 탭이 있으면 정리(이미 지운 파일이라 저장하지 않고 그냥 닫음)
            const openIdx = window._sheets ? window._sheets.findIndex(function(s) { return s.fileId === file.id; }) : -1;
            if (openIdx !== -1) {
                const wasActive = window._sheets[openIdx].key === window._activeSheetKey;
                window._sheets.splice(openIdx, 1);
                if (wasActive) {
                    if (window._sheets.length) {
                        const next = window._sheets[Math.min(openIdx, window._sheets.length - 1)];
                        window._activeSheetKey = next.key;
                        window._restoreSheetSnapshot(next.snapshot);
                    } else {
                        window._activeSheetKey = null;
                        window._resetToBlankNoConfirm(true);
                    }
                } else {
                    window.renderSheetTabsBar();
                }
            }

            if (window.showToast) window.showToast(_en ? `🗑️ Deleted: ${file.name}` : `🗑️ 삭제 완료: ${file.name}`, 'info');

            // 같은 모달에서 이어서 다른 프로젝트도 지울 수 있도록 목록을 새로고침
            const remaining = await window._listProjectFiles();
            if (remaining.length) window.showDriveFileModal(remaining, 'delete'); else window.closeDriveModal();
        } catch (err) {
            alert((_en ? 'Delete failed: ' : '삭제 실패: ') + err.message);
        }
    };

    // 💡 백업 폴더(Drive) 찾기/생성 — SHARED_FOLDER_ID 안에 "Backups" 폴더가 없으면 새로 만듦
    window.getOrCreateBackupFolder = async function(token) {
        if (window._backupFolderId) return window._backupFolderId;
        const q = `mimeType='application/vnd.google-apps.folder' and name='Backups' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&orderBy=modifiedTime%20desc`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const listData = await listRes.json();
        if (listData.files && listData.files.length > 0) {
            window._backupFolderId = listData.files[0].id;
            return window._backupFolderId;
        }
        const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Backups', mimeType: 'application/vnd.google-apps.folder', parents: [SHARED_FOLDER_ID] })
        });
        const created = await createRes.json();
        window._backupFolderId = created.id;
        return window._backupFolderId;
    };

    // ═══════════════════════════════════════════════════════════
    // 📁 [Drive 폴더 정리] 공용 폴더 루트에 흩어져 있던 설정/백업류 파일을 하위 폴더로 정리.
    //    프로젝트 *.json 파일은 지금처럼 그대로 루트에 둔다(파일 탐색기에서 바로 보이게).
    //    - _App_Config/     : AddressBook_Shared.json, PriorityScore_Shared.json, Holidays_Shared.json,
    //                         AI_Prompt_Shared.json, project_index.json, MailFilterRules_Shared.json
    //    - TaskInbox_Backups/ : TaskInbox_<이름>.json (개인별 업무 보관함 백업)
    //    - Backups/ (기존 유지) : mail_secure.enc, telegram_secure.enc, gantt_pw_sync.json
    // ═══════════════════════════════════════════════════════════
    window._namedFolderIdCache = window._namedFolderIdCache || {};
    // 💡 getOrCreateBackupFolder와 동일한 find-or-create 패턴의 범용 버전 — 폴더 이름만 바꿔가며 재사용
    // 💡 [버그 수정] 실사용 중 Drive 연동 직후 주소록/우선순위점수/휴일/AI프롬프트/프로젝트인덱스/필터규칙
    //    등 여러 기능이 거의 동시에 각자 "_App_Config 폴더 있나? 없으면 만들기"를 시도하면서, 아직 아무도
    //    생성을 못 끝낸 그 찰나(수백ms)에 서로 "없다"고 판단해 같은 이름의 폴더를 중복 생성하는 사고가
    //    실제로 발생함(_App_Config 폴더가 2개 생김). 이미 진행 중인 생성 작업이 있으면 새로 조회/생성하지
    //    않고 그 결과를 그대로 기다리게 해서(in-flight 프라미스 공유) 경합을 없앤다.
    window._namedFolderPromiseCache = window._namedFolderPromiseCache || {};
    window._getOrCreateNamedFolder = function(token, folderName) {
        if (window._namedFolderIdCache[folderName]) return Promise.resolve(window._namedFolderIdCache[folderName]);
        if (window._namedFolderPromiseCache[folderName]) return window._namedFolderPromiseCache[folderName];

        const p = (async () => {
            const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&orderBy=modifiedTime%20desc`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const listData = await listRes.json();
            if (listData.files && listData.files.length > 0) {
                window._namedFolderIdCache[folderName] = listData.files[0].id;
                return window._namedFolderIdCache[folderName];
            }
            const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [SHARED_FOLDER_ID] })
            });
            const created = await createRes.json();
            window._namedFolderIdCache[folderName] = created.id;
            return window._namedFolderIdCache[folderName];
        })();

        window._namedFolderPromiseCache[folderName] = p;
        p.finally(() => { delete window._namedFolderPromiseCache[folderName]; });
        return p;
    };
    window.getOrCreateConfigFolder    = function(token) { return window._getOrCreateNamedFolder(token, 'App_Config'); };
    window.getOrCreateTaskInboxFolder = function(token) { return window._getOrCreateNamedFolder(token, 'TaskInbox_Backups'); };

    // 💡 [마이그레이션 포함 조회] 이미 팀이 루트에 저장해둔 기존 설정 파일을 "새로 만든 것처럼" 못 찾아서
    //    빈 기본값으로 초기화되는 사고를 막기 위해: 새 하위 폴더에서 먼저 찾고, 없으면 예전 위치(루트)에서
    //    찾아 그 파일을 하위 폴더로 실제로 옮긴다(복제가 아니라 이동 — 되돌리기 쉬움, 데이터 유실 없음).
    window._findOrMigrateFile = async function(token, fileName, targetFolderId) {
        const qSub = `name='${fileName}' and trashed=false and '${targetFolderId}' in parents`;
        const subRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSub)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const subData = await subRes.json();
        if (subData.files && subData.files.length > 0) return subData.files[0].id;

        const qRoot = `name='${fileName}' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
        const rootRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qRoot)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const rootData = await rootRes.json();
        if (!rootData.files || !rootData.files.length) return null; // 어디에도 없음 — 신규 파일

        const oldId = rootData.files[0].id;
        try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${oldId}?addParents=${targetFolderId}&removeParents=${SHARED_FOLDER_ID}&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
            });
            console.info(`💡 [Drive 폴더 정리] "${fileName}"을(를) 루트에서 하위 폴더로 이동했습니다.`);
        } catch (e) { console.warn('Drive 파일 폴더 이동 실패(루트에 그대로 둠):', fileName, e.message); }
        return oldId;
    };

    // 💡 저장 시마다 드라이브 Backups 폴더에 타임스탬프 백업 파일 생성 + 7일 지난 백업 자동 삭제
    window.backupToDrive = async function(saveData, baseName) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            const folderId = await window.getOrCreateBackupFolder(token);

            const now = new Date();
            const ts = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0')
                + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
            const backupName = '백업_' + (baseName || 'GanttChart').replace(/\.json$/i, '') + '_' + ts + '.json';

            const boundary = 'backup_boundary';
            // 💡 [2026-08-30 신규] 복원 목록에서도 저장된 테마 색을 바로 보여주기 위해 appProperties에 같이 태움.
            const metadata = { name: backupName, mimeType: 'application/json', parents: [folderId], appProperties: { themeColor: (saveData && saveData.tabData && saveData.tabData.themeColor) || '' } };
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData)
                + "\r\n--" + boundary + "--";

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                body: body
            });

            // 💡 7일(604800000ms) 지난 백업은 자동 정리
            const listQ = `'${folderId}' in parents and trashed=false`;
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,createdTime)`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const listData = await listRes.json();
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const oldFiles = (listData.files || []).filter(function(f) { return new Date(f.createdTime).getTime() < cutoff; });
            for (const f of oldFiles) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) { alert("목록 호출 실패: 권한이 없거나 폴더 ID가 잘못되었습니다."); }
    }

    // ─── 🤖 팀 공용 AI 프롬프트 — 드라이브에 JSON으로 저장/동기화 ───
    const PROMPT_DRIVE_FILENAME = 'AI_Prompt_Shared.json';

    window.findPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 [2026-08-24 버그 수정] "AI 개선 채택"을 드라이브 미연동 상태(또는 업로드 실패)로 했다면
            //    로컬에 아직 드라이브로 못 올라간 변경이 남아있을 수 있음 — 이 상태에서 그냥 드라이브
            //    최신본을 받아와 덮어쓰면 방금 채택한 변경이 조용히 사라진다. 대기 중인 로컬 변경이
            //    있으면 "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_mail_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_mail_prompt');
                if (pendingText && window.savePromptToDrive) {
                    const pushed = await window.savePromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_mail_prompt_pending_push');
                }
                return pendingText; // 성공/실패 어느 쪽이든, 아직 못 올렸을 수 있으니 로컬 변경을 보존하고 그대로 반환
            }

            const fileId = await window.findPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_mail_prompt', data.prompt);
                window._promptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.savePromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._promptVersion || 1)  // 💡 버전 번호 (채택 시 증가)
            };

            // 💡 [버그 수정] fetch()는 HTTP 오류 응답에도 예외 없이 resolve된다 — res.ok를 확인하지 않으면
            //    업로드 실패를 "성공"으로 착각해 pending_push 플래그가 잘못 해제되고, 다음 드라이브
            //    재연결 시 옛 버전이 로컬 편집을 덮어써버림 (AI 프로젝트 요약 프롬프트에서 발견된 것과
            //    동일한 패턴의 버그 — 그쪽을 고치며 함께 수정).
            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'prompt_boundary';
                const metadata = { name: PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 🤖 [2026-08-24 신규] AI 프로젝트 요약 프롬프트 — 위 메일분석 프롬프트와 완전히 동일한 패턴을
    //    그대로 복제한 "별도" 파일. AI_Prompt_Shared.json 안에 필드 하나 추가하는 방법도 가능했지만,
    //    그러면 updatedBy/updatedAt/version이 서로 다른 두 프롬프트의 이력을 한 필드로 뭉뚱그려서
    //    "누가 언제 뭘 고쳤는지"가 헷갈리게 됨 — 이 코드베이스가 이미 AddressBook/PriorityScore/
    //    MailFilterRules처럼 "파일 하나 = 관심사 하나" 원칙을 따르고 있어서, 그 관례를 그대로 따름 ───
    const PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME = 'AI_ProjectSummary_Prompt_Shared.json';

    window.findProjectSummaryPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadProjectSummaryPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 [2026-08-24 버그 수정] "AI 개선 채택"을 드라이브 미연동 상태(또는 업로드 실패)로 했다면
            //    로컬에 아직 드라이브로 못 올라간 변경이 남아있을 수 있음 — 이 상태에서 그냥 드라이브
            //    최신본을 받아와 덮어쓰면 방금 채택한 변경이 조용히 사라진다. 대기 중인 로컬 변경이
            //    있으면 "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_project_summary_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_project_summary_prompt');
                if (pendingText && window.saveProjectSummaryPromptToDrive) {
                    const pushed = await window.saveProjectSummaryPromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_project_summary_prompt_pending_push');
                }
                return pendingText; // 성공/실패 어느 쪽이든, 아직 못 올렸을 수 있으니 로컬 변경을 보존하고 그대로 반환
            }

            const fileId = await window.findProjectSummaryPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_project_summary_prompt', data.prompt);
                window._projectSummaryPromptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('AI 요약 프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.saveProjectSummaryPromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findProjectSummaryPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._projectSummaryPromptVersion || 1)
            };

            // 💡 [버그 수정] fetch()는 401/403/404 등 HTTP 오류 응답에도 정상적으로 resolve되고 예외를
            //    던지지 않는다 — 아래에서 res.ok를 확인하지 않으면 업로드가 실제로는 실패했는데도
            //    이 함수가 true를 반환해서 "드라이브 저장 완료" 상태(pending_push 플래그 해제)로
            //    잘못 표시된다. 그러면 다음번 loadProjectSummaryPromptFromDrive() 호출(드라이브
            //    재연결 시 자동 실행됨) 때 옛 드라이브 버전을 그대로 받아와 방금 편집한 로컬 프롬프트를
            //    조용히 덮어써버려 "프롬프트를 수정해도 분석에 반영이 안 되는" 증상으로 이어졌음.
            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'proj_summary_prompt_boundary';
                const metadata = { name: PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('AI 요약 프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 💬 [2026-08-31 신규] AI 문답 프롬프트 — 드라이브에 JSON으로 저장/동기화 ───
    //    기존엔 소스 코드(_buildGanttQaPrompt)에 통째로 하드코딩되어 있어 문구 하나 고치려면 코드를
    //    수정·배포해야 했다. AI 업무분석/AI 프로젝트 요약과 완전히 동일한 패턴(팀 공용 Drive JSON +
    //    localStorage 캐시)으로 옮겨서, 코드 수정 없이 앱 화면에서 프롬프트를 조정하고 팀과 공유할 수 있게 함.
    const GANTT_QA_PROMPT_DRIVE_FILENAME = 'AI_QA_Prompt_Shared.json';

    window.findGanttQaPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, GANTT_QA_PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadGanttQaPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 위 두 프롬프트와 동일한 안전장치 — 아직 드라이브로 못 올린 로컬 변경이 있으면
            //    "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_qa_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_qa_prompt');
                if (pendingText && window.saveGanttQaPromptToDrive) {
                    const pushed = await window.saveGanttQaPromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_qa_prompt_pending_push');
                }
                return pendingText;
            }

            const fileId = await window.findGanttQaPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_qa_prompt', data.prompt);
                window._ganttQaPromptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('AI 문답 프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.saveGanttQaPromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findGanttQaPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._ganttQaPromptVersion || 1)
            };

            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'qa_prompt_boundary';
                const metadata = { name: GANTT_QA_PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('AI 문답 프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 🗓️ 팀 공용 휴일 목록 — 드라이브에 JSON으로 저장/동기화 ───
    const HOLIDAY_DRIVE_FILENAME = 'Holidays_Shared.json';

    window.findHolidayDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, HOLIDAY_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 팀 공용 휴일 목록을 받아와 로컬 캐시(localStorage)에 반영 (미연동이면 조용히 종료)
    window.loadHolidaysFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            const fileId = await window.findHolidayDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                localStorage.setItem('gantt_custom_holidays', JSON.stringify(data));
                if (window.renderCustomHolidayList) window.renderCustomHolidayList();
                return data;
            }
            return null;
        } catch (err) { console.error('휴일 목록 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 휴일 목록을 드라이브 공용 파일로 업로드 (여러 사람이 등록/삭제한 내용을 공유)
    window.saveHolidaysToDrive = async function(list) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findHolidayDriveFile(token);
            const body = JSON.stringify(list);

            if (fileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'holiday_boundary';
                const metadata = { name: HOLIDAY_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
            }
            return true;
        } catch (err) { console.error('휴일 목록 드라이브 저장 실패:', err); return false; }
    };

    // ============================================================
    // 💡 project_index.json — 메일 자동처리 파이프라인용 경량 프로젝트 인덱스
    //    각 프로젝트 저장 시(saveToGoogleDrive 성공 직후) 이 인덱스에 해당 프로젝트
    //    항목만 upsert 한다. Flask 백엔드가 이 파일 하나만 읽어서 메일↔프로젝트를
    //    매칭하므로, 매칭 때마다 전체 프로젝트 파일을 열 필요가 없다.
    //    (사전 협의: ① 저장 시 자동 갱신 A안 채택, Flask 쪽 일 1회 보정 스캔은 백엔드 작업)
    // ============================================================
    const PROJECT_INDEX_FILENAME = 'project_index.json';
    const PRIORITY_CONFIG_FILENAME = 'PriorityScore_Shared.json';

    // 💡 [우선순위 점수] 회사 전체 공유 설정 — 직함별 점수, 긴급키워드 사전, 커트라인
    //    Holidays_Shared.json과 동일한 find/create 패턴
    window._priorityConfigDefault = function() {
        return {
            titleScores: {
                '경영진 (회장·이사·본부장·연구소장)': 10,
                '관리직 (팀장·파트장·섹션리더·감사)': 8,
                '실무직 (매니저·조장·사원)': 5
            },
            externalCustomerScore: 10,   // 발신자 도메인이 kortek.co.kr이 아니면 가산
            urgentKeywords: [
                { word: '긴급', score: 8 },
                { word: '중요', score: 6 },
                { word: '공지', score: 4 },
                { word: '알림', score: 3 }
            ],
            toMeScore: 10,     // 내가 To(직접수신)
            ccMeScore: 3,      // 내가 Cc(참조)
            importanceHighScore: 5,  // 발신자가 Outlook 등에서 '중요! 높음'으로 표시
            cutline: 50        // 💡 이 점수 이상이면 우선순위 높음으로 표시 — PM이 UI에서 직접 조정
        };
    };

    window.findPriorityConfigFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PRIORITY_CONFIG_FILENAME, folderId);
    };

    window.loadPriorityConfig = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return window._priorityConfigDefault();
            const fileId = await window.findPriorityConfigFile(token);
            if (!fileId) return window._priorityConfigDefault();
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            // 누락 필드는 기본값으로 보강 (신규 필드 추가돼도 기존 저장 파일과 호환)
            const merged = Object.assign(window._priorityConfigDefault(), data);
            // 💡 1회성 마이그레이션 — localStorage 중요 키워드 → urgentKeywords로 이전
            const legacyKw = localStorage.getItem('mail_global_important_kw');
            if (legacyKw) {
                const legacyList = legacyKw.split(',').map(s => s.trim()).filter(Boolean);
                const existing = (merged.urgentKeywords || []).map(k => k.word.toLowerCase());
                legacyList.forEach(word => {
                    if (!existing.includes(word.toLowerCase())) {
                        merged.urgentKeywords.push({ word, score: 7 });
                    }
                });
                localStorage.removeItem('mail_global_important_kw');
                window.savePriorityConfig(merged); // fire-and-forget
                console.log(`💡 중요 키워드 마이그레이션 완료: ${legacyList.join(', ')}`);
            }
            return merged;
        } catch(e) { console.warn('PriorityScore_Shared.json 로드 실패, 기본값 사용:', e); return window._priorityConfigDefault(); }
    };

    window.savePriorityConfig = async function(config) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;
            const fileId = await window.findPriorityConfigFile(token);
            const body = JSON.stringify(config);
            if (fileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'priority_config_boundary';
                const metadata = { name: PRIORITY_CONFIG_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
            }
            return true;
        } catch(e) { console.error('PriorityScore_Shared.json 저장 실패:', e); return false; }
    };

    // 💡 [성능 수정] AddressBook._driveFileId/폴더 캐시와 동일한 이유 — 이 파일 ID는 세션 중 바뀌지 않는데,
    //    캐시가 없어서 저장(updateProjectIndexEntry)할 때마다 매번 files.list 조회(최대 2번, 루트 이동
    //    마이그레이션까지 겹치면 3번)를 새로 하고 있었다. "저장 한 번에 API를 몇 번이나 두드리냐"는
    //    질문의 답 중 하나 — 이 조회만 캐싱해도 저장마다 1~2콜이 줄어든다.
    window._projectIndexFileId = null;
    window.findProjectIndexFile = async function(token) {
        if (window._projectIndexFileId) return window._projectIndexFileId;
        const folderId = await window.getOrCreateConfigFolder(token);
        const id = await window._findOrMigrateFile(token, PROJECT_INDEX_FILENAME, folderId);
        if (id) window._projectIndexFileId = id;
        return id;
    };

    // 쉼표로 구분된 메일키워드 문자열 → 정제된 배열 (공백 제거, 빈 항목 제거, 중복 제거)
    window._parseMailKeywords = function(raw) {
        if (!raw) return [];
        const seen = new Set();
        raw.split(',').forEach(function(s) {
            const v = s.trim();
            if (v) seen.add(v);
        });
        return Array.from(seen);
    };

    // 💡 [2026-08-29 신규] "발신인 이름만으로 오매칭됐다"는 지적 대응 — 사람이 보내는 메일에는 본인
    //    이름이 서명란에 항상 등장하므로, 그 사람 이름이 어느 프로젝트의 "메일키워드"에 등록돼 있으면
    //    그 사람이 보내는 모든 메일(내용과 무관하게)이 그 프로젝트로 자동 매칭돼버린다. 이미
    //    _msSuggestKeywordsForUnmatched(20195줄 부근)가 "키워드 제안" 단계에서 주소록 이름을 걸러내는
    //    knownNameTokens 로직을 갖고 있었지만, 그건 ①AI가 아직 못 찾은 메일에서 "새 키워드를 제안할 때"만
    //    적용되고 ②영문 패턴(A-Z 정규식)만 훑어서 한글 이름("박용훈")은 애초에 후보로도 안 잡혔다 —
    //    그래서 "메일키워드" 칸에 누군가(예: 담당자 본인)가 직접 한글 이름을 수동으로 입력해두면 이 필터를
    //    완전히 우회해서 그대로 매칭에 쓰였다. 여기서는 실제로 "이 사람이 보낸 메일과 매칭시킬 키워드
    //    목록"을 만드는 지점(buildProjectIndexEntry) 자체에서 주소록에 등록된 이름과 겹치는 키워드를
    //    걸러내서, 어떤 경로로 이름이 끼어들었든(수동 입력·붙여넣기·향후 다른 자동 제안 경로) 매칭에는
    //    절대 안 쓰이게 막는다. Summary 탭의 "메일키워드" 입력값 자체는 지우지 않음 — 매칭에서만 뺀다.
    window._msIsKnownPersonName = function(token) {
        const t = String(token || '').trim().toLowerCase();
        if (!t) return false;
        const book = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : [];
        for (let i = 0; i < book.length; i++) {
            const p = book[i];
            for (const n of [p.name, p.nameEn]) {
                const full = String(n || '').trim().toLowerCase();
                if (!full) continue;
                if (full === t) return true;
                // 성/이름을 띄어쓰기로 등록해뒀으면(예: "Jun Kim") 낱말 단위로도 같은 사람으로 간주
                if (full.split(/[\s,]+/).filter(Boolean).indexOf(t) !== -1) return true;
            }
        }
        return false;
    };

    // 현재 열려 있는 프로젝트의 인덱스 항목 생성 (모델/고객사/담당자/인치 4필드 + 커스텀 키워드)
    // 💡 [긴급 버그 수정] pmOverride를 안 넘기면 window.projectMeta(전역, 실시간)를 읽는데, 이 함수의
    //    호출부(updateProjectIndexEntry)에 await가 여러 번 있어서 그 사이 다른 프로젝트로 시트가
    //    전환되면 "옛 프로젝트의 driveFileId"에 "이미 바뀐 새 프로젝트의 projectMeta"가 합쳐져
    //    project_index.json에 저장되는 사고가 실제로 있었음(파일명↔모델명이 서로 안 맞는 항목들로 확인됨).
    //    호출부에서 await 전에 미리 캡처한 스냅샷을 pmOverride로 넘겨서 이 드리프트를 원천 차단한다.
    window.buildProjectIndexEntry = function(driveFileId, dynamicFileName, pmOverride, materialsOverride) {
        const pm = pmOverride || window.projectMeta || {};
        // 💡 고객사명은 매칭 키워드에서 제외 — 한 고객사가 여러 프로젝트를 가진 경우
        //    (예: LNW의 STELLAR32/OBSIDIAN) 전부 후보로 묶여버려 변별력이 없음.
        //    customer 필드 자체는 화면 표시용으로만 남기고, keywords 배열엔 안 넣음.
        const baseFields = [pm.모델명, pm.고객모델명, pm.인치, pm.프로젝트명].filter(Boolean);
        // 💡 [2026-08-29 버그 수정] "발신인 이름만으로 오매칭됐다"는 지적 — 메일키워드 칸에 사람 이름이
        //    (직접 입력 등으로) 들어가 있으면, 그 사람이 보내는 모든 메일이 서명란 때문에 내용과 무관하게
        //    이 프로젝트로 매칭돼버린다. 주소록에 등록된 이름과 겹치는 항목은 매칭용 키워드에서 제외
        //    (Summary 탭 입력값 자체는 그대로 둠 — window._msIsKnownPersonName 참고).
        const customKeywords = window._parseMailKeywords(pm.메일키워드).filter(function(kw) { return !window._msIsKnownPersonName(kw); });
        // 💡 [2026-08-20] "분석용" 체크된 주요 자재의 PN/설명도 매칭 키워드로 편입 — 공용 부품은
        //    체크 안 하는 게 원칙이므로, 여기 들어오는 건 이 프로젝트를 특정할 만한 것들만 남음.
        const materials = materialsOverride || (window.tabData && window.tabData.projectMaterials) || [];
        const materialKeywords = materials
            .filter(function(m) { return m && m.useForAnalysis; })
            .flatMap(function(m) { return [m.ktkPn, m.description].filter(Boolean); });
        const keywords = Array.from(new Set(baseFields.concat(customKeywords).concat(materialKeywords)));
        return {
            drive_file_id: driveFileId,
            file_name: dynamicFileName,
            model: pm.모델명 || pm.고객모델명 || '',
            customer: pm.고객사 || '',
            assignee: pm.프로젝트담당자 || '',
            inch: pm.인치 || '',
            keywords: keywords,          // Stage 1 AI 매칭에 사용할 전체 키워드 (4필드 + 커스텀)
            completed: pm.완료여부 === '완료', // 💡 [2026-08-29 신규] 완료 프로젝트 메일 자동매칭 제외용 — _msMatchProjects 참고
            updated_at: new Date().toISOString()
        };
    };

    // project_index.json을 통째로 읽어와서 해당 프로젝트 항목만 upsert 후 다시 통째로 저장
    // (프로젝트 수가 많지 않은 전제 — 수백 개 넘어가면 서버 사이드 부분갱신 방식으로 전환 필요)
    window.updateProjectIndexEntry = async function(driveFileId, dynamicFileName) {
        // 💡 [긴급 버그 수정] await 시작 전에 지금 이 저장이 실제로 속한 projectMeta를 즉시 스냅샷.
        //    아래 await들(findProjectIndexFile/fetch) 도중 다른 시트로 전환돼도 이 스냅샷은 안 바뀌므로,
        //    엉뚱한 프로젝트의 최신 정보가 이 driveFileId 밑에 섞여 들어가는 사고를 막는다.
        const pmSnapshot = Object.assign({}, window.projectMeta || {});
        // 💡 주요 자재 목록도 같은 이유로 await 전에 스냅샷 — 그 사이 다른 시트로 전환돼도 안전하게
        const materialsSnapshot = ((window.tabData && window.tabData.projectMaterials) || []).slice();
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token || !driveFileId) return false;

            const indexFileId = await window.findProjectIndexFile(token);
            let indexData = { projects: [] };
            if (indexFileId) {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const loaded = await res.json();
                if (loaded && Array.isArray(loaded.projects)) indexData = loaded;
            }

            const entry = window.buildProjectIndexEntry(driveFileId, dynamicFileName, pmSnapshot, materialsSnapshot);
            const idx = indexData.projects.findIndex(function(p) { return p.drive_file_id === driveFileId; });
            if (idx === -1) indexData.projects.push(entry);
            else indexData.projects[idx] = entry;

            const body = JSON.stringify(indexData);
            if (indexFileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'proj_index_boundary';
                const metadata = { name: PROJECT_INDEX_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
                const created = await createRes.json();
                if (created && created.id) window._projectIndexFileId = created.id; // 💡 방금 만든 파일 ID를 캐시에 반영
            }
            return true;
        } catch (err) { console.error('project_index.json 갱신 실패 (메일 자동처리 매칭에 영향 — 저장 자체는 정상 완료됨):', err); return false; }
    };

    // 💡 화면/데이터를 빈 상태로 초기화 (확인창 없이) — startNewProject과 [멀티시트] 마지막 시트를 닫았을 때 공용으로 사용
    window._resetToBlankNoConfirm = function(skipModal) {
        globalData = []; existingDevStages = []; filterColumns = []; currentFilters = {}; window.projectDistributions = [];
        colIdx = { no: -1, bogo: -1, start: -1, plan: -1, period: -1, dur1: -1, dur2: -1, dur3: -1, dur4: -1, assignee: -1, taskType1: -1, taskType2: -1, taskType3: -1, taskType4: -1, status: -1, customer: -1, model: -1, inch: -1, devStage: -1, content: -1, answer: -1, chart: -1, wbs: -1 };
        window.changeLogs = []; window.lastSavedLogCount = 0;
        window.currentDriveFileId = null; window.currentDriveFileName = null;
        window.projectMeta = {}; window.tabData = {};
        window._compareTargetId = null;
        if (window.loadScheduleBaselines) window.loadScheduleBaselines(); // 💡 [버그 수정] 프로젝트별 계획 분리

        if (typeof renderTable === 'function') renderTable(globalData);
        if (window.clearAllTabFields) window.clearAllTabFields(); // 💡 Summary/Brief SPEC/M.C Table/Address까지 함께 비움
        window.updateCurrentFileLabel();
        window.renderSheetTabsBar();
        if (!skipModal) document.getElementById('new-project-modal-overlay').style.display = 'flex';
    };

    // 💡 새 프로젝트 시작: 현재 화면/데이터를 완전히 초기화 (Gantt + 다른 모든 탭) — [멀티시트] 새 빈 시트로 추가
    //    🔒 [설계 변경] 비밀번호 보호를 "이 버튼을 눌렀을 때"가 아니라, 실제로 새 드라이브 파일이
    //    "생성되는 순간"(_saveToGoogleDriveRaw, !fileId일 때)으로 옮겼다. 예전엔 이 버튼에만 걸려있어서,
    //    버튼을 거치지 않고 그냥 초기/빈 상태(프로젝트 아무것도 없거나 전부 닫은 상태)에서 곧바로
    //    타이핑하거나 엑셀을 드래그해 저장하면 비밀번호 확인 없이 새 프로젝트가 등록되는 구멍이 있었다.
    //    "새 프로젝트 만들기"라는 화면 초기화 자체는 아직 아무것도 만든 게 아니므로(저장 전까지는
    //    로컬 뷰만 비우는 것) 여기서는 더 이상 비밀번호를 묻지 않고, 실제로 등록(첫 저장)될 때 막는다.
    window.startNewProject = function() {
        if (!confirm(window._t('현재 화면의 내용을 모두 지우고(간트/Summary/Customer SPEC/M.C Table/Address 포함) 새 프로젝트를 시작하시겠습니까?\n(저장하지 않은 변경사항은 사라집니다)', 'Clear all data (Gantt/Summary/Customer SPEC/M.C Table/Address) and start a new project?\n(Unsaved changes will be lost)'))) return;

        window._openAsNewSheet('new_' + Date.now(), null, null);
        window._resetToBlankNoConfirm();
    };

    // ═══════════════════════════════════════════════════════════
    // 🚀 [새 프로젝트 자동 시작] "참조 엑셀 다운로드 → 작성 → 화면에 드래그"를 수동으로 하는 기존 방식은
    //    그대로 두고, 구글 드라이브 연동이 이미 되어 있는 사용자는 참조 엑셀을 바로 가져와 화면에
    //    반영할 수 있게 한다. (다운로드/재업로드 왕복 없이, 이미 화면에 있는 handleFiles() 가져오기
    //    파이프라인을 그대로 재사용 — 드래그로 불러온 것과 완전히 동일하게 처리됨)
    // ═══════════════════════════════════════════════════════════
    window.REFERENCE_SHEET_ID = '1lhg8Usuj-SP9Bsp_gs8Cnz9jnvQF3D7T';
    window.autoImportReferenceExcel = async function() {
        const btn = document.getElementById('new-project-auto-import-btn');
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;

        // 💡 구글 드라이브 미연동 상태면 자동 가져오기가 불가능 — 연동을 제안하고, 원치 않으면
        //    기존처럼 아래 "참조 엑셀 다운로드" 링크로 수동 진행하면 됨(이 버튼은 아무것도 건드리지 않음)
        if (!token) {
            if (confirm(window._t(
                '자동으로 가져오려면 먼저 구글 드라이브 연동이 필요합니다.\n지금 연동하시겠습니까? (연동 후 이 버튼을 다시 눌러주세요)',
                'Connecting Google Drive is required to auto-import.\nConnect now? (After connecting, click this button again.)'
            ))) {
                if (window.handleAuthClick) window.handleAuthClick();
            }
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = window._t('⏳ 가져오는 중...', '⏳ Importing...'); }

        // 💡 응답 실패 시 Drive가 돌려준 실제 오류 메시지(권한 없음/파일 없음 등)까지 최대한 뽑아냄 —
        //    "HTTP 403"만으로는 원인 파악이 안 돼서, 이 앱의 다른 Drive 호출부(주소록 불러오기 등)와
        //    동일하게 error.message까지 붙여서 보여준다.
        async function describeFailure(resp) {
            let detail = '';
            try { const j = await resp.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) {}
            return 'HTTP ' + resp.status + (detail ? ' - ' + detail : '');
        }

        try {
            const authHeader = { 'Authorization': `Bearer ${token}` };
            let blob = null; let lastErr = '';

            // 1차: 참조 파일이 "구글 시트"(네이티브 문서)라고 가정하고 xlsx로 변환(export)해서 받는다.
            //    docs.google.com/.../export 링크(수동 다운로드용)는 브라우저 직접 이동만 되고 CORS 때문에
            //    fetch()로는 못 읽으므로, 이미 연동된 OAuth 토큰으로 Drive REST API를 직접 호출한다.
            try {
                const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                const exportUrl = `https://www.googleapis.com/drive/v3/files/${window.REFERENCE_SHEET_ID}/export?mimeType=${encodeURIComponent(mimeType)}`;
                const resp1 = await fetch(exportUrl, { headers: authHeader });
                if (resp1.ok) blob = await resp1.blob();
                else lastErr = await describeFailure(resp1);
            } catch (e) { lastErr = e.message; }

            // 2차 폴백: 만약 참조 파일이 실제로는 이미 업로드된 xlsx 원본이라면(구글 시트가 아니라면)
            //    export가 아니라 원본 그대로 받는 alt=media가 맞다 — 이 앱의 주소록 불러오기와 동일 패턴.
            if (!blob) {
                try {
                    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${window.REFERENCE_SHEET_ID}?alt=media&supportsAllDrives=true`;
                    const resp2 = await fetch(mediaUrl, { headers: authHeader });
                    if (resp2.ok) blob = await resp2.blob();
                    else lastErr += ' / ' + await describeFailure(resp2);
                } catch (e) { lastErr += ' / ' + e.message; }
            }

            if (!blob) throw new Error(lastErr || '알 수 없는 오류');

            const file = new File([blob], '참조_엑셀.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            document.getElementById('new-project-modal-overlay').style.display = 'none';
            // 💡 드래그로 불러올 때와 동일한 진입점 — 컬럼 매핑/레벨 판별/초기 잠금 등 기존 로직을 100% 재사용
            handleFiles({ target: { files: [file] } });
            if (window.showToast) window.showToast(window._t(
                '📥 참조 엑셀을 자동으로 불러왔습니다. 내용을 채워서 진행해주세요.',
                '📥 Reference Excel imported automatically. Fill it in to continue.'
            ));
        } catch (err) {
            console.error('참조 엑셀 자동 가져오기 실패:', err);
            alert(window._t(
                '⚠️ 참조 엑셀을 자동으로 가져오지 못했습니다.\n(' + err.message + ')\n\n아래 "참조 엑셀 다운로드" 링크로 수동 진행해주세요.',
                '⚠️ Failed to auto-import the reference Excel.\n(' + err.message + ')\n\nPlease use the "Download Reference Excel" link below instead.'
            ));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = window._t('🚀 자동으로 가져오기', '🚀 Auto Import'); }
        }
    };

    // 💡 [2026-08-24] 멤버-1,2 담당자 라벨(sum-*-label)의 기본 텍스트 — clearAllTabFields(새 프로젝트
    //    시작)와 populateTabData(시트 전환/프로젝트 로드) 양쪽에서 공유하는 단일 출처. 예전엔 각자
    //    따로 관리돼서, 시트 전환 시 이 기본값을 몰라 빈 값이면 그냥 건너뛰거나(→ 이전 시트의 라벨이
    //    그대로 남는 사고) 무조건 지워버리는(→ 매번 빈칸이 되는 사고) 문제가 있었음.
    window.DEFAULT_MEMBER_LABELS = {
        'sum-pm-label': '프로젝트 담당자',
        'sum-mech-label': '기구 담당자',
        'sum-hw-label': 'H/W 담당자',
        'sum-fw-label': 'F/W 담당자',
        'sum-module-label': 'BLU 담당자',
        'sum-tsp-label': 'TSP 담당자',
        'sum-lcm-label': 'LCM 담당자',
        'sum-slimming-label': 'Slimming 담당자',
        'sum-cutting-label': 'Cutting 담당자',
        'sum-tooling-label': 'Tooling 담당자'
    };
    // 💡 Summary/Brief SPEC/M.C Table/Address 탭 필드를 전부 비움 (populateTabData는 "채우기"만 하고
    //    비어있는 값은 건너뛰기 때문에, 새 프로젝트 시작 시 기존 값이 그대로 남는 문제를 방지)
    window.clearAllTabFields = function() {
        document.querySelectorAll('#tab-summary input, #tab-summary textarea').forEach(function(el) { el.value = ''; });
        // 💡 프로젝트 멤버-1,2의 담당자 라벨(sum-*-label)은 자유롭게 수정할 수 있지만,
        //    새 프로젝트를 시작할 때는 항상 아래 기본 라벨로 복원되어야 한다.
        Object.keys(window.DEFAULT_MEMBER_LABELS).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = window.DEFAULT_MEMBER_LABELS[id];
        });
        ['briefspec-body', 'address-table-body', 'mctable-body'].forEach(function(id) {
            const el = document.getElementById(id); if (el) el.innerHTML = '';
        });
        if (window.renderMember3Rows) window.renderMember3Rows([]);
    };

    // 💡 저장 성공처럼 "확인" 없이 넘어가도 되는 알림 — 잠깐 떴다가 자동으로 사라짐
    window._toastStack = [];
    window._toastH = 64; // 토스트 1개 높이 — 아래 showToast의 고정 크기(width/max-height)와 일치시켜야 스택이 안 겹침

    window._toastReposition = function() {
        window._toastStack.forEach(function(el, i) {
            const bottom = 24 + i * (window._toastH + 8);
            el.style.bottom = bottom + 'px';
        });
    };

    window.showToast = function(message, type, duration) {
        type = type || 'success';
        // 💡 [2026-08-29 파스텔 통일] 채도 높은 solid 배경(빨강/주황/진남색)+흰 글자 대신, 다른 곳과 동일한
        //    4색 파스텔 기준(옅은 배경 + 진한 글자 + 옅은 테두리)으로 교체.
        const themeMap = {
            error:   { bg: '#fbe4e2', text: '#b1432f', border: '#eeb0ac' },
            info:    { bg: '#eef1f3', text: '#495057', border: '#ced4da' },
            warning: { bg: '#fbead9', text: '#a85d0a', border: '#edbf85' },
            success: { bg: '#e8f4fd', text: '#1a4f7a', border: '#a5c8f0' },
        };
        const theme = themeMap[type] || themeMap.success;
        const ms = duration || (type === 'error' ? 5000 : type === 'info' ? 2500 : 3000);
        const toast = document.createElement('div');
        toast.textContent = message;
        const initBottom = 24 + window._toastStack.length * (window._toastH + 8);
        // 💡 [2026-08-29 크기 통일] min/max-width 범위 + 줄 수 제한 없음이라 메시지 길이에 따라 토스트마다
        //    폭·높이가 들쭉날쭉했다(길게 줄바꿈되면 아래 토스트와 겹치기도 함). width 고정 + 최대 2줄까지만
        //    보이고 넘치면 …로 잘라서, 메시지 길이와 무관하게 항상 같은 크기의 토스트가 뜨도록 통일.
        // 💡 [2026-08-30 수정] 2줄 제한이었는데 메시지가 3줄로 꺾이는 경우가 종종 있어 3번째 줄이 통째로
        //    잘려 안 보이는 문제 — 토스트 바깥 크기(320×64)는 그대로 고정하고, 안쪽 여백을 살짝 줄이고
        //    글자 크기/줄간격을 낮춰서 같은 박스 안에 3줄까지 들어가도록 조정.
        toast.style.cssText = `
            position:fixed; bottom:${initBottom}px; right:24px; z-index:999999;
            background:${theme.bg}; color:${theme.text}; border:1px solid ${theme.border};
            padding:10px 16px; border-radius:8px; font-size:11px; font-weight:bold; line-height:1.3;
            box-shadow:0 4px 14px rgba(0,0,0,0.18); width:320px; height:64px; white-space:pre-line;
            display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
            opacity:0; transform:translateY(8px); box-sizing:border-box;
            transition:opacity 0.25s, transform 0.25s, bottom 0.25s;
        `;
        document.body.appendChild(toast);
        window._toastStack.push(toast);
        requestAnimationFrame(function() {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(function() {
                toast.remove();
                const idx = window._toastStack.indexOf(toast);
                if (idx !== -1) window._toastStack.splice(idx, 1);
                window._toastReposition();
            }, 300);
        }, ms);
    };

    // 💡 [긴급 버그 수정] 저장 함수 내부에 여러 await 지점(mergeRemoteDistributions, fetch)이 있는데,
    //    그 사이에 "다른 프로젝트 시트로 전환"이 끼어들면 globalData/currentDriveFileId 등 전역 변수가
    //    통째로 바뀐 뒤, 이 저장이 (전환 전에 캡처해둔) 옛 fileId로 완료되면서 "전환된 새 프로젝트의
    //    데이터"를 "원래 프로젝트의 파일"에 덮어쓰는 심각한 사고가 날 수 있었음(fileId는 초반에,
    //    globalData 등 내용은 await 이후에 읽다 보니 서로 다른 시점의 상태가 섞임). 게다가 저장이 끝나며
    //    window.currentDriveFileId/lastSavedLogCount를 다시 덮어써서, 이미 전환된 새 시트의 상태까지
    //    같이 오염시켰음. 저장·시트전환을 전부 하나의 대기열로 직렬화해서 절대 겹치지 않게 한다.
    window._saveQueue = Promise.resolve();
    window._runSerialized = function(fn) {
        const next = window._saveQueue.then(fn, fn);
        window._saveQueue = next.catch(function() {}); // 큐가 끊기지 않도록(실패해도 다음 작업은 진행)
        return next;
    };

    // 💡 [2026-08-25 공용화] "지금 화면에 마지막 저장 이후 실제로 안 저장한 변경사항이 있는가"를 판단하는
    //    단일 기준 — closeSheet/switchToSheetWithSave/selectProject 세 곳에서 각자 똑같은 식을 복붙해
    //    쓰고 있던 걸 한 곳으로 모았다(따로 관리하면 한쪽만 고치고 잊어버리는 드리프트 위험이 있음).
    //    ⚠️ 이름이 비슷한 _hasUnsavedProjectData()와는 다른 개념이다 — 그쪽은 "화면에 저장할 내용이
    //    조금이라도 있는가"(완전히 빈 화면인지 판정용)이고, 이건 "마지막 저장 시점 대비 바뀐 게 있는가"다.
    window._hasUnsavedChangesNow = function() {
        const currentLogs = window.changeLogs ? window.changeLogs.length : 0;
        const savedLogs = window.lastSavedLogCount || 0;
        return currentLogs > savedLogs || !!window._nonGanttDirty || !!window._cpThemeDirty;
    };

    // 💡 [버그 수정] "프로젝트 열기"가 시트 전환 전에 현재 작업을 자동 저장하려다가, 빈/기본 시트에서도
    //    "필수 정보 입력" 검증부터 걸려서 프로젝트 목록 자체를 못 여는 문제가 있었음(아래 selectProject 참고).
    //    저장할 실제 내용이 있는지부터 판단하는 로직을 별도 함수로 빼서 저장 전에 미리 확인할 수 있게 한다.
    window._hasUnsavedProjectData = function() {
        const hasGanttData = globalData && globalData.length > 1;
        if (hasGanttData) return true;
        const td = window.collectTabData ? window.collectTabData() : (window.tabData || {});
        const pm = window.projectMeta || {};
        // 💡 [버그 수정] Brief SPEC / M.C Table은 화면에 "빈 입력 행"이 기본으로 깔려 있는데,
        //    _readRowsFromTbody()가 내용 유무와 무관하게 <tr>이 있으면 무조건 담기 때문에, 아무것도
        //    입력하지 않은 초기 화면에서도 mcTable.length === 1({category:""} 한 줄)이 되어 "저장할
        //    데이터가 있다"로 잘못 판정됐다(실측 확인). 그래서 프로젝트를 하나도 안 연 none 페이지에서
        //    "프로젝트 열기"·"저장"을 누르면 곧바로 필수항목 안내가 떴다.
        //    → 행의 "존재"가 아니라 실제로 채워진 "내용"이 하나라도 있는지로 판단한다.
        const _rowsHaveContent = function(rows) {
            return !!(rows && rows.some(function(r) {
                return r && Object.keys(r).some(function(k) {
                    const v = r[k];
                    return v !== null && v !== undefined && String(v).trim() !== '';
                });
            }));
        };
        // 💡 [빈틈 보완] td.mcTable은 mcRevisions['R1']의 별칭일 뿐이라, R2~R5에서 작업했거나
        //    제품구분자(mcRevisionsByUnit)별로 작업한 내용은 여기에 안 잡혔다. 모든 리비전·모든
        //    제품구분자를 훑어서 하나라도 내용이 있으면 "저장할 데이터 있음"으로 본다.
        const _anyMcContent = function() {
            const buckets = [];
            if (td.mcRevisions) buckets.push(td.mcRevisions);
            const byUnit = td.mcRevisionsByUnit || {};
            Object.keys(byUnit).forEach(function(u) { if (byUnit[u]) buckets.push(byUnit[u]); });
            return buckets.some(function(revMap) {
                return Object.keys(revMap).some(function(rev) { return _rowsHaveContent(revMap[rev]); });
            });
        };
        return !!(
            _rowsHaveContent(td.briefSpec) ||
            _rowsHaveContent(td.mcTable) ||
            _anyMcContent() ||
            // 💡 [버그 수정] pm.memberLabels(담당자 "라벨" 텍스트 — 기본값이라도 항상 채워져 있음, 예:
            //    "프로젝트 담당자")가 객체라서 String(pm[k])가 "[object Object]"로 항상 참(truthy)이 되어,
            //    아무것도 입력한 적 없는 완전히 빈 화면(구글 드라이브 연동 직후, 또는 모든 시트를 닫은
            //    직후)에서도 "저장할 데이터가 있다"로 잘못 판정되고 있었다. 그 결과 "프로젝트 열기"·
            //    "저장" 버튼이 빈 화면인데도 매번 "새 프로젝트 등록" 취급을 하며 필수 항목(PROTO Start 등)을
            //    요구했다. 실제 사용자가 입력한 "문자열" 값만 데이터로 인정하도록 좁힌다.
            Object.keys(pm).some(function(k) { const v = pm[k]; return typeof v === 'string' && v.trim(); }) ||
            (td.summary && Object.keys(td.summary).some(function(k) {
                const v = td.summary[k];
                return k !== 'milestones' && v && String(v).trim();
            }))
        );
    };

    // 💡 opts.suppressAlert: 저장이 막힌 경우(필수정보 미입력/비밀번호 실패) 여기서 직접 alert을 띄우지 않고
    //    사유만 window._lastSaveBlockReason에 담아 돌려준다. "프로젝트 열기" 전 자동저장처럼, 호출한 쪽이
    //    자기 안내와 합쳐서 모달을 "한 번만" 띄우고 싶을 때 사용 (모달이 두 번 겹쳐 뜨던 문제 해결).
    window._saveToGoogleDriveRaw = async function(opts) {
        opts = opts || {};
        window._lastSaveBlockReason = '';
        // 💡 [성능 수정] "저장" 버튼엔 3분 자동저장과 달리 변경 여부 확인이 전혀 없어서, 아무것도 안
        //    바꾸고 그냥 다시 눌러도(예: 불안해서 여러 번 누르는 경우) 매번 백업 파일을 통째로 새로
        //    만들고 있었다 — 이 함수가 changeLogs/lastSavedLogCount를 갱신하기 "전"인 지금 시점의
        //    상태를 미리 캡처해서, 성공 후 실제로 바뀐 게 있었는지 판단하는 데 쓴다.
        const _preSaveHadChanges = ((window.changeLogs ? window.changeLogs.length : 0) > (window.lastSavedLogCount || 0)) || !!window._nonGanttDirty || !!window._cpThemeDirty;
        try {
            if (window.collectTabData) window.collectTabData();
            window._ensureRowUids(); // 🔀 이번에 저장될 모든 행이 고유 uid를 갖도록 보장(3-way 병합의 전제조건)

            // 💡 저장할 실제 내용이 없으면(빈 기본 시트) 필수 정보 검증까지 갈 필요도 없이 바로 종료 —
            //    예전엔 이 체크가 필수 정보 검증 "뒤"에 있어서, 빈 시트인데도 "필수 정보를 입력하세요"라는
            //    엉뚱한 알림부터 뜨는 문제가 있었다(순서를 앞으로 당김).
            if (!window._hasUnsavedProjectData()) { alert("저장할 데이터가 존재하지 않습니다."); return false; }

            // 💡 저장(=프로젝트 등록/파일 생성) 전에 Summary 탭의 필수 정보가 입력되어 있는지 검증한다.
            //    비어 있으면 "All_All_All" 같은 의미 없는 파일명으로 저장되므로 여기서 막는다.
            const requiredInfoError = window.validateRequiredProjectInfo ? window.validateRequiredProjectInfo() : '';
            if (requiredInfoError) {
                window._lastSaveBlockReason = requiredInfoError;
                if (!opts.suppressAlert) {
                    alert(requiredInfoError);
                    if (window.switchTab) window.switchTab('summary');
                }
                return false;
            }
            if (typeof updatePrintTitle === 'function') updatePrintTitle(); 
            const _svEn = window._currentLang === 'en';
            
            let dynamicFileName = (window.driveSaveFilenameStr || window.exportFilenameStr || "GanttChart_Project") + ".json";
            
            // 💡 [수정] 현재 불러와서 작업 중인 고유 파일 ID가 있다면 그것을 끝까지 유지하고, 없을 때만 이름으로 새로 검색합니다.
            if (!window.currentDriveFileId) {
                window.currentDriveFileId = await window.findSaveFile(dynamicFileName);
            }
            let fileId = window.currentDriveFileId;

            // 🔒 [새 프로젝트 생성 보호] 드라이브에 아직 없는(=fileId가 없는) 프로젝트를 처음 등록(파일 생성)
            //    하는 바로 이 순간에만 관리자 비밀번호를 확인한다. "➕ 새 프로젝트" 버튼을 거쳤든, 그냥 빈
            //    화면에서 곧바로 입력/드래그해서 저장했든 — 실제로 새 파일이 만들어지는 지점 하나만 지키면
            //    진입 경로에 상관없이 항상 막힌다(예전엔 버튼에만 걸려있어서 버튼을 안 거치면 그냥 통과됐음).
            if (!fileId) {
                if (!verifyAdminPassword(window._t('🔒 새 프로젝트를 등록하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to register a new project.\n(case-insensitive)'))) {
                    const _pwFail = window._t('❌ 비밀번호 인증 실패. 새 프로젝트 등록이 취소되었습니다.', '❌ Authentication failed. New project registration cancelled.');
                    window._lastSaveBlockReason = _pwFail;
                    if (!opts.suppressAlert) alert(_pwFail);
                    return false;
                }
            }

            // 📥 [Phase 2.5] 저장 직전, 내가 파일을 연 이후 도착한 배분 업무를 원격 원장에서 찾아 자동 병합
            //    💡 [2026-08-25 신규] 이 호출이 이미 "원격 파일이 마지막 확인 이후 바뀌었는지" 알아내므로,
            //    같은 정보로 "다른 사용자가 먼저 저장한 것 같은데 그래도 덮어쓸까?" 경고를 함께 띄운다
            //    (멀티유저 동시편집 최소 안전장치 — 배분 이력 외 나머지 내용은 병합되지 않고 덮어써지므로).
            if (fileId) {
                const _mergeResult = await window.mergeRemoteDistributions(fileId);
                if (_mergeResult && _mergeResult.hadBaseline && _mergeResult.remoteChanged && !opts.skipConflictCheck) {
                    // 🔀 [2026-08-27 신규] 통째로 막기 전에, 먼저 필드/셀 단위 3-way 병합을 시도한다.
                    //    base(_mergeBaselines — 마지막 저장 성공 시점 스냅샷)가 있어야 시도 가능하고,
                    //    없거나(이번 세션 첫 저장) 헤더 구조가 달라졌으면 병합을 포기하고 기존처럼
                    //    "그래도 저장/취소" 확인모달로 안전하게 폴백한다.
                    const _tokenObjEarly = gapi.client.getToken();
                    const _tokenEarly = (_tokenObjEarly ? _tokenObjEarly.access_token : null) || window.googleAccessToken;
                    const _merge3 = _tokenEarly ? await window._tryThreeWayMergeOnConflict(fileId, _tokenEarly) : { applied: false };
                    if (_merge3.applied) {
                        const _hasTrueConflict = _merge3.merge.cellConflicts.length || _merge3.merge.editVsDeleteConflicts.length;
                        if (_hasTrueConflict) {
                            // 진짜 충돌(같은 칸을 서로 다르게 고침/삭제-수정 충돌)은 놓치면 안 되므로 alert로 확실히 보여줌
                            alert(_merge3.summaryMsg + '\n\n(자세한 내용은 하단 [🕒 변경 이력 확인]에서 확인할 수 있습니다)');
                        } else {
                            window.showToast(_merge3.summaryMsg, 'info');
                        }
                    } else {
                        const _proceed = await window._showSaveConflictModal(dynamicFileName);
                        if (!_proceed) {
                            const _conflictMsg = window._t(
                                '⚠️ 다른 사용자가 마지막 확인 이후 이 프로젝트를 저장하여, 충돌을 피하기 위해 저장을 취소했습니다.\n(최신 내용을 받으려면 이 프로젝트를 다시 열어주세요)',
                                '⚠️ Save cancelled — another user saved this project since your last check.\n(Reopen the project to pick up the latest content.)'
                            );
                            window._lastSaveBlockReason = _conflictMsg;
                            if (!opts.suppressAlert) alert(_conflictMsg);
                            return false;
                        }
                    }
                }
            }

            // 🆕 [새 프로젝트 최초 등록] 드라이브에 아직 없던(=fileId가 없는) 프로젝트를 처음 등록하는 순간,
            //    Summary 탭 PROTO Start(계획) 날짜를 Gantt Chart 시작일 기준(anchor)으로 반영해 전체 일정을
            //    자동 계산하고, 그 결과를 "최초 계획"으로 저장한다. 이미 계획이 하나라도 있으면(=재등록/이후
            //    저장) 건드리지 않고 딱 1회, 최초 등록 시점에만 실행됨.
            if (!fileId && (!window._scheduleBaselines || window._scheduleBaselines.length === 0) && window._registerNewProjectInitialPlan) {
                window._registerNewProjectInitialPlan();
            }

            let serializedGlobalData = globalData.map(row => {
                let obj = { data: Array.from(row) };
                for (let key in row) { if (key.startsWith('_')) obj[key] = row[key]; }
                return obj;
            });

            let saveData = { globalData: serializedGlobalData, changeLogs: window.changeLogs, colIdx: colIdx, filterColumns: filterColumns, projectMeta: window.projectMeta || {}, tabData: window.collectTabData ? window.collectTabData() : (window.tabData || {}), distributions: window.projectDistributions || [], scheduleBaselines: window._scheduleBaselinesForSave ? window._scheduleBaselinesForSave() : (window._scheduleBaselines || []) };
            let boundary = 'foo_bar_baz';
            // 💡 [2026-08-29 신규] completed appProperty — "프로젝트 불러오기" 목록이 파일 내용을 통째로
            //    안 받고도(가벼운 메타데이터 조회만으로) 완료된 프로젝트를 구분 표시할 수 있게, pm과 같은
            //    방식으로 완료 여부도 같이 태운다. Drive appProperties 값은 문자열만 허용되므로 '1'/''로 기록.
            // 💡 [2026-08-30 신규] themeColor도 appProperties에 같이 태운다 — "프로젝트 열기/삭제/복원"
            // 목록이 파일 내용을 통째로 안 받아도(가벼운 메타데이터 조회만으로) 그 프로젝트의 저장된
            // 테마 색을 바로 알 수 있게 하기 위함(showDriveFileModal/showBackupFileModal에서 사용).
            let metadata = { name: dynamicFileName, mimeType: 'application/json', appProperties: { pm: (window.projectMeta || {}).프로젝트담당자 || '', completed: (window.projectMeta || {}).완료여부 === '완료' ? '1' : '', themeColor: (window.tabData || {}).themeColor || '' } };
            if (!fileId) { metadata.parents = [SHARED_FOLDER_ID]; }

            let multipartRequestBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData) + "\r\n--" + boundary + "--";

            // 💡 [이중 방어선 구축] 토큰 추출 실패를 원천 봉쇄합니다.
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            
            if (!token) {
                window.showToast(_svEn ? "🔒 Auth token lost. Please reconnect Google Drive." : "🔒 구글 인증 토큰을 확보하지 못했습니다. 연동 버튼을 다시 클릭해 주세요.", 'error');
                window._handleDriveDisconnected('save-no-token');
                return false;
            }

            // 💡 [성능 수정] fields=id,modifiedTime을 붙여서 저장 응답에 modifiedTime을 함께 받는다 —
            //    mergeRemoteDistributions()가 "마지막으로 내가 저장한 시점" 캐시로 쓰기 위함(별도 호출 불필요).
            let url = 'https://www.googleapis.com/upload/drive/v3/files' + (fileId ? '/' + fileId : '') + '?uploadType=multipart&supportsAllDrives=true&fields=id,modifiedTime';

            // 💡 [진단용 계측] "저장이 느리다"의 원인이 업로드 자체인지(=구글/네트워크), 아니면 그 앞단
            //    처리인지 바로 구분할 수 있게 업로드 구간과 전송 크기를 따로 잰다.
            const _tUp0 = performance.now();
            let response = await fetch(url, {
                method: fileId ? 'PATCH' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartRequestBody
            });
            const _upMs = Math.round(performance.now() - _tUp0);
            const _upKB = Math.round(multipartRequestBody.length / 1024);
            console.info(`[저장 계측] 업로드: ${_upMs}ms · 전송크기: ${_upKB}KB (${(_upKB / Math.max(_upMs,1) * 1000 / 1024).toFixed(1)}MB/s)`);
            if (_upMs > 3000) console.warn(`[저장 계측] ⚠️ 업로드에만 ${_upMs}ms — 전송크기(${_upKB}KB) 대비 느리면 구글/네트워크 지연입니다.`);

            let file = await response.json();
            window.currentDriveFileName = dynamicFileName;
            window.updateCurrentFileLabel();

            if (response.ok && file && file.id) {
                // 💡 [2026-08-25 신규] 방금 정상적으로 Drive에 저장됐으니, 이 프로젝트에 대해 남아있을 수
                //    있는 로컬 백업(연결 끊김 등으로 저장 못 했던 시점의 스냅샷)은 이제 낡은 것이므로 정리.
                //    저장 전 fileId(신규 프로젝트면 아직 null → 'new' 버킷)를 기준으로 지워야 정확히 맞는다.
                window._clearLocalBackup(fileId);
                window.currentDriveFileId = file.id;
                window.lastSavedLogCount = window.changeLogs.length;
                window._nonGanttDirty = false; // 💡 Summary 탭(주요자재 등) 편집도 저장됐으니 함께 리셋
                // 💡 [2026-08-30] 방금 저장된 테마 색을 "저장된 기준값"으로 갱신 — 팔레트에서 색을
                // 이리저리 바꿔보다가 결국 이 값으로 되돌아오면 dirty 취급하지 않기 위한 기준점.
                window._cpSavedThemeHex = (window.tabData && window.tabData.themeColor) || null;
                window._cpThemeDirty = false; // 방금 저장됐으니 테마 dirty도 같이 리셋
                // 💡 [버그 수정] 새 프로젝트를 처음 저장하면 currentDriveFileId/Name은 바로 갱신되는데,
                //    시트 탭 바가 읽는 window._sheets 배열의 해당 항목(fileId/fileName)은 안 바뀌었다 —
                //    그 배열은 "다른 시트로 전환할 때"(_commitActiveSheet)만 동기화돼서, 저장 직후엔 탭이
                //    여전히 "(새 프로젝트)"로 보이고 다른 시트로 갔다 와야만(그 전환 순간에) 파일명으로
                //    바뀌었다. 저장 성공 시점에 지금 활성 시트 항목을 직접 갱신하고 탭 바를 다시 그린다.
                const _activeSheet = window._sheets && window._activeSheetKey
                    ? window._sheets.find(function(s) { return s.key === window._activeSheetKey; })
                    : null;
                if (_activeSheet) {
                    _activeSheet.fileId = file.id;
                    _activeSheet.fileName = dynamicFileName;
                    if (window.renderSheetTabsBar) window.renderSheetTabsBar();
                }
                // 💡 [성능 수정] 방금 내가 저장한 시점을 캐시해둬서, 다음 저장 때 mergeRemoteDistributions가
                //    "그 사이 아무도 안 건드렸으면" 무거운 전체 다운로드를 건너뛸 수 있게 한다.
                if (file.modifiedTime) { window._distMergeModifiedTime = window._distMergeModifiedTime || {}; window._distMergeModifiedTime[file.id] = file.modifiedTime; }
                // 🔀 [2026-08-27 신규] 방금 저장한 내용을 다음 저장 때 3-way 병합의 base로 쓰도록 캡처.
                window._captureMergeBaseline(file.id);
                // 💡 [성능 수정] 실제로 바뀐 내용이 있었을 때(또는 방금 처음 만든 새 파일일 때, !fileId)만
                //    백업을 만든다 — 변경 없이 저장 버튼만 다시 누른 경우까지 전체 데이터를 통째로 한 번
                //    더 업로드할 필요는 없다. (Backups 폴더는 실수 복구용이라, 내용이 같은 백업이 계속
                //    쌓이는 건 용량/API 호출만 낭비하고 복구에는 도움이 안 됨)
                if (_preSaveHadChanges || !fileId) {
                    window.backupToDrive(saveData, dynamicFileName); // 💡 드라이브 Backups 폴더에 타임스탬프 백업 (1주 보관)
                } else {
                    console.info('[저장 계측] 변경사항 없음 — 백업 생략');
                }
                // 💡 [성능 수정] 백업과 동일한 이유 — 바뀐 게 없으면 담당자/주요자재 등 인덱스에 들어가는
                //    내용도 지난 저장 때와 같을 수밖에 없다. 변경 없이 재저장할 때마다 공용 인덱스 파일을
                //    통째로 내려받고 다시 올릴 필요는 없다.
                if (_preSaveHadChanges || !fileId) {
                    window.updateProjectIndexEntry(file.id, dynamicFileName); // 💡 메일 자동처리용 project_index.json 갱신 (fire-and-forget, 저장 완료 자체는 막지 않음)
                } else {
                    console.info('[저장 계측] 변경사항 없음 — project_index.json 갱신 생략');
                }
                window.showToast(window._currentLang === 'en'
                    ? `🎉 Saved as [${dynamicFileName}] in the shared team folder!`
                    : `🎉 팀 공용 폴더에 [${dynamicFileName}] 파일로 안전하게 저장되었습니다!`);
                return true;
            } else {
                console.error("구글 저장 실패 상세 정보:", file);
                let errorMsg = "공유 폴더의 '편집자' 권한이 없거나 업로드 중 오류가 발생했습니다.";
                
                const status = response.status || (file && file.error ? file.error.code : 0);
                if (status === 401) {
                    errorMsg = "🔒 구글 인증 세션이 만료되었습니다.\n\n상단의 [🔵 구글 드라이브 연동하기] 버튼을 다시 눌러 로그인을 완료한 후 저장해 주세요.";
                    const authBtn = document.getElementById('auth_button');
                    if (authBtn) {
                        authBtn.disabled = false;
                        authBtn.innerText = window._currentLang === 'en' ? "🔄 Reconnect required (click)" : "🔄 재연동 필요 (클릭)";
                        authBtn.style.borderColor = '#e67e22';
                        authBtn.style.color = '#e67e22';
                    }
                    // 💡 [2026-08-25 신규] 저장 시도 중 발견된 401도 "연결 끊김"으로 취급 — 상단 표시등/토스트/
                    //    (설정된 경우) 텔레그램 알림까지 한 번에 처리해서, 사람이 401을 눈치채기 전에 먼저 알려준다.
                    window._handleDriveDisconnected('save-401');
                } else if (status === 403) {
                    errorMsg = "🚫 공유 폴더 접근 권한이 거부되었습니다.\n\n공유 폴더('1ldb3Bc7dNNSKKgmNviw43aCgrvxQG9bS')에 본인 계정이 '편집자'로 등록되어 있는지 관리자에게 확인해 주세요.";
                } else if (file && file.error) {
                    errorMsg = `구글 드라이브 에러 (${status}): ${file.error.message}`;
                }
                
                alert(_svEn ? `❌ Save failed\n\n${errorMsg}` : `❌ 저장 실패\n\n${errorMsg}`);
            }
        } catch (err) {
            alert(_svEn ? "Google Drive system error: " + err.message : "구글 드라이브 전송 시스템 에러: " + err.message);
            return false;
        }
    }

    // 💡 공개 진입점 — 실제로는 항상 대기열을 거쳐서, 다른 저장/시트전환 작업과 절대 안 겹치게 함
    //    (3분 자동저장 타이머 등 기존 호출부는 전부 그대로 이 이름을 부르므로 별도 수정 불필요)
    window.saveToGoogleDrive = function(opts) {
        return window._runSerialized(function() { return window._saveToGoogleDriveRaw(opts); });
    };

    // 💡 Backups 폴더의 백업 목록 조회
    window.loadBackupList = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) { alert("🔒 구글 인증이 필요합니다. 상단의 연동 버튼을 눌러주세요."); return; }
            const folderId = await window.getOrCreateBackupFolder(token);
            let response = await gapi.client.drive.files.list({
                q: `mimeType='application/json' and trashed=false and '${folderId}' in parents`,
                fields: 'files(id, name, createdTime, appProperties)', orderBy: 'createdTime desc', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
            });
            let files = response.result.files;
            if (!files || files.length === 0) {
                window.showToast(window._currentLang === 'en' ? "No backup files found. Save once to create a backup." : "저장된 백업이 없습니다. 저장을 한 번 하면 백업이 생성됩니다.", 'error');
                return;
            }
            window.showBackupFileModal(files);
            window.showToast(window._currentLang === 'en' ? "🔄 Backup list loaded. Select a point to restore." : "🔄 백업 목록을 불러왔습니다. 복원할 시점을 선택해 주세요.");
        } catch (err) { alert("백업 목록 조회 실패: " + err.message); }
    };

    // 💡 백업 파일명(백업_<원본이름>_<YYYYMMDD>_<HHMM>.json)에서 원본 프로젝트 파일명을 복원
    window._backupOrigFileName = function(backupFileName) {
        return backupFileName.replace(/^백업_/, '').replace(/_\d{8}_\d{4}\.json$/i, '') + '.json';
    };

    // 💡 [버그 수정] 예전엔 Backups 폴더 안의 "모든 프로젝트" 백업이 한 줄로 뒤섞여서 나왔음 —
    //    원본 프로젝트 이름별로 그룹핑해서(프로젝트 열기 모달의 담당자 그룹핑과 동일한 패턴) 원하는
    //    프로젝트의 백업만 펼쳐서 찾을 수 있게 함.
    window.showBackupFileModal = function(files) {
        let listContainer = document.getElementById('drive-file-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        const groups = {};
        files.forEach(function(file) {
            const origName = window._backupOrigFileName(file.name);
            (groups[origName] = groups[origName] || []).push(file);
        });
        const groupNames = Object.keys(groups).sort(function(a, b) { return a.localeCompare(b, 'ko'); });

        groupNames.forEach(function(origName) {
            const groupFiles = groups[origName];
            const groupWrap = document.createElement('div');
            groupWrap.style.cssText = 'border:1px solid #eee; border-radius:8px; overflow:hidden;';

            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'padding:9px 14px; background:#f8f9fa; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:13px; color:#444; user-select:none; transition:background .15s;';
            headerRow.onmouseover = function() { headerRow.style.background = '#eef0f2'; };
            headerRow.onmouseout  = function() { headerRow.style.background = '#f8f9fa'; };
            const arrow = document.createElement('span');
            arrow.textContent = '▸';
            arrow.style.cssText = 'font-size:11px; transition:0.15s;';
            const label = document.createElement('span');
            label.textContent = `📄 ${origName} (${groupFiles.length})`;
            headerRow.appendChild(arrow);
            headerRow.appendChild(label);

            const body = document.createElement('div');
            body.style.cssText = 'display:none; flex-direction:column; gap:8px; padding:10px;';

            groupFiles.forEach(function(file) {
                let d = new Date(file.createdTime); let dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString();
                // 💡 [2026-08-30 신규] 백업 당시 저장돼 있던 테마 색으로 행 표시
                const rowC = window._driveRowThemeColors ? window._driveRowThemeColors(file) : { bg: '#e8f4fd', border: '#a5c8f0', hoverBg: '#cfe6fa', hoverBorder: '#7fb0dd', darkText: '#333' };
                let fileBtn = document.createElement('div');
                fileBtn.style.cssText = "padding: 9px 14px; border: 1px solid " + rowC.border + "; border-radius: 8px; cursor: pointer; transition: background .15s, border-color .15s; display: flex; justify-content: space-between; align-items: center; background: " + rowC.bg + ";";
                fileBtn.onmouseover = function() { this.style.background = rowC.hoverBg; this.style.borderColor = rowC.hoverBorder; };
                fileBtn.onmouseout = function() { this.style.background = rowC.bg; this.style.borderColor = rowC.border; };
                fileBtn.onclick = function() { window.executeRestoreBackup(file.id, file.name); };
                fileBtn.innerHTML = `<div style="font-weight: bold; color: #333; font-size: 14px;">🗄 ${file.name}</div><div style="font-size: 12px; color: #868e96;">${dateStr}</div>`;
                body.appendChild(fileBtn);
            });

            headerRow.onclick = function() {
                const collapsed = body.style.display === 'none';
                body.style.display = collapsed ? 'flex' : 'none';
                arrow.textContent = collapsed ? '▾' : '▸';
            };

            groupWrap.appendChild(headerRow);
            groupWrap.appendChild(body);
            listContainer.appendChild(groupWrap);
        });

        document.getElementById('drive-file-modal-overlay').style.display = 'flex';
    };

    window.executeRestoreBackup = async function(fileId, fileName) {
        window.closeDriveModal();
        if (!confirm(window._t(`[${fileName}] 백업으로 복원하시겠습니까?\n새 시트로 열리며, 확인 후 [저장]을 눌러야 드라이브에 반영됩니다.`, `Restore from backup [${fileName}]?\nOpens as a new sheet — press [Save] afterward to apply to Drive.`))) return;
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            let response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
            let saveData = response.result;
            if (saveData && saveData.globalData) {
                // 💡 [버그 수정] 예전엔 currentDriveFileId를 그대로 둔 채 지금 화면 위에 복원 데이터만
                //    덮어썼음 — "저장"을 누르면 그 순간 열려있던 "다른" 프로젝트의 Drive 파일에 이
                //    백업 내용이 통째로 덮어써질 위험이 있었다(AMUSNET 사고의 유력한 원인). 이제는:
                //    ① 항상 새 시트로 열어서 지금 보던 화면은 그대로 보존하고,
                //    ② 백업의 원본 파일명으로 "지금 살아있는" 파일을 찾아 있으면 그 파일로, 없으면
                //       (원본이 삭제된 경우 등) 새 파일로 저장되도록 currentDriveFileId를 정확히 맞춘다.
                const origName = window._backupOrigFileName(fileName);
                let existingFileId = null;
                try { existingFileId = token ? await window.findSaveFile(origName) : null; } catch (e) {}

                const sheetKey = 'restore_' + fileId;
                window._openAsNewSheet(sheetKey, existingFileId, origName);

                globalData = saveData.globalData.map(function(obj) {
                    let row = obj.data;
                    for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
                    return row;
                });
                window.changeLogs = saveData.changeLogs || [];
                window.lastSavedLogCount = 0; // 복원본은 아직 Drive에 저장 안 된 상태이므로 "변경사항 있음"으로 취급
                window._nonGanttDirty = true;
                colIdx = saveData.colIdx || colIdx;
                filterColumns = saveData.filterColumns || filterColumns;
                window.projectMeta = saveData.projectMeta || window.projectMeta || {};
                window.tabData = saveData.tabData || window.tabData || {};
                window.projectDistributions = saveData.distributions || [];
                window.mcNormalizeAfterLoad();
                if (window.populateTabData) window.populateTabData();
                window.currentDriveFileId = existingFileId; // 있으면 그 파일로 갱신 저장, 없으면(null) 저장 시 새 파일 생성
                window.currentDriveFileName = origName;
                window.updateCurrentFileLabel();
                window.recalculateSchedules();
                window.renderSheetTabsBar();
                window._compareTargetId = null;
                if (saveData.scheduleBaselines && saveData.scheduleBaselines.length) {
                    window._scheduleBaselines = saveData.scheduleBaselines;
                    if (typeof persistScheduleBaselines === 'function') persistScheduleBaselines();
                } else if (window.loadScheduleBaselines) {
                    window.loadScheduleBaselines();
                }

                const msg = existingFileId
                    ? window._t(`🎉 [${fileName}] 백업으로 복원되었습니다 (원본: ${origName}). 확인 후 [저장]을 누르면 그 프로젝트에 반영됩니다.`, `🎉 Restored from [${fileName}] (original: ${origName}). Press [Save] to apply to that project.`)
                    : window._t(`🎉 [${fileName}] 백업으로 복원되었습니다. 원본 "${origName}"이 지금 존재하지 않아 [저장] 시 새 파일로 생성됩니다.`, `🎉 Restored from [${fileName}]. Original "${origName}" no longer exists — [Save] will create a new file.`);
                window.showToast(msg);
            }
        } catch (err) { alert("백업 복원 실패: " + err.message); }
    };

    // ═══════════════════════════════════════════════════════════
    // 📑 [멀티 시트] 여러 프로젝트를 엑셀 워크북 시트처럼 한 탭에서 동시에 열어두기
    //    구조: 실제 편집/렌더링 로직(수천 곳)은 지금처럼 전역 변수(globalData/colIdx/...)를
    //    그대로 쓰고, "시트 전환"은 그 전역 변수 묶음을 통째로 저장했다가 다시 꽂아넣는 방식.
    //    → 기존 코드는 단 한 줄도 안 건드리고, 로드/전환 시점만 감싸서 다중 시트를 흉내냄.
    // ═══════════════════════════════════════════════════════════
    window._sheets = window._sheets || [];       // [{ key, fileId, fileName, snapshot }]
    window._activeSheetKey = window._activeSheetKey || null;

    // 현재 화면에 떠 있는 전역 상태를 통째로 캡처 (참조만 저장 — 시트 전환 중엔 해당 시트가 "비활성"이라 아무도 안 건드림)
    window._snapshotCurrentSheet = function() {
        return {
            globalData, colIdx, filterColumns, currentFilters, existingDevStages,
            projectMeta: window.projectMeta, tabData: window.tabData,
            projectDistributions: window.projectDistributions,
            changeLogs: window.changeLogs, lastSavedLogCount: window.lastSavedLogCount,
            currentDriveFileId: window.currentDriveFileId, currentDriveFileName: window.currentDriveFileName,
        };
    };

    // 스냅샷을 전역 변수에 다시 꽂아넣고 화면을 그 시점으로 되돌림 (executeLoadFile 성공 시 하던 일과 동일)
    window._restoreSheetSnapshot = function(snap) {
        globalData = snap.globalData; colIdx = snap.colIdx; filterColumns = snap.filterColumns;
        currentFilters = snap.currentFilters; existingDevStages = snap.existingDevStages;
        window.projectMeta = snap.projectMeta; window.tabData = snap.tabData;
        window.projectDistributions = snap.projectDistributions;
        window.changeLogs = snap.changeLogs; window.lastSavedLogCount = snap.lastSavedLogCount;
        window.currentDriveFileId = snap.currentDriveFileId; window.currentDriveFileName = snap.currentDriveFileName;
        // 💡 [버그 수정] 계획(Baseline)은 프로젝트별로 분리 저장되므로, 시트를 전환하면 그 시트(프로젝트) 것으로 다시 로드
        //    (예전엔 브라우저 전체에 계획 목록이 하나뿐이라, 시트를 바꿔도 같은 계획이 그대로 보였음)
        window._compareTargetId = null;
        if (window.loadScheduleBaselines) window.loadScheduleBaselines();

        window.mcNormalizeAfterLoad();
        if (window.populateTabData) window.populateTabData();
        window.updateCurrentFileLabel();
        window.recalculateSchedules();
        if (typeof renderTable === 'function') renderTable(globalData);
        window.renderSheetTabsBar();
        // 💡 [멀티시트] 알람 탭은 collectAlarmItems()가 매번 새로 훑는 캐시성 뷰라, 시트를 전환해도
        //    자동으로 안 다시 그려서 "이전 시트의 알람 목록이 그대로 남는" 버그가 있었음 — 지금 알람 탭이
        //    열려있으면(Alarm/Notice 어느 쪽이든) 새 시트 기준으로 즉시 다시 그림
        const tabAlarmEl = document.getElementById('tab-alarm');
        if (tabAlarmEl && tabAlarmEl.classList.contains('active')) {
            if (window._alarmView === 'notice' && window.renderNoticeTab) window.renderNoticeTab();
            else if (window.renderAlarmTab) window.renderAlarmTab();
        }
        // 💡 [멀티시트 버그 수정] Calendar/Weekly Report도 알람 탭처럼 매번 새로 훑어 그리는 캐시성 뷰라,
        //    시트를 전환해도 자동으로 안 다시 그려서 "이전 시트의 일정이 그대로 남는" 버그가 있었음
        //    (switchTab()이 탭 진입 시 하는 갱신과 동일 — 지금 그 탭이 열려있으면 새 시트 기준으로 즉시 다시 그림)
        const tabCalEl = document.getElementById('tab-calendar');
        if (tabCalEl && tabCalEl.classList.contains('active') && window.calRender) window.calRender();
        const tabWeeklyEl = document.getElementById('tab-weekly');
        if (tabWeeklyEl && tabWeeklyEl.classList.contains('active') && window.showWeeklyReport) window.showWeeklyReport();
    };

    // fileId 기준으로 이미 열려있는 시트 찾기
    window._findSheetByFileId = function(fileId) {
        return window._sheets.find(function(s) { return s.fileId === fileId; });
    };

    // 지금 활성 시트가 있으면 현재 화면 상태를 그 시트 슬롯에 저장(전환 전 항상 호출)
    window._commitActiveSheet = function() {
        if (!window._activeSheetKey) return;
        const cur = window._sheets.find(function(s) { return s.key === window._activeSheetKey; });
        if (cur) { cur.snapshot = window._snapshotCurrentSheet(); cur.fileName = window.currentDriveFileName || cur.fileName; }
    };

    // key로 시트 전환 (메모리 스냅샷만 — Drive 저장 없음. 배경 알람체크가 시트를 빠르게
    // 훑고 지나가려고 내부적으로 쓰는 저수준 함수라 여기서 저장까지 하면 안 됨)
    window.switchToSheet = function(key) {
        if (key === window._activeSheetKey) return;
        window._commitActiveSheet();
        const target = window._sheets.find(function(s) { return s.key === key; });
        if (!target) return;
        window._activeSheetKey = key;
        window._restoreSheetSnapshot(target.snapshot);
    };

    // 💡 [사용자 전환] 사람이 직접 다른 프로젝트 시트로 넘어갈 때 쓰는 진입점 — 지금 보던 시트에
    //    "저장 안 한 변경사항"이 있을 때만 Google Drive에 먼저 저장한 뒤 전환한다.
    //    💡 [속도 개선] 예전엔 매번 무조건 저장해서 전환이 느렸음 — 3분 자동저장/창닫기 경고와
    //    똑같은 기준(changeLogs.length가 마지막 저장 시점보다 늘었는지)으로 "진짜 변경됐을 때만" 저장
    // 💡 [긴급 버그 수정] 저장(_saveToGoogleDriveRaw)과 시트전환(switchToSheet)을 한 덩어리로 묶어서
    //    같은 대기열(_runSerialized)에 넣는다 — 이렇게 해야 "저장이 끝나고 전환하기 직전"에 다른
    //    저장(3분 자동저장 등)이 끼어들어 서로 다른 시점의 데이터가 뒤섞이는 사고를 막을 수 있음.
    //    (공개 saveToGoogleDrive()는 안 부르고 raw를 직접 호출 — 같은 대기열에 재진입하면 데드락 남)
    window.switchToSheetWithSave = function(key, silent) {
        return window._runSerialized(async function() {
            if (key === window._activeSheetKey) return;
            const _en = window._currentLang === 'en';
            // 💡 [버그 수정] "저장할 변경사항이 있는지"를 currentDriveFileId 존재 여부로도 같이 걸었었다.
            //    그런데 아직 한 번도 저장한 적 없는 "새 프로젝트"는 fileId가 없어서 이 조건이 항상 거짓이
            //    되어, 다른 시트로 전환할 때 저장 시도 자체를 건너뛰고 조용히 넘어갔다 — 새 프로젝트에
            //    쏟은 작업이 아무 경고도 없이 사라질 수 있는 유실 지점이었다(어제 버전부터 있던 문제,
            //    오늘 손댄 코드는 아니지만 마침 오늘 다룬 영역이라 같이 발견됨). fileId 유무와 무관하게
            //    실제로 바뀐 게 있으면 저장을 시도한다.
            const hasUnsavedChanges = window._hasUnsavedChangesNow();
            if (hasUnsavedChanges) {
                if (silent) {
                    // 💡 [2026-08-25] "전체 프로젝트 한 번에 열기" 같은 배치 흐름에서 호출될 때(silent=true)는
                    //    파일마다 모달이 뜨면 자동화가 끊기므로, 예전처럼 조용히 저장만 시도하고 진행한다.
                    const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                    if (!ok) {
                        const _why = window._lastSaveBlockReason || '';
                        if (!confirm((_why ? _why + '\n\n' : '') + (_en
                            ? 'Save failed. Move to another project anyway?\n(Current screen content is kept in memory)'
                            : '저장에 실패했습니다. 그래도 다른 프로젝트로 이동할까요?\n(지금 화면 내용은 메모리에 임시 보관됩니다)'))) return;
                    }
                } else {
                    // 💡 [2026-08-25 신규] 사람이 직접 탭을 클릭해 이동할 때는 무조건 조용히 저장하지 않고,
                    //    "저장하고 이동 / 저장 안 함 / 취소" 3지선다 모달로 직접 고르게 한다(closeSheet와 동일 패턴).
                    const cur = window._sheets.find(function(s) { return s.key === window._activeSheetKey; });
                    const choice = await window._showSaveChoiceModal(cur && cur.fileName, 'switch');
                    if (choice === 'cancel') return;
                    if (choice === 'save') {
                        if (window.showToast) window.showToast(_en ? '💾 Saving...' : '💾 변경사항 저장 중...', 'info');
                        const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                        if (!ok) {
                            const _why = window._lastSaveBlockReason || '';
                            if (!confirm((_why ? _why + '\n\n' : '') + (_en
                                ? 'Save failed. Move to another project anyway?\n(Current screen content is kept in memory)'
                                : '저장에 실패했습니다. 그래도 다른 프로젝트로 이동할까요?\n(지금 화면 내용은 메모리에 임시 보관됩니다)'))) return;
                        }
                    }
                    // choice === 'discard' → 저장 없이 그대로 이동
                }
            }
            window.switchToSheet(key);
        });
    };

    // 💡 [2026-08-25 신규 → 2026-08-25 범용화] 원래 시트 탭 "✕" 닫기 전용이었는데, "프로젝트 열기"·
    //    "Sheet 이동" 등 저장 여부를 물어야 하는 다른 곳에서도 그대로 재사용하도록 action 파라미터로
    //    문구만 갈아끼울 수 있게 일반화했다. 브라우저 기본 confirm()은 OK/Cancel 2개뿐이라
    //    "저장하고 진행 / 저장 안 하고 진행 / 취소" 3가지를 표현할 수 없어 직접 만듦.
    //    Promise로 감싸서 호출부에서 await로 선택 결과('save'|'discard'|'cancel')를 그대로 받는다.
    window._SAVE_CHOICE_LABELS = {
        close:  { ko: { title: '닫기 전에 변경사항을 저장할까요?', save: '저장하고 닫기' },
                  en: { title: 'Save changes before closing?',   save: 'Save & Close' } },
        switch: { ko: { title: '이동하기 전에 변경사항을 저장할까요?', save: '저장하고 이동' },
                  en: { title: 'Save changes before switching?',      save: 'Save & Switch' } },
        open:   { ko: { title: '프로젝트 목록을 열기 전에 변경사항을 저장할까요?', save: '저장하고 열기' },
                  en: { title: 'Save changes before opening the project list?',    save: 'Save & Open' } },
    };
    window._showSaveChoiceModal = function(fileName, action) {
        action = action || 'close';
        return new Promise(function(resolve) {
            const _en = window._currentLang === 'en';
            const labels = (window._SAVE_CHOICE_LABELS[action] || window._SAVE_CHOICE_LABELS.close)[_en ? 'en' : 'ko'];
            let modal = document.getElementById('sheet-close-choice-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'sheet-close-choice-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,0.35); align-items:center; justify-content:center;';
                document.body.appendChild(modal);
            }
            const label = fileName || (_en ? 'this project' : '이 프로젝트');
            modal.innerHTML = `
                <div onclick="event.stopPropagation()" style="background:#fff; border-radius:10px; width:min(420px, 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:22px 24px;">
                    <div style="font-size:15px; font-weight:bold; color:#333; margin-bottom:10px;">💾 ${labels.title}</div>
                    <div style="font-size:13px; color:#666; line-height:1.6; margin-bottom:18px; white-space:pre-wrap;">${_en
                        ? `You have unsaved changes in "${escapeHtml(label)}".`
                        : `"${escapeHtml(label)}"에 저장하지 않은 변경사항이 있습니다.`}</div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                        <button id="scc-cancel" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:8px 14px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer; transition:background .15s;">${_en ? 'Cancel' : '취소'}</button>
                        <button id="scc-discard" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="padding:8px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? "Don't Save" : '저장 안 함'}</button>
                        <button id="scc-save" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${labels.save}</button>
                    </div>
                </div>`;
            modal.style.display = 'flex';
            function done(v) { modal.style.display = 'none'; resolve(v); }
            document.getElementById('scc-cancel').onclick = function() { done('cancel'); };
            document.getElementById('scc-discard').onclick = function() { done('discard'); };
            document.getElementById('scc-save').onclick = function() { done('save'); };
            modal.onclick = function() { done('cancel'); }; // 배경(바깥) 클릭 = 취소
        });
    };

    // 💡 [2026-08-25 신규] 멀티유저 동시편집 최소 안전장치 — 저장이 그냥 파일을 통째로 덮어쓰는
    // 구조라(버전/락 없음), 내가 마지막으로 확인한 시점 이후 "다른 사람이 이미 저장"했으면 그냥 조용히
    // 덮어쓰지 않고 한 번 물어본다. _saveToGoogleDriveRaw가 mergeRemoteDistributions의 결과로 감지.
    window._showSaveConflictModal = function(fileName) {
        return new Promise(function(resolve) {
            const _en = window._currentLang === 'en';
            let modal = document.getElementById('save-conflict-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'save-conflict-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9600; background:rgba(0,0,0,0.4); align-items:center; justify-content:center;';
                document.body.appendChild(modal);
            }
            const label = fileName || (_en ? 'this project' : '이 프로젝트');
            modal.innerHTML = `
                <div onclick="event.stopPropagation()" style="background:#fff; border-radius:10px; width:min(460px, 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:22px 24px; border-top:5px solid #e67e22;">
                    <div style="font-size:15px; font-weight:bold; color:#b85c00; margin-bottom:10px;">⚠️ ${_en ? 'Someone else saved more recently' : '다른 사용자가 더 최근에 저장했습니다'}</div>
                    <div style="font-size:13px; color:#555; line-height:1.7; margin-bottom:18px; white-space:pre-wrap;">${_en
                        ? `Since you last opened/saved "${escapeHtml(label)}", another user has already saved changes to it.\n\nIf you continue, your save will overwrite their changes (only the task-distribution log is safely merged — everything else is not).`
                        : `"${escapeHtml(label)}"를(을) 마지막으로 열람/저장한 이후, 다른 사용자가 이미 이 프로젝트를 저장했습니다.\n\n지금 그대로 저장하면 그 사람의 변경사항을 덮어쓰게 됩니다(업무 배분 이력만 자동 병합되고, 나머지 내용은 병합되지 않습니다).`}</div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                        <button id="scf-cancel" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:8px 14px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer; transition:background .15s;">${_en ? 'Cancel (recommended)' : '취소 (권장)'}</button>
                        <button id="scf-overwrite" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save anyway (overwrite)' : '그래도 저장 (덮어쓰기)'}</button>
                    </div>
                </div>`;
            modal.style.display = 'flex';
            function done(v) { modal.style.display = 'none'; resolve(v); }
            document.getElementById('scf-cancel').onclick = function() { done(false); };
            document.getElementById('scf-overwrite').onclick = function() { done(true); };
            modal.onclick = function() { done(false); };
        });
    };

    // 💡 [2026-08-20 → 2026-08-25 재도입] 2026-08-20엔 "닫을지 확인" 창을 없애고 무조건 저장 후
    //    닫도록 바꿨었는데, 이번에 다시 "저장하고 닫기 / 저장 안 하고 닫기 / 취소" 3지선다 모달로 복원한다.
    //    이전 동작 대신, 저장 안 한 변경사항이 있을 때만 사람이 직접 고르게 한다.
    //    비활성 탭은 switchToSheetWithSave에서 전환 시점에 이미 저장됐어야 하므로 별도 확인 불필요.
    //    저장+닫기를 한 대기열(_runSerialized)로 묶어서 다른 저장 작업과 겹치는 사고를 막음
    //    (switchToSheetWithSave와 동일 패턴 — raw 저장 함수를 직접 호출, 공개 saveToGoogleDrive()는
    //    같은 대기열에 재진입하면 데드락 나므로 사용 안 함).
    window.closeSheet = function(key) {
        return window._runSerialized(async function() {
            const idx = window._sheets.findIndex(function(s) { return s.key === key; });
            if (idx === -1) return;
            const wasActive = (key === window._activeSheetKey);
            const _en = window._currentLang === 'en';

            if (wasActive) {
                // 💡 [버그 수정] switchToSheetWithSave와 동일한 문제 — currentDriveFileId 없는(=아직
                //    한 번도 저장 안 한) 새 프로젝트는 이 탭을 "✕"로 닫아도 저장 시도 없이 그대로 사라졌다.
                const hasUnsavedChanges = window._hasUnsavedChangesNow();
                if (hasUnsavedChanges) {
                    const sheetEntry = window._sheets[idx];
                    const choice = await window._showSaveChoiceModal(sheetEntry && sheetEntry.fileName, 'close');
                    if (choice === 'cancel') return;
                    if (choice === 'save') {
                        if (window.showToast) window.showToast(_en ? '💾 Saving before close...' : '💾 저장 후 닫는 중...', 'info');
                        const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                        if (!ok) {
                            const _why = window._lastSaveBlockReason || '';
                            if (!confirm((_why ? _why + '\n\n' : '') + (_en
                                ? 'Save failed. Close this tab anyway?\n(Unsaved changes will be lost)'
                                : '저장에 실패했습니다. 그래도 이 시트를 닫을까요?\n(저장하지 않은 변경사항은 사라집니다)'))) return;
                        }
                    }
                    // choice === 'discard' → 저장 없이 그대로 닫기 진행
                }
            }

            window._sheets.splice(idx, 1);
            if (wasActive) {
                if (window._sheets.length) {
                    const next = window._sheets[Math.min(idx, window._sheets.length - 1)];
                    window._activeSheetKey = null; // commit 스킵(닫은 시트는 방금 저장했으니 다시 커밋할 필요 없음)
                    window._activeSheetKey = next.key;
                    window._restoreSheetSnapshot(next.snapshot);
                } else {
                    window._activeSheetKey = null;
                    window._resetToBlankNoConfirm(true); // 💡 마지막 시트를 닫음 — 안내 모달 없이 빈 화면으로
                }
            } else {
                window.renderSheetTabsBar();
            }
        });
    };

    // 새 시트를 등록하고 그 시트로 전환 (프로젝트 로드/신규생성 시 호출)
    window._openAsNewSheet = function(key, fileId, fileName) {
        window._commitActiveSheet();
        window._sheets.push({ key, fileId, fileName, snapshot: null });
        window._activeSheetKey = key;
    };

    // 탭 바 렌더링
    window.renderSheetTabsBar = function() {
        const bar = document.getElementById('sheet-tabs-bar');
        if (!bar) return;
        const count = window._sheets.length;
        // 💡 [UI 수정] 예전엔 시트가 2개 이상일 때만(count > 1) 탭 바를 보여줘서, 프로젝트가 딱 하나만
        //    열려 있을 땐 지금 무슨 파일을 열어둔 건지 탭으로 확인할 방법이 없었다. 1개만 열려 있어도
        //    보이도록 기준을 낮춘다(count >= 1) — 0개(아직 아무 것도 안 연 초기 화면)일 때만 숨김.
        const showBar = count >= 1;
        document.body.classList.toggle('has-multi-sheet-bar', showBar); // 💡 간트 표 높이를 그만큼 줄이기 위한 훅
        if (!showBar) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';

        // 💡 [자동 크기조정] 7개까지는 기존 고정 크기(160px) 그대로. 8개부터는 시트탭 줄(bar)이
        //    실제 쓸 수 있는 폭(#app-main 폭, 사이드바 접힘 상태 반영)을 넘지 않도록 탭 폭을 균등 축소한다.
        //    스크롤바를 일부러 숨겨놔서(위 CSS 주석 참고) 넘치면 뒤 탭이 안 보이는지도 모르는 문제였음.
        //    70px 밑으로는 글자가 안 보일 정도로 뭉개지므로 그 아래론 줄이지 않고(그 다음부턴 가로 스크롤 허용).
        const DEFAULT_TAB_W = 160, MIN_TAB_W = 70, ADD_BTN_W = 28, GAP = 3;
        let tabW = DEFAULT_TAB_W;
        if (count > 7) {
            const available = bar.clientWidth || (bar.parentElement && bar.parentElement.clientWidth) || (DEFAULT_TAB_W * 7);
            const usable = available - ADD_BTN_W - GAP * (count + 1);
            tabW = Math.max(MIN_TAB_W, Math.min(DEFAULT_TAB_W, Math.floor(usable / count)));
        }
        const labelW = Math.max(30, tabW - 40); // 패딩+닫기버튼+gap 몫만큼 라벨 폭에서 뺌(기존 160/120 비율과 동일)

        // 💡 [2026-08-29 파스텔 통일 v3] 선택 안 된 탭=흰 배경, 선택된 탭=제목 상자와 동일한 배경색
        //    (.concept-header-box와 동일한 #e0f5f7/#a3d9e0/#00707d, 청록톤)으로 통일 + 두 상태 모두 호버 추가.
        // 🐛 [버그 수정] 예전엔 이 색들이 하드코딩 hex라 (a) 팔레트로 다른 테마를 골라도 안 바뀌고,
        // (b) onmouseover가 style을 직접 건드리는 순간 브라우저가 style 속성 전체를 rgb(...)로 재직렬화
        // 해버려서 CSS 쪽 [style*="#hex"] 오버라이드도 못 따라가 마우스를 올리면 도로 청록으로 보였다.
        // _cpRoleHex()를 직접 호출해 항상 "지금 테마"의 실제 색을 즉석에서 계산해 넣는다.
        const _cpHex = window._cpRoleHex || function(k) { return { bg: '#e0f5f7', hoverBg: '#a3d9e0', border: '#a3d9e0', hoverBorder: '#52a5af', darkText: '#00707d' }[k]; };
        const _cpHexFor = window._cpRoleHexFor || function(k) { return _cpHex(k); };
        // 💡 [2026-08-30 신규] "테마가 프로젝트마다 저장되니, 시트 탭 색만 보고도 그 프로젝트가 어떤
        // 테마인지 알아보고 싶다"는 요청 — 지금 활성화된(보고 있는) 시트의 테마가 아니라, 각 탭이
        // "자기 자신의" 저장된 테마(활성 시트는 실시간 tabData, 비활성 시트는 전환 시 떠둔 snapshot의
        // tabData)를 각자 따로 읽어서 그 색으로 그린다 — 전환 안 해도 탭 색만으로 구분 가능해짐.
        bar.innerHTML = window._sheets.map(function(s) {
            const active = s.key === window._activeSheetKey;
            const label = s.fileName || '(새 프로젝트)';
            const sheetOwnTabData = active ? window.tabData : (s.snapshot && s.snapshot.tabData);
            const sheetThemeHex = sheetOwnTabData ? sheetOwnTabData.themeColor : null; // 없으면 기본 청록
            const bg = active ? _cpHexFor('bg', sheetThemeHex) : '#fff';
            const border = _cpHexFor('hoverBg', sheetThemeHex);
            const hoverBg = active ? _cpHexFor('zebraB', sheetThemeHex) : _cpHexFor('bg', sheetThemeHex);
            const hoverBorder = _cpHexFor('hoverBorder', sheetThemeHex);
            return `<div onclick="window.switchToSheetWithSave('${s.key}')"
                title="${escapeHtml(label)}"
                onmouseover="this.style.background='${hoverBg}'; this.style.borderColor='${hoverBorder}';"
                onmouseout="this.style.background='${bg}'; this.style.borderColor='${border}';"
                style="display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:8px 8px 0 0; cursor:pointer; font-size:12px; white-space:nowrap; max-width:${tabW}px; transition:background .15s, border-color .15s;
                       background:${bg}; color:${_cpHexFor('darkText', sheetThemeHex)}; font-weight:${active ? 'bold' : 'normal'};
                       border:1px solid ${border}; border-bottom:1px solid ${bg}; margin-bottom:-1px;">
                <span style="overflow:hidden; text-overflow:ellipsis; max-width:${labelW}px;">📄 ${escapeHtml(label)}</span>
                <span onclick="event.stopPropagation(); window.closeSheet('${s.key}');"
                    onmouseover="event.stopPropagation(); this.style.background='${hoverBg}'; this.style.color='${_cpHexFor('darkText', sheetThemeHex)}';"
                    onmouseout="this.style.background='transparent'; this.style.color='${hoverBorder}';"
                    style="color:${hoverBorder}; background:transparent; border-radius:4px; padding:0 3px; font-size:13px; line-height:1.4; flex-shrink:0; transition:background .15s, color .15s;">✕</span>
            </div>`;
        }).join('') + `<div onclick="window.selectProject()" title="새 시트로 프로젝트 열기"
                onmouseover="this.style.background='${_cpHex('bg')}';"
                onmouseout="this.style.background='transparent';"
                style="display:flex; align-items:center; justify-content:center; width:28px; flex-shrink:0; padding:6px 4px; cursor:pointer; font-size:14px; color:${_cpHex('darkText')}; font-weight:bold; border-radius:6px; transition:background .15s;">+</div>`;
    };

    // 💡 [버그 수정 v2] 탭 폭 자동조정은 지금까지 시트가 새로 열리거나 닫힐 때, 그리고(직전 수정으로)
    //    window resize 이벤트가 발생할 때만 재계산됐음. 그런데 resize 이벤트는 "브라우저 창 자체의
    //    크기"가 바뀔 때만 발동하고, 사이드바 접기/펴기 같은 순수 CSS 레이아웃 변화(margin-left만 바뀜)는
    //    원래 resize를 발생시키지 않는다(toggleSidebar()가 예외적으로 수동 dispatch해줘서 그 경우만
    //    우연히 됐던 것 — 그 외 폭이 바뀌는 다른 모든 경우, 예를 들어 초기 레이아웃이 뒤늦게 자리잡는
    //    경우 등은 여전히 못 잡았음). → window resize 대신, 탭 바 자신의 "실제 렌더링 폭"을
    //    ResizeObserver로 직접 감시해서 원인과 무관하게 폭이 바뀌면 항상 재계산하도록 바꾼다.
    let _sheetTabsResizeTimer = null;
    window._lastSheetTabsBarWidth = null;
    window._scheduleSheetTabsResize = function() {
        if (!window._sheets || window._sheets.length <= 1) return;
        clearTimeout(_sheetTabsResizeTimer);
        _sheetTabsResizeTimer = setTimeout(function() { window.renderSheetTabsBar(); }, 150);
    };
    window.addEventListener('resize', window._scheduleSheetTabsResize); // 창 크기 변경 — 추가 안전망으로 계속 유지
    if (window.ResizeObserver) {
        const _sheetTabsBarEl = document.getElementById('sheet-tabs-bar');
        if (_sheetTabsBarEl) {
            new ResizeObserver(function(entries) {
                const w = Math.round(entries[0].contentRect.width);
                // 💡 폭이 실제로 안 바뀌었으면 무시 — renderSheetTabsBar() 자신이 내용을 다시 그리면서
                //    (높이 등) 아주 미세하게 박스가 흔들려 이 옵저버를 스스로 재호출하는 걸 막기 위함
                if (w === window._lastSheetTabsBarWidth) return;
                window._lastSheetTabsBarWidth = w;
                window._scheduleSheetTabsResize();
            }).observe(_sheetTabsBarEl);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🩺 [진단] "느린 게 정말 구글 드라이브 문제인가?"를 객관적으로 판별하는 도구.
    //    콘솔에서 diagnoseDriveSpeed() 실행 — 프로젝트를 하나 연 상태에서 호출.
    //    메타 조회(순수 왕복 지연) · 전체 다운로드 반복(속도제한 편차) · 비-구글 대조군(내 인터넷
    //    자체가 느린 건지 구글만 느린 건지)까지 함께 재서 자동으로 판정 문구를 찍어준다.
    window.diagnoseDriveSpeed = async function(rounds) {
        rounds = rounds || 3;
        const fileId = window.currentDriveFileId;
        if (!fileId) { console.log('%c⚠️ 먼저 프로젝트를 하나 열고 실행해주세요.', 'color:#e03131;font-weight:bold'); return; }
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { console.log('%c⚠️ 구글 드라이브 연동 후 실행해주세요.', 'color:#e03131;font-weight:bold'); return; }

        console.log('%c🩺 드라이브 속도 진단 시작 — 잠시만 기다려주세요...', 'color:#2c5f8a;font-weight:bold');

        let fname = '', sizeKB = null;
        try {
            const m = await gapi.client.drive.files.get({ fileId: fileId, fields: 'name,size', supportsAllDrives: true });
            fname = m.result.name || '';
            if (m.result.size) sizeKB = Math.round(Number(m.result.size) / 1024);
        } catch (e) {}

        // ① 메타 조회 = 거의 데이터 없는 요청 → 순수 왕복 지연
        const metaMs = [];
        for (let i = 0; i < rounds; i++) {
            const t = performance.now();
            try { await gapi.client.drive.files.get({ fileId: fileId, fields: 'id', supportsAllDrives: true }); metaMs.push(Math.round(performance.now() - t)); }
            catch (e) { metaMs.push('ERR ' + (e && e.status ? e.status : '')); }
        }

        // ② 파일 전체 다운로드 = 대역폭 + 속도제한 확인
        const contentRuns = [];
        let rateLimited = false;
        for (let i = 0; i < rounds; i++) {
            const t = performance.now();
            try {
                const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
                if (!r.ok) {
                    if (r.status === 429 || r.status === 403) rateLimited = true;
                    let why = '';
                    try { const j = await r.json(); why = (j && j.error && j.error.message) || ''; } catch (e2) {}
                    contentRuns.push({ ms: Math.round(performance.now() - t), kb: 0, err: 'HTTP ' + r.status + (why ? ' — ' + why : '') });
                    continue;
                }
                const txt = await r.text();
                const ms = Math.round(performance.now() - t);
                const kb = Math.round(txt.length / 1024);
                contentRuns.push({ ms: ms, kb: kb, kbps: Math.round(kb / Math.max(ms, 1) * 1000) });
            } catch (e) { contentRuns.push({ ms: Math.round(performance.now() - t), kb: 0, err: String(e && e.message) }); }
        }

        // ④ 대조군: 구글이 아닌 곳(이 페이지 자체)에서 비슷한 크기 받아보기
        const ctrlRuns = [];
        for (let i = 0; i < 2; i++) {
            const t = performance.now();
            try {
                const r = await fetch(location.pathname + '?nocache=' + Date.now(), { cache: 'no-store' });
                const txt = await r.text();
                const ms = Math.round(performance.now() - t);
                const kb = Math.round(txt.length / 1024);
                ctrlRuns.push({ ms: ms, kb: kb, kbps: Math.round(kb / Math.max(ms, 1) * 1000) });
            } catch (e) { ctrlRuns.push({ err: String(e && e.message) }); }
        }

        const okRuns = contentRuns.filter(function(r) { return !r.err; });
        const avg = function(a) { return a.length ? Math.round(a.reduce(function(s, v) { return s + v; }, 0) / a.length) : 0; };
        const driveKbps = avg(okRuns.map(function(r) { return r.kbps; }));
        const ctrlOk = ctrlRuns.filter(function(r) { return !r.err; });
        const ctrlKbps = avg(ctrlOk.map(function(r) { return r.kbps; }));
        const numericMeta = metaMs.filter(function(v) { return typeof v === 'number'; });
        const metaAvg = avg(numericMeta);
        const msList = okRuns.map(function(r) { return r.ms; });
        const spread = msList.length > 1 ? Math.max.apply(null, msList) - Math.min.apply(null, msList) : 0;

        console.log('%c━━━━━━━━━━ 🩺 드라이브 속도 진단 결과 ━━━━━━━━━━', 'color:#2c5f8a;font-weight:bold');
        console.log('대상 파일       : ' + fname + (sizeKB !== null ? ' (' + sizeKB + 'KB)' : ''));
        console.log('① 메타 조회     : ' + metaMs.join(' / ') + ' ms   ← 데이터 거의 없는 요청');
        console.log('② 전체 다운로드 : ' + contentRuns.map(function(r) { return r.err ? r.err : r.ms + 'ms(' + r.kb + 'KB, ' + r.kbps + 'KB/s)'; }).join(' / '));
        console.log('③ 반복 편차     : ' + spread + 'ms   ← 크면 속도제한 신호');
        console.log('④ 대조군(비구글): ' + ctrlRuns.map(function(r) { return r.err ? r.err : r.ms + 'ms(' + r.kb + 'KB, ' + r.kbps + 'KB/s)'; }).join(' / '));
        console.log('%c─────────────────── 판정 ───────────────────', 'color:#2c5f8a;font-weight:bold');

        const verdict = [];
        if (rateLimited) verdict.push('🚨 구글이 속도제한(HTTP 403/429)을 응답했습니다 → 구글 드라이브 문제 확정');
        if (metaAvg > 2000) verdict.push('🚨 데이터가 거의 없는 메타 요청조차 평균 ' + metaAvg + 'ms → 파일 크기와 무관한 구글/네트워크 응답 지연');
        if (spread > 5000) verdict.push('🚨 같은 파일인데 실행마다 ' + spread + 'ms나 차이 → 크기 문제가 아니라 구글 쪽 변동(속도제한 유력)');
        if (ctrlKbps > 0 && driveKbps > 0 && ctrlKbps > driveKbps * 5) verdict.push('🚨 내 인터넷은 ' + ctrlKbps + 'KB/s인데 드라이브만 ' + driveKbps + 'KB/s → 인터넷이 아니라 구글 드라이브가 느림');
        if (ctrlKbps > 0 && driveKbps > 0 && ctrlKbps < driveKbps * 1.5) verdict.push('ℹ️ 드라이브(' + driveKbps + 'KB/s)와 일반 다운로드(' + ctrlKbps + 'KB/s) 속도가 비슷 → 구글이 아니라 현재 네트워크 전반이 느림');
        if (sizeKB !== null && sizeKB > 1000) verdict.push('⚠️ 파일이 ' + sizeKB + 'KB로 큽니다 → 크기 자체도 지연에 기여(수정이력 누적 등 정리 필요)');
        if (!verdict.length) verdict.push('✅ 지금은 정상 범위입니다. 느릴 때 다시 실행해서 비교해주세요.');
        verdict.forEach(function(v) { console.log(v); });
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:#2c5f8a;font-weight:bold');

        return { file: fname, sizeKB: sizeKB, metaMs: metaMs, content: contentRuns, control: ctrlRuns, driveKbps: driveKbps, controlKbps: ctrlKbps, rateLimited: rateLimited };
    };


    // 💡 silent=true면 개별 "로드 완료" 토스트를 생략 — 담당자 이름 클릭으로 여러 프로젝트를 한 번에 열 때
    //    파일마다 토스트가 쌓이는 걸 막고, 호출한 쪽에서 요약 토스트 하나만 띄우도록 함
    window.executeLoadFile = async function(fileId, fileName, silent) {
        window.closeDriveModal();
        // 💡 [멀티시트] 이미 열려있는 프로젝트면 다시 안 받아오고 그 시트로 전환만
        // 💡 [버그 수정] 예전 조건은 `already.snapshot`이 있어야만 재다운로드를 건너뛰었다. 그런데 스냅샷은
        //    "그 시트에서 다른 시트로 넘어갈 때" 비로소 채워지므로, 지금 보고 있는(활성) 시트는 항상
        //    snapshot === null 이다. 그래서 같은 프로젝트를 한 번 더 열라고 하면 이 검사를 통과해버려
        //    똑같은 파일을 통째로 다시 받았다("전체 프로젝트 한 번에 열기"에서 모든 파일이 정확히 2번씩
        //    다운로드되던 원인 — 실측 로그로 확인). 이미 열려 있으면 어떤 상태든 다시 받지 않는다.
        const already = window._findSheetByFileId(fileId);
        if (already) {
            if (already.key === window._activeSheetKey) return;                 // 지금 보고 있는 바로 그 프로젝트
            if (already.snapshot) { await window.switchToSheetWithSave(already.key, silent); return; }
        }
        // 💡 [진단용 계측] "프로젝트가 늦게 열린다"는 신고가 반복돼서, 실제 Drive 파일 다운로드 자체가
        //    느린 건지(=구글 쪽 지연) 그 이후 화면 렌더링이 느린 건지 구분할 수 있게 시간을 잰다.
        const _tFetch0 = performance.now();
        try {
            let response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
            const _fetchMs = Math.round(performance.now() - _tFetch0);
            // 💡 fileId도 같이 남긴다 — 같은 이름의 파일이 드라이브에 중복 생성된 경우(서로 다른 id)와
            //    같은 파일을 두 번 받는 경우를 로그만 보고 구분할 수 있게.
            console.info(`[프로젝트 열기 계측] "${fileName}" (id:${String(fileId).slice(-6)}) Drive 다운로드: ${_fetchMs}ms`);
            if (_fetchMs > 3000) console.warn(`[프로젝트 열기 계측] ⚠️ Drive 다운로드가 ${_fetchMs}ms나 걸림 — 파일 크기 또는 구글 쪽 응답 지연 가능성`);
            const _tRender0 = performance.now();
            let saveData = response.result;
            if (saveData && saveData.globalData) {
                window._openAsNewSheet(fileId, fileId, fileName); // 💡 [멀티시트] 지금 보던 시트를 저장하고 새 시트로 등록
                globalData = saveData.globalData.map(obj => {
                    let row = obj.data;
                    for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
                    return row;
                });
                window.changeLogs = saveData.changeLogs || [];
                window.lastSavedLogCount = window.changeLogs.length;
                window._nonGanttDirty = false; // 💡 방금 로드한 프로젝트는 아직 아무것도 안 건드렸으니 깨끗한 상태로 시작
                colIdx = saveData.colIdx || colIdx;
                filterColumns = saveData.filterColumns || filterColumns;
                window.projectMeta = saveData.projectMeta || window.projectMeta || {};
                window.tabData = saveData.tabData || window.tabData || {};
                window.projectDistributions = saveData.distributions || []; // 📥 [Phase 2.5] 배분 원장 보관 (병합 기준점)
                window.mcNormalizeAfterLoad();
                if (window.populateTabData) window.populateTabData();
                window.currentDriveFileId = fileId;
                window.currentDriveFileName = fileName;
                window.updateCurrentFileLabel();
                window.recalculateSchedules();
                window.renderSheetTabsBar(); // 💡 [멀티시트]
                // 💡 [버그 수정] 계획(Baseline)은 프로젝트별로 분리 저장되므로, 프로젝트가 바뀌면 그 프로젝트 것으로 다시 로드
                window._compareTargetId = null;
                // 🆕 계획(Baseline)은 이제 드라이브 JSON에도 함께 저장됨 — 있으면 그걸 그대로 신뢰(팀 공용),
                //    없으면(예: 이 기능 이전에 저장된 옛 파일) 이 브라우저의 localStorage 기록으로 대체
                if (saveData.scheduleBaselines && saveData.scheduleBaselines.length) {
                    window._scheduleBaselines = saveData.scheduleBaselines;
                    if (typeof persistScheduleBaselines === 'function') persistScheduleBaselines();
                } else if (window.loadScheduleBaselines) {
                    window.loadScheduleBaselines();
                }
                // 💡 [성능] 방금 이 파일의 내용을 통째로 받아왔으므로, 우리 메모리 상태 == 그 시점 원격 상태다.
                //    그 시점의 modifiedTime(목록 조회 때 이미 받아둔 값)을 배분 병합 캐시 기준으로 심어두면,
                //    파일을 연 직후 첫 저장에서 불필요한 전체 재다운로드를 건너뛸 수 있다.
                //    (목록 조회 이후 누가 수정했다면 값이 달라 캐시 미스 → 정상적으로 다시 받아오므로 안전)
                const _seedMt = (window._driveListModifiedTimes || {})[fileId];
                if (_seedMt) { window._distMergeModifiedTime = window._distMergeModifiedTime || {}; window._distMergeModifiedTime[fileId] = _seedMt; }
                console.info(`[프로젝트 열기 계측] "${fileName}" 화면 렌더링: ${Math.round(performance.now() - _tRender0)}ms`);
                if (!silent) window.showToast(window._currentLang === 'en' ? `✅ Drive sync complete: ${fileName}` : `✅ 공용 드라이브 동기화 완료: ${fileName}`);
                // 💡 [2026-08-25 신규] 이 프로젝트에 대해 이 브라우저에 남은(=연결 끊김 등으로 저장 못 했던)
                //    로컬 백업이 있으면 복원 여부를 물어봄 — 방금 받아온 원격 내용이 이미 최신이면 자동 정리됨.
                if (window._checkLocalBackupOnOpen) window._checkLocalBackupOnOpen(fileId, window.changeLogs.length);
            }
        } catch (err) { alert("파일 로드 실패: " + err.message); }
    }

    window.showDriveFileModal = function(files, mode) {
        mode = mode || 'open'; // 'open' | 'delete'
        let listContainer = document.getElementById('drive-file-list');
        if(!listContainer) return;
        listContainer.innerHTML = '';
        const _dmEn = window._currentLang === 'en';
        const _dmTitle = document.getElementById('drive-modal-title');
        if (_dmTitle) _dmTitle.textContent = mode === 'delete'
            ? (_dmEn ? '🗑️ Delete Project' : '🗑️ 프로젝트 삭제')
            : (_dmEn ? '📂 Open Project' : '📂 프로젝트 불러오기');
        const _dmDesc = document.getElementById('drive-modal-desc');
        if (_dmDesc) _dmDesc.textContent = mode === 'delete'
            ? (_dmEn ? '⚠️ Select a project file to delete. This cannot be undone from within the app.' : '⚠️ 삭제할 프로젝트 파일을 선택해 주세요. 앱 안에서는 되돌릴 수 없습니다.')
            : (_dmEn ? 'Select a project file to open.' : '불러올 프로젝트 파일을 선택해 주세요.');

        // 💡 [성능] 목록 조회 응답에는 이미 modifiedTime이 들어있다(fields=files(id,name,modifiedTime,...)).
        //    이걸 기억해뒀다가 프로젝트를 열 때 배분 병합 캐시의 기준값으로 삼는다 — 안 그러면 파일을 연
        //    직후 첫 저장에서 캐시가 항상 비어 있어(저장할 때만 채워졌음) "메타 조회 + 전체 다운로드"로
        //    왕복이 오히려 한 번 더 늘었다. 하필 "프로젝트 열기"가 곧바로 저장을 한 번 하기 때문에,
        //    지금 느리다고 하신 바로 그 경로에서 매번 손해를 보고 있었다.
        window._driveListModifiedTimes = window._driveListModifiedTimes || {};
        files.forEach(function(f) { if (f && f.id && f.modifiedTime) window._driveListModifiedTimes[f.id] = f.modifiedTime; });

        // 담당자(appProperties.pm) 기준 그룹핑 — 없으면 "미지정"
        const UNASSIGNED = _dmEn ? 'Unassigned' : '미지정';
        const groups = {};
        files.forEach(file => {
            const pm = (file.appProperties && file.appProperties.pm) ? file.appProperties.pm.trim() : '';
            const key = pm || UNASSIGNED;
            if (!groups[key]) groups[key] = [];
            groups[key].push(file);
        });
        // 담당자 이름순 정렬, 미지정은 항상 맨 뒤
        const groupNames = Object.keys(groups).sort((a, b) => {
            if (a === UNASSIGNED) return 1;
            if (b === UNASSIGNED) return -1;
            return a.localeCompare(b, 'ko');
        });

        // 💡 [멀티시트] 담당자별 "한 번에 열기"와 동일한 방식으로, 목록 전체(모든 담당자)를 한 번에 여는 버튼.
        //    executeLoadFile(..., true)를 그대로 재사용 — 이미 열려있는 시트는 다시 안 받아오고 전환만 됨.
        if (files.length > 1 && mode === 'open') {
            const topActionsRow = document.createElement('div');
            topActionsRow.style.cssText = 'display:flex; gap:8px; align-items:stretch;';

            const allBar = document.createElement('div');
            allBar.style.cssText = 'flex:2 1 0; padding:8px 14px; border:1px solid #a5c8f0; border-radius:8px; cursor:pointer; text-align:center; font-size:12.5px; font-weight:bold; color:#1a4f7a; background:#e8f4fd; transition:background .15s, border-color .15s;';
            allBar.textContent = _dmEn ? `🗂️ Open all ${files.length} project(s) at once` : `🗂️ 전체 프로젝트 ${files.length}개 한 번에 열기`;
            allBar.onmouseover = function() { this.style.background = '#cfe6fa'; this.style.borderColor = '#7fb0dd'; };
            allBar.onmouseout  = function() { this.style.background = '#e8f4fd'; this.style.borderColor = '#a5c8f0'; };
            allBar.onclick = async function() {
                const msg = _dmEn ? `Open all ${files.length} project(s) as separate sheets?` : `전체 프로젝트 ${files.length}개를 모두 새 시트로 여시겠습니까?`;
                if (!confirm(msg)) return;
                window.closeDriveModal();
                // 💡 [성능] 같은 파일이 목록에 두 번 들어와도 두 번 받지 않도록 id 기준으로 중복 제거.
                //    프로젝트 하나를 여는 데 파일 전체를 통째로 받으므로(1개당 1~2초), 중복 한 번이 그대로 낭비가 된다.
                const _seen = {};
                const _uniqueFiles = files.filter(function(f) {
                    if (!f || !f.id || _seen[f.id]) return false;
                    _seen[f.id] = true; return true;
                });
                // 💡 담당자별 열기와 동일하게, 여러 개를 한 번에 열 때는 파일별 토스트를 생략(silent)하고 끝나면 요약 토스트만 표시
                for (const file of _uniqueFiles) {
                    await window.executeLoadFile(file.id, file.name, true);
                }
                if (window.showToast) window.showToast(_dmEn ? `✅ Opened all ${files.length} project(s)` : `✅ 전체 프로젝트 ${files.length}개 열기 완료`, 'info');
            };
            topActionsRow.appendChild(allBar);

            // 💡 목록에서 기존 프로젝트를 고르지 않고, 곧바로 "새 프로젝트 시작" 흐름으로 갈 수 있는 지름길.
            //    새 기능을 따로 만들지 않고 기존 startNewProject()(확인창 → 초기화 → 참조 엑셀 안내 팝업)를
            //    그대로 재사용한다 — 새 프로젝트 버튼과 동작이 100% 동일하게 유지됨.
            const newProjectBar = document.createElement('div');
            newProjectBar.style.cssText = 'flex:1 1 0; padding:8px 14px; border:1px solid #a8dab8; border-radius:8px; cursor:pointer; text-align:center; font-size:12.5px; font-weight:bold; color:#1f7a3d; background:#e6f6ea; transition:background .15s, border-color .15s;';
            newProjectBar.textContent = _dmEn ? '➕ New Project' : '➕ 새 프로젝트 등록';
            newProjectBar.onmouseover = function() { this.style.background = '#c9ecd3'; this.style.borderColor = '#7cc494'; };
            newProjectBar.onmouseout  = function() { this.style.background = '#e6f6ea'; this.style.borderColor = '#a8dab8'; };
            newProjectBar.onclick = function() {
                window.closeDriveModal();
                window.startNewProject();
            };
            topActionsRow.appendChild(newProjectBar);

            listContainer.appendChild(topActionsRow);
        }

        groupNames.forEach((pmName, gi) => {
            const groupFiles = groups[pmName];
            const groupWrap = document.createElement('div');
            groupWrap.style.cssText = 'border:1px solid #eee; border-radius:8px; overflow:hidden;';

            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'padding:9px 14px; background:#f8f9fa; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:13px; color:#444; user-select:none; transition:background .15s;';
            headerRow.onmouseover = function() { headerRow.style.background = '#eef0f2'; };
            headerRow.onmouseout  = function() { headerRow.style.background = '#f8f9fa'; };
            const arrow = document.createElement('span');
            arrow.textContent = '▸'; // 💡 기본은 접힌 상태 — 담당자 이름만 먼저 보이게
            arrow.style.cssText = 'font-size:11px; transition:0.15s;';
            headerRow.appendChild(arrow);
            const label = document.createElement('span');
            label.textContent = `${pmName} (${groupFiles.length})`;
            // 💡 [멀티시트] 담당자 이름을 클릭하면 그 담당자의 프로젝트를 전부 시트로 한 번에 열기 (삭제 모드에선 비활성)
            if (pmName !== UNASSIGNED && mode === 'open') {
                label.style.cssText = 'text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px;';
                label.title = _dmEn ? `Open all ${groupFiles.length} project(s) for ${pmName} at once` : `[${pmName}] 담당 프로젝트 ${groupFiles.length}개를 한 번에 엽니다`;
                label.onclick = async function(e) {
                    e.stopPropagation(); // 화살표(접기/펴기) 클릭과 안 겹치게
                    const msg = _dmEn ? `Open all ${groupFiles.length} project(s) for [${pmName}] as separate sheets?` : `[${pmName}] 담당 프로젝트 ${groupFiles.length}개를 전부 새 시트로 여시겠습니까?`;
                    if (!confirm(msg)) return;
                    window.closeDriveModal();
                    // 💡 여러 프로젝트를 한 번에 열 때는 파일별 개별 토스트를 생략(silent)하고, 끝나면 요약 토스트 하나만 표시
                    for (const file of groupFiles) {
                        await window.executeLoadFile(file.id, file.name, true);
                    }
                    if (window.showToast) window.showToast((_dmEn ? `✅ Opened ${groupFiles.length} project(s) for ` : `✅ [${pmName}] 프로젝트 ${groupFiles.length}개 열기 완료`) + (_dmEn ? pmName : ''), 'info');
                };
            }
            headerRow.appendChild(label);

            const body = document.createElement('div');
            body.style.cssText = 'display:none; flex-direction:column; gap:8px; padding:10px;'; // 💡 기본 접힘

            groupFiles.forEach(file => {
                let d = new Date(file.modifiedTime); let dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString();
                // 💡 [2026-08-29 신규] 완료된 프로젝트 구분 표시 — appProperties에 저장 시 같이 태운 값이라
                //    파일 내용을 안 받아도(목록 조회만으로) 바로 알 수 있다(위 saveToGoogleDrive 참고).
                const isCompleted = !!(file.appProperties && file.appProperties.completed === '1');
                const doneBadge = isCompleted ? ` <span style="font-size:10.5px; font-weight:bold; color:#2f9e44; background:#e7f6ec; border-radius:9px; padding:1px 8px; vertical-align:middle;">✅ ${_dmEn ? 'Done' : '완료'}</span>` : '';
                // 💡 [2026-08-30 신규] "이 파일 자신이 저장해둔" 테마 색으로 행을 표시 — 완료된 프로젝트는
                //    기존처럼 회색으로 흐리게(테마色보다 "끝난 것" 표시가 우선하도록 그대로 둠).
                const rowC = window._driveRowThemeColors ? window._driveRowThemeColors(file) : { bg: '#e8f4fd', border: '#a5c8f0', hoverBg: '#cfe6fa', hoverBorder: '#7fb0dd', darkText: '#333' };
                let fileBtn = document.createElement('div');
                if (mode === 'delete') {
                    const delBg = isCompleted ? '#fff' : rowC.bg, delBorder = isCompleted ? '#ced4da' : rowC.border;
                    fileBtn.style.cssText = "padding: 9px 14px; border: 1px solid " + delBorder + "; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: " + delBg + "; transition: background .15s, border-color .15s;";
                    const infoWrap = document.createElement('div');
                    // 💡 [정렬 수정] 예전엔 파일명/날짜가 각자 <div>라 세로로 쌓였음 — "파일 열기"처럼 같은 줄에
                    //    나란히(파일명 왼쪽, 날짜는 삭제 버튼 바로 왼쪽) 보이도록 이 wrap 자체를 flex row로 변경.
                    infoWrap.style.cssText = 'flex:1; min-width:0; display:flex; justify-content:space-between; align-items:center; gap:12px;';
                    infoWrap.innerHTML = `<div style="font-weight: bold; color: #333; font-size: 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ${escapeHtml(file.name)}${doneBadge}</div><div style="font-size: 12px; color: #868e96; flex-shrink:0;">${dateStr}</div>`;
                    const delBtn = document.createElement('button');
                    delBtn.textContent = _dmEn ? '🗑 Delete' : '🗑 삭제';
                    delBtn.style.cssText = 'flex-shrink:0; padding:6px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;';
                    delBtn.onmouseover = function() { this.style.background = '#f5c2bd'; this.style.borderColor = '#e08f87'; };
                    delBtn.onmouseout  = function() { this.style.background = '#fbe4e2'; this.style.borderColor = '#eeb0ac'; };
                    delBtn.onclick = function(e) { e.stopPropagation(); window._confirmDeleteProjectFile(file); };
                    fileBtn.appendChild(infoWrap);
                    fileBtn.appendChild(delBtn);
                } else {
                    // 💡 완료된 프로젝트는 회색 톤(글자색/배경)으로 흐리게 — 목록에서 계속 눈에 띄되
                    //    "이건 이미 끝난 것"이라는 게 한눈에 구분되도록. 클릭해서 여는 동작 자체는 그대로 유지.
                    const openBg = isCompleted ? '#f8f9fa' : rowC.bg, openBorder = isCompleted ? '#ced4da' : rowC.border;
                    const openHoverBg = isCompleted ? '#e9ecef' : rowC.hoverBg, openHoverBorder = isCompleted ? '#adb5bd' : rowC.hoverBorder;
                    fileBtn.style.cssText = "padding: 9px 14px; border: 1px solid " + openBorder + "; border-radius: 8px; cursor: pointer; transition: background .15s, border-color .15s; display: flex; justify-content: space-between; align-items: center; background: " + openBg + ";";
                    fileBtn.onmouseover = function() { this.style.background = openHoverBg; this.style.borderColor = openHoverBorder; };
                    fileBtn.onmouseout = function() { this.style.background = openBg; this.style.borderColor = openBorder; };
                    fileBtn.onclick = function() { window.executeLoadFile(file.id, file.name); };
                    fileBtn.innerHTML = `<div style="font-weight: bold; color: ${isCompleted ? '#868e96' : '#333'}; font-size: 14px;">📄 ${escapeHtml(file.name)}${doneBadge}</div><div style="font-size: 12px; color: #868e96;">${dateStr}</div>`;
                }
                body.appendChild(fileBtn);
            });

            headerRow.onclick = function() {
                const collapsed = body.style.display === 'none';
                body.style.display = collapsed ? 'flex' : 'none';
                arrow.textContent = collapsed ? '▾' : '▸';
            };

            groupWrap.appendChild(headerRow);
            groupWrap.appendChild(body);
            listContainer.appendChild(groupWrap);
        });

        document.getElementById('drive-file-modal-overlay').style.display = 'flex';
    }
    
    window.closeDriveModal = function() {
        document.getElementById('drive-file-modal-overlay').style.display = 'none';
    }

    // =========================================================
    // 🛠️ 날짜 및 일정(Gantt) 코어 로직
    // =========================================================
    window.KOR_HOLIDAYS = [
        "2024-01-01", "2024-02-09", "2024-02-12", "2024-03-01", "2024-04-10", "2024-05-05", "2024-05-06", "2024-05-15", "2024-06-06", "2024-08-15", "2024-09-16", "2024-09-17", "2024-09-18", "2024-10-03", "2024-10-09", "2024-12-25",
        "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30", "2025-03-01", "2025-03-03", "2025-05-05", "2025-05-06", "2025-06-06", "2025-08-15", "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-12-25",
        "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06", "2026-08-15", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-09", "2026-12-25",
        "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-03-03", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25",
        "2028-01-01", "2028-01-25", "2028-01-26", "2028-01-27", "2028-03-01", "2028-05-02", "2028-05-05", "2028-06-06", "2028-08-15", "2028-10-02", "2028-10-03", "2028-10-04", "2028-10-05", "2028-10-09", "2028-12-25",
        "2029-01-01", "2029-02-12", "2029-02-13", "2029-02-14", "2029-03-01", "2029-05-05", "2029-05-07", "2029-05-20", "2029-05-21", "2029-06-06", "2029-08-15", "2029-09-21", "2029-09-22", "2029-09-23", "2029-09-24", "2029-10-03", "2029-10-09", "2029-12-25",
        "2030-01-01", "2030-02-02", "2030-02-03", "2030-02-04", "2030-02-05", "2030-03-01", "2030-05-05", "2030-05-06", "2030-05-09", "2030-06-06", "2030-08-15", "2030-09-11", "2030-09-12", "2030-09-13", "2030-10-03", "2030-10-09", "2030-12-25",
        "2031-01-01", "2031-01-22", "2031-01-23", "2031-01-24", "2031-03-01", "2031-03-03", "2031-05-05", "2031-05-28", "2031-06-06", "2031-08-15", "2031-09-30", "2031-10-01", "2031-10-02", "2031-10-03", "2031-10-09", "2031-12-25",
        "2032-01-01", "2032-02-10", "2032-02-11", "2032-02-12", "2032-03-01", "2032-05-05", "2032-05-16", "2032-05-17", "2032-06-06", "2032-08-15", "2032-08-16", "2032-09-18", "2032-09-19", "2032-09-20", "2032-09-21", "2032-10-03", "2032-10-04", "2032-10-09", "2032-10-11", "2032-12-25",
        "2033-01-01", "2033-01-30", "2033-01-31", "2033-02-01", "2033-03-01", "2033-05-05", "2033-05-06", "2033-06-06", "2033-08-15", "2033-10-03", "2033-10-06", "2033-10-07", "2033-10-08", "2033-10-09", "2033-10-10", "2033-12-25",
        "2034-01-01", "2034-02-18", "2034-02-19", "2034-02-20", "2034-02-21", "2034-03-01", "2034-05-05", "2034-05-25", "2034-06-06", "2034-08-15", "2034-09-26", "2034-09-27", "2034-09-28", "2034-10-03", "2034-10-09", "2034-12-25",
        "2035-01-01", "2035-02-07", "2035-02-08", "2035-02-09", "2035-03-01", "2035-05-05", "2035-05-07", "2035-05-15", "2035-06-06", "2035-08-15", "2035-09-15", "2035-09-16", "2035-09-17", "2035-09-18", "2035-10-03", "2035-10-09", "2035-12-25"
    ];

    // 💡 기본 공휴일(KOR_HOLIDAYS) + 사용자가 등록한 추가 휴일을 합쳐서 판별
    window.getCustomHolidays = function() {
        try { return JSON.parse(localStorage.getItem('gantt_custom_holidays') || '[]'); }
        catch (e) { return []; }
    };
    window.isHoliday = function(dateStr) {
        if (window.KOR_HOLIDAYS.includes(dateStr)) return true;
        return window.getCustomHolidays().some(function(h) {
            const end = h.endDate || h.date;
            return dateStr >= h.date && dateStr <= end; // "YYYY-MM-DD" 문자열은 그대로 비교해도 날짜 순서와 일치함
        });
    };

    function addWorkingDays(startDateTs, daysToAdd) {
        let currentDate = new Date(startDateTs); currentDate.setHours(0,0,0,0);
        if (daysToAdd <= 0) return currentDate.getTime(); 
        let addedDays = 0;
        while (addedDays < daysToAdd) {
            currentDate.setDate(currentDate.getDate() + 1); let dayOfWeek = currentDate.getDay(); 
            let dateStr = currentDate.getFullYear() + "-" + String(currentDate.getMonth() + 1).padStart(2, '0') + "-" + String(currentDate.getDate()).padStart(2, '0');
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !window.isHoliday(dateStr)) { addedDays++; }
        }
        return currentDate.getTime();
    }

    function countWorkingDays(startTs, endTs) {
        if (!startTs || !endTs) return 0;
        let count = 0; let cur = new Date(startTs); cur.setHours(0,0,0,0); let end = new Date(endTs); end.setHours(0,0,0,0);
        if (cur > end) return 0;
        while (cur <= end) {
            let dayOfWeek = cur.getDay(); let dateStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0');
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !window.isHoliday(dateStr)) { count++; }
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    }

    // ─── 🗓️ 휴일 등록 모달 (KOR_HOLIDAYS 기본값 + 사용자 추가 휴일, JSON 파일로 내보내기/불러오기) ───
    const _hEsc = function(s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    window.saveCustomHolidays = function(list) {
        list.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
        localStorage.setItem('gantt_custom_holidays', JSON.stringify(list));
    };

    window._hDayDiff = function(d1, d2) { return Math.round((new Date(d2) - new Date(d1)) / 86400000); };

    window.renderCustomHolidayList = function() {
        const container = document.getElementById('holiday-list-container');
        const countLabel = document.getElementById('holiday-count-label');
        if (!container) return;
        const list = window.getCustomHolidays();
        if (countLabel) {
            const totalDays = list.reduce(function(sum, h) { return sum + window._hDayDiff(h.date, h.endDate || h.date) + 1; }, 0);
            countLabel.textContent = list.length + '건 (총 ' + totalDays + '일) 등록됨';
        }
        if (!list.length) {
            container.innerHTML = '<div style="text-align:center; color:#adb5bd; padding:20px 0; font-size:12px;">등록된 추가 휴일이 없습니다.</div>';
            return;
        }
        container.innerHTML = list.map(function(h, idx) {
            const rangeLabel = (h.endDate && h.endDate !== h.date) ? (h.date + ' ~ ' + h.endDate) : h.date;
            return '<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 4px; border-bottom:1px solid #f1f3f5; font-size:12px;">'
                + '<span><b style="color:#2c5f8a;">' + rangeLabel + '</b> &nbsp; ' + (h.name ? _hEsc(h.name) : '<span style="color:#adb5bd;">(사유 없음)</span>') + '</span>'
                + '<button onclick="window.removeCustomHoliday(' + idx + ')" onmouseover="this.style.background=\'#fbe4e2\';" onmouseout="this.style.background=\'none\';" style="border:none; background:none; color:#b1432f; cursor:pointer; font-size:13px; border-radius:4px; padding:2px 5px; transition:background .15s;">🗑️</button>'
                + '</div>';
        }).join('');
    };

    window.addCustomHoliday = async function() {
        const dateEl = document.getElementById('holiday-add-date');
        const endDateEl = document.getElementById('holiday-add-end-date');
        const nameEl = document.getElementById('holiday-add-name');
        const date = dateEl.value;
        let endDate = endDateEl.value;
        if (!date) { alert('시작일을 선택해주세요.'); return; }
        if (endDate && endDate < date) { alert('종료일이 시작일보다 빠릅니다.'); return; }
        if (!endDate) endDate = date;

        const list = window.getCustomHolidays();
        const dup = list.some(function(h) { return h.date === date && (h.endDate || h.date) === endDate; });
        if (dup) { alert('이미 등록된 기간입니다.'); return; }

        const entry = { date: date, name: (nameEl.value || '').trim() };
        if (endDate !== date) entry.endDate = endDate; // 하루짜리는 기존처럼 endDate 없이 저장 (호환성 유지)
        list.push(entry);
        window.saveCustomHolidays(list);
        dateEl.value = ''; endDateEl.value = ''; nameEl.value = '';
        window.renderCustomHolidayList();
        if (window.recalculateSchedules) window.recalculateSchedules(); // 💡 등록 즉시 일정에 반영

        // ✅ 팀 공용 드라이브 파일에도 반영
        if (window.isDriveConnected) {
            const ok = await window.saveHolidaysToDrive(list);
            if (!ok) alert('⚠️ 드라이브 저장에 실패했습니다. 다시 시도해주세요.');
        } else {
            alert('⚠️ 구글 드라이브 미연동 상태라 팀과 공유되지 않습니다.\n[파일 → 🔵 드라이브 연동하기] 후 다시 등록해주세요.');
        }
    };

    window.removeCustomHoliday = async function(idx) {
        const list = window.getCustomHolidays();
        list.splice(idx, 1);
        window.saveCustomHolidays(list);
        window.renderCustomHolidayList();
        if (window.recalculateSchedules) window.recalculateSchedules();

        if (window.isDriveConnected) {
            const ok = await window.saveHolidaysToDrive(list);
            if (!ok) alert('⚠️ 드라이브 저장에 실패했습니다. 다시 시도해주세요.');
        }
    };

    window.openHolidayManager = async function() {
        window.closeAllTopbarMenus();
        const _hEn = window._currentLang === 'en';
        let modal = document.getElementById('holiday-manager-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'holiday-manager-modal';
            modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:none; pointer-events:none; z-index:99999; align-items:center; justify-content:center;';
            modal.innerHTML =
                '<div id="holiday-modal-box" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:480px; max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 4px 24px rgba(0,0,0,0.25);">'
                + '<div id="holiday-drag-handle" style="padding:13px 18px; cursor:grab; background:#fff8e6; border-radius:10px 10px 0 0; border-bottom:1px solid #ffe08a; display:flex; justify-content:space-between; align-items:center;">'
                + '<span style="font-size:14px; font-weight:bold; color:#7a5210;">' + (_hEn ? '🗓️ Holiday Registration' : '🗓️ 휴일 등록 (추가 휴일)') + '</span>'
                + '<button onclick="document.getElementById(\'holiday-manager-modal\').style.display=\'none\'"'
                + ' style="background:#fff8e6; border:1px solid #ffe08a; border-radius:6px; color:#7a5210; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;"'
                + ' onmouseover="this.style.background=\'#ffe9b8\'; this.style.borderColor=\'#e6c070\';"'
                + ' onmouseout="this.style.background=\'#fff8e6\'; this.style.borderColor=\'#ffe08a\';"'
                + ' title="닫기">✕</button>'
                + '</div>'
                + '<div id="holiday-sync-notice" style="padding:12px 18px; font-size:11px; color:#888; line-height:1.5; border-bottom:1px solid #f1f3f5;">'
                + (_hEn ? 'Public holidays through 2035 are already built in. Register additional days off here — company founding day, temporary holidays, etc.' : '기본 공휴일은 2035년까지 이미 반영되어 있습니다. 여기서는 회사 창립일, 임시공휴일처럼 추가로 쉬는 날을 등록합니다.')
                + '</div>'
                + '<div style="padding:12px 18px; border-bottom:1px solid #f1f3f5;">'
                + '<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">'
                + '<input type="date" readonly onclick="window.showGenericCalendar(this)" id="holiday-add-date" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; cursor:pointer;">'
                + '<span style="color:#888; font-size:12px;">~</span>'
                + '<input type="date" readonly onclick="window.showGenericCalendar(this)" id="holiday-add-end-date" title="' + (_hEn ? 'End date for range (leave blank for single day)' : '기간으로 등록할 경우 종료일 (비워두면 하루만 등록)') + '" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; cursor:pointer;">'
                + '</div>'
                + '<div style="display:flex; gap:6px;">'
                + '<input type="text" id="holiday-add-name" placeholder="' + (_hEn ? 'Reason (e.g. Summer vacation)' : '사유 (예: 하계휴가)') + '" style="flex:1; min-width:0; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px;">'
                + '<button onclick="window.addCustomHoliday()" onmouseover="this.style.background=\'#cfe6fa\'; this.style.borderColor=\'#7fb0dd\';" onmouseout="this.style.background=\'#e8f4fd\'; this.style.borderColor=\'#a5c8f0\';" style="padding:6px 12px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ ' + (_hEn ? 'Add' : '추가') + '</button>'
                + '</div>'
                + '</div>'
                + '<div id="holiday-list-container" style="flex:1; overflow-y:auto; padding:8px 18px;"></div>'
                + '<div style="padding:12px 18px; border-top:1px solid #dee2e6; display:flex; gap:8px; justify-content:space-between; align-items:center;">'
                + '<button onclick="window.loadHolidaysFromDrive()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';" onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🔄 ' + (_hEn ? 'Refresh' : '새로고침') + '</button>'
                + '<span style="font-size:11px; color:#868e96;" id="holiday-count-label"></span>'
                + '</div>'
                + '</div>';
            document.body.appendChild(modal);
            window._makeDraggable('holiday-modal-box', 'holiday-drag-handle');
        }
        modal.style.display = 'flex';

        const notice = document.getElementById('holiday-sync-notice');
        if (window.isDriveConnected) {
            if (notice) notice.textContent = _hEn ? '🔄 Loading shared team holiday list...' : '🔄 팀 공용 휴일 목록을 불러오는 중...';
            await window.loadHolidaysFromDrive();
            if (notice) notice.textContent = _hEn ? '☁️ This is the shared team holiday list (Drive). Changes sync with the whole team.' : '☁️ 팀 공용(드라이브) 휴일 목록입니다. 등록/삭제하면 전체 팀과 공유됩니다.';
        } else if (notice) {
            notice.textContent = _hEn ? '⚠️ Google Drive not connected. Changes will not be shared with the team.' : '⚠️ 구글 드라이브 미연동 상태입니다. [파일 → 🔵 드라이브 연동하기]를 먼저 눌러주세요. 지금 등록해도 팀과 공유되지 않습니다.';
        }
        window.renderCustomHolidayList();
    };

    // 💡 두 날짜 사이의 "근무일 기준 부호 있는 이동량" — toTs가 fromTs보다 늦으면 양수, 빠르면 음수
    //    (계획 대비 시작/완료/소요 배지를 전부 같은 근무일 기준으로 맞추기 위한 함수)
    function workdayShift(fromTs, toTs) {
        if (!fromTs || !toTs || fromTs === toTs) return 0;
        const oneDayLater = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); d.setDate(d.getDate() + 1); return d.getTime(); };
        if (toTs > fromTs) return countWorkingDays(oneDayLater(fromTs), toTs);
        return -countWorkingDays(oneDayLater(toTs), fromTs);
    }

    // 🔑 관리자 비밀번호 — localStorage에 JSON으로 저장, "파일 > 비밀번호 변경" 메뉴에서 변경 가능
    //    저장된 값이 없으면 기존 기본값 'kortek'을 그대로 사용 (기존 사용자와 100% 호환)
    const ADMIN_PW_STORAGE_KEY = 'gantt_admin_pw';
    function getAdminPassword() {
        try {
            const saved = JSON.parse(localStorage.getItem(ADMIN_PW_STORAGE_KEY) || 'null');
            return (saved && saved.pw) ? saved.pw : 'kortek';
        } catch(e) { return 'kortek'; }
    }
    function setAdminPassword(newPw) {
        try { localStorage.setItem(ADMIN_PW_STORAGE_KEY, JSON.stringify({ pw: newPw, updatedAt: Date.now() })); return true; }
        catch(e) { return false; }
    }
    function verifyAdminPassword(promptMessage) {
        let pw = prompt(promptMessage);
        if (!pw) return false;
        const target = getAdminPassword().toLowerCase();
        let maxTry = 5;
        for (let i = 0; i < maxTry; i++) {
            if (pw.toLowerCase() === target) return true;
            let remain = maxTry - i - 1;
            if (remain === 0) break;
            pw = prompt(window._currentLang === 'en' ? `❌ Incorrect password. (case-insensitive)\nAttempts remaining: ${remain}\n\nEnter password again.` : `❌ 비밀번호가 틀렸습니다. (대/소문자 구분 없음)\n남은 시도: ${remain}회\n\n비밀번호를 다시 입력하세요.`);
            if (!pw) break;
        }
        return false;
    }
    window.changeAdminPassword = async function() {
        const oldPw = getAdminPassword();
        const _cpEn = window._currentLang === 'en';
        if (!verifyAdminPassword(_cpEn ? '🔑 Enter current admin password to change it.\n(case-insensitive)' : '🔑 비밀번호를 변경하려면 현재 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert(_cpEn ? '❌ Authentication failed. Change cancelled.' : '❌ 비밀번호 인증 실패. 변경이 취소되었습니다.');
            return;
        }
        let newPw = prompt(_cpEn ? '🔑 Enter new password.' : '🔑 새 비밀번호를 입력하세요.');
        if (!newPw || !newPw.trim()) return;
        const confirmPw = prompt(_cpEn ? '🔑 Enter new password again. (confirm)' : '🔑 새 비밀번호를 한 번 더 입력하세요. (확인)');
        if (newPw !== confirmPw) { alert(_cpEn ? '❌ Passwords do not match. Change cancelled.' : '❌ 입력한 두 비밀번호가 서로 다릅니다. 변경이 취소되었습니다.'); return; }
        newPw = newPw.trim();
        if (!setAdminPassword(newPw)) { alert(_cpEn ? '❌ Failed to save password.' : '❌ 비밀번호 저장에 실패했습니다.'); return; }
        window.showToast(_cpEn ? '✅ Password changed.' : '✅ 비밀번호가 변경되었습니다.');
        // Drive 연동 상태면 자동 재암호화 + 해시 동기화
        try {
            const tokenObj  = gapi.client.getToken();
            const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!driveToken) return; // Drive 미연동 — 종료

            const folderId  = await window.getOrCreateBackupFolder(driveToken);
            const encFileId = await window._findDriveFile(driveToken, folderId, 'telegram_secure.enc');

            if (encFileId) {
                // ① 구 비밀번호로 복호화
                const encText = await window._downloadDriveFile(driveToken, encFileId);
                const decRes  = await fetch('http://127.0.0.1:5000/telegram/decrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: oldPw, encrypted: encText })
                });
                const decData = await decRes.json();
                if (!decData.ok) throw new Error('복호화 실패: ' + decData.error);

                // ② 새 비밀번호로 재암호화
                const mData  = await (await fetch('http://127.0.0.1:5000/telegram/members')).json();
                const encRes = await fetch('http://127.0.0.1:5000/telegram/encrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        password: newPw,
                        config: { token: decData.token || '', default_chat_id: decData.default_chat_id || '', members: mData.members || [] }
                    })
                });
                const encData = await encRes.json();
                if (!encData.ok) throw new Error('재암호화 실패: ' + encData.error);

                // ③ telegram_secure.enc Drive 재업로드
                await window._uploadDriveFile(driveToken, folderId, encFileId, 'telegram_secure.enc', encData.encrypted);
            }

            // ④ mail_secure.enc 재암호화 및 재업로드
            const mailFileId = await window._findDriveFile(driveToken, folderId, 'mail_secure.enc');
            if (mailFileId) {
                const mailEncText = await window._downloadDriveFile(driveToken, mailFileId);
                const mailDecRes  = await fetch('http://127.0.0.1:5000/mail/decrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: oldPw, encrypted: mailEncText })
                });
                const mailDecData = await mailDecRes.json();
                if (mailDecData.ok) {
                    const mailReEncRes = await fetch('http://127.0.0.1:5000/mail/encrypt', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: newPw })
                    });
                    const mailReEncData = await mailReEncRes.json();
                    if (mailReEncData.ok) {
                        await window._uploadDriveFile(driveToken, folderId, mailFileId,
                            'mail_secure.enc', mailReEncData.encrypted);
                    }
                }
            }

            // ⑤ 새 비밀번호 해시 Drive 저장 (팀원 동기화용)
            const newHash    = await window._sha256hex(newPw);
            const hashFileId = await window._findDriveFile(driveToken, folderId, 'gantt_pw_sync.json');
            await window._uploadDriveFile(driveToken, folderId, hashFileId, 'gantt_pw_sync.json',
                JSON.stringify({ hash: newHash, updatedAt: new Date().toISOString() }));

            alert('☁️ SMTP + Telegram 전체 설정이 새 비밀번호로 자동 업데이트 완료!');
        } catch(e) {
            alert('⚠️ Drive 자동 업데이트 실패: ' + e.message + '\n수동으로 [Drive에 암호화 저장]을 눌러주세요.');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 📌 일정 계산 규칙 (MS Project 방식: Auto ↔ Manual 자동 전환)
    //
    //  · 시작일/완료일 셀이 "비어 있으면" → 자동계산(Auto) 대상.
    //    앞 형제가 끝난 다음날부터, 또는 부모 시작일부터 워터폴로 계산됨.
    //    → 다른 행이 추가/삭제/정렬되면 날짜가 같이 움직일 수 있음.
    //
    //  · 시작일/완료일 셀에 "날짜가 직접 입력되어 있으면" → 확정(Manual) 상태.
    //    이후 어떤 변경이 생겨도 이 날짜는 절대 자동으로 바뀌지 않음.
    //
    //  · 날짜를 지우면 → 다시 Auto로 전환되어 자동계산을 따라감.
    //  · 날짜를 입력하면 → 그 즉시 Manual로 고정됨.
    //
    //  즉 "날짜를 삭제하면 자동계산되고, 날짜가 채워져 있으면(고정되면)
    //  다른 행이 바뀌어도 자동계산되지 않는다."
    // ════════════════════════════════════════════════════════════
    window.recalculateSchedules = function() {
        if (globalData.length <= 1) return;

        setTimeout(() => {
            let curD0 = "", curT1 = "", curT2 = "", curT3 = "", curT4 = "";
            for (let i = 1; i < globalData.length; i++) {
                let row = globalData[i]; if (!row) continue;
                let text = "";
                if (row._level === 0) text = row._origDev; else if (row._level === 1) text = row._origT1; else if (row._level === 2) text = row._origT2; else if (row._level === 3) text = row._origT3; else if (row._level === 4) text = row._origT4;
                text = text || "";

                if (row._level === 0) { curD0 = text; curT1 = ""; curT2 = ""; curT3 = ""; curT4 = ""; }
                else if (row._level === 1) { curT1 = text; curT2 = ""; curT3 = ""; curT4 = ""; }
                else if (row._level === 2) { curT2 = text; curT3 = ""; curT4 = ""; }
                else if (row._level === 3) { curT3 = text; curT4 = ""; }
                else if (row._level === 4) { curT4 = text; }
                
                row._l0Group = curD0; // 💡 계획(Baseline) 키 충돌 방지용
                row._origDev = curD0; if (colIdx.devStage !== -1) row[colIdx.devStage] = curD0;
                row._origT1 = curT1; if (colIdx.taskType1 !== -1) row[colIdx.taskType1] = curT1;
                row._origT2 = curT2; if (colIdx.taskType2 !== -1) row[colIdx.taskType2] = curT2;
                row._origT3 = curT3; if (colIdx.taskType3 !== -1) row[colIdx.taskType3] = curT3;
                row._origT4 = curT4; if (colIdx.taskType4 !== -1) row[colIdx.taskType4] = curT4;
                if (colIdx.wbs !== -1 && colIdx.devStage === -1) row[colIdx.wbs] = curD0; // 💡 단일 WBS 열 모드: 0레벨 그룹명을 하위 행까지 다시 채워서 개발단계 필터가 최신 상태로 갱신되게 함
                if (colIdx.bogo !== -1) row[colIdx.bogo] = row._level; 
            }

            generateFilters(globalData);

            let validRows = globalData.slice(1);
            let tree = []; let stack = {}; let fileGlobalStartTs = null;

            for (let row of validRows) {
                let rawStart = colIdx.start !== -1 ? row[colIdx.start] : ""; let pDateStart = parseDateValue(rawStart); let parsedStartTs = pDateStart ? pDateStart.ts : null;
                let rawPlan = colIdx.plan !== -1 ? row[colIdx.plan] : ""; let pDatePlan = parseDateValue(rawPlan); let parsedPlanTs = pDatePlan ? pDatePlan.ts : null;
                let dur1 = colIdx.dur1 !== -1 ? getDurationDays(row[colIdx.dur1]) : null; let dur2 = colIdx.dur2 !== -1 ? getDurationDays(row[colIdx.dur2]) : null; let dur3 = colIdx.dur3 !== -1 ? getDurationDays(row[colIdx.dur3]) : null; let dur4 = colIdx.dur4 !== -1 ? getDurationDays(row[colIdx.dur4]) : null; let pDur = colIdx.period !== -1 ? getDurationDays(row[colIdx.period]) : null;
                let planStr = rawPlan !== null && rawPlan !== undefined ? rawPlan.toString().trim() : ""; let match = planStr.match(/^(\d+)(일|days)?$/i); 
                let finalDur = 0; let hasDuration = (dur1 !== null || dur2 !== null || dur3 !== null || dur4 !== null || pDur !== null || match);
                
                if (row._level === 1 && dur1 !== null) finalDur = dur1; else if (row._level === 2 && dur2 !== null) finalDur = dur2; else if (row._level === 3 && dur3 !== null) finalDur = dur3; else if (row._level === 4 && dur4 !== null) finalDur = dur4; else if (pDur !== null) finalDur = pDur; else if (match && parseInt(match[1], 10) < 10000) finalDur = parseInt(match[1], 10);
                
                row._finalDuration = finalDur;
                row._isExplicitZero = (finalDur === 0 && (dur1 === 0 || dur2 === 0 || dur3 === 0 || dur4 === 0 || pDur === 0 || (match && parseInt(match[1], 10) === 0)));

                if (row._level === 0 || row._startForced || !hasDuration) row._explicitStartTs = parsedStartTs; else row._explicitStartTs = null;
                if (row._level === 0 || row._planForced || !hasDuration) row._explicitPlanTs = parsedPlanTs; else row._explicitPlanTs = null;
                                
                if (row._explicitStartTs) {
                    if (fileGlobalStartTs === null || row._explicitStartTs < fileGlobalStartTs) {
                        fileGlobalStartTs = row._explicitStartTs;
                    }
                }

                let taskName = "";
                if (row._level === 0) taskName = row._origDev || ""; else if (row._level === 1) taskName = row._origT1 || ""; else if (row._level === 2) taskName = row._origT2 || ""; else if (row._level === 3) taskName = row._origT3 || ""; else if (row._level === 4) taskName = row._origT4 || "";
                
                let contentStr = colIdx.content !== -1 ? (row[colIdx.content] || "").toString() : "";
                row._isParallel = taskName.includes('*') || taskName.includes('＊') || contentStr.includes('*') || contentStr.includes('＊');

                let node = { row: row, level: row._level, isParallel: row._isParallel, explicitStartTs: row._explicitStartTs, explicitPlanTs: row._explicitPlanTs, duration: row._finalDuration, children: [], startTs: null, endTs: null };

                if (node.level === 0) { tree.push(node); stack[0] = node; stack[1] = null; stack[2] = null; stack[3] = null; stack[4] = null; } 
                else {
                    let parentLvl = node.level - 1; while (parentLvl >= 0 && !stack[parentLvl]) parentLvl--;
                    if (parentLvl >= 0 && stack[parentLvl]) stack[parentLvl].children.push(node); else tree.push(node); 
                    stack[node.level] = node; for (let l = node.level + 1; l <= 4; l++) stack[l] = null; 
                }
            }

            function markLastChild(node) {
                if (!node.children || node.children.length === 0) return;
                for (let i = 0; i < node.children.length; i++) { node.children[i].row._isLastChild = (i === node.children.length - 1); markLastChild(node.children[i]); }
            }
            for (let l0Node of tree) markLastChild(l0Node);

            function propagateZero(node) {
                if (node.children.length === 0) return !!node.row._isExplicitZero;
                let allZero = true; for (let i = 0; i < node.children.length; i++) { if (!propagateZero(node.children[i])) allZero = false; }
                node.row._isExplicitZero = allZero; return allZero;
            }
            for (let i = 0; i < tree.length; i++) propagateZero(tree[i]);

            function scheduleNode(node, inheritedStartTs) {
                if (node.explicitStartTs) node.startTs = node.explicitStartTs; else node.startTs = inheritedStartTs || new Date().setHours(0,0,0,0);
                if (node.children.length === 0) {
                    let dur = node.duration || 0;
                    if (node.explicitPlanTs && (node.level === 0 || dur === 0 || node.row._planForced)) {
                        node.endTs = node.explicitPlanTs; node.row._finalDuration = countWorkingDays(node.startTs, node.endTs);
                    } else if (dur > 0) {
                        node.endTs = addWorkingDays(node.startTs, dur - 1);
                    } else { node.endTs = node.startTs; }
                    return;
                }
                
                let currentWaterfallStart = node.startTs; 
                let maxChildEnd = node.startTs; 
                let groupStartTs = node.startTs; 
                let isFirstValid = true;

                for (let i = 0; i < node.children.length; i++) {
                    let child = node.children[i];
                    if (child.row._isExplicitZero) { scheduleNode(child, currentWaterfallStart); continue; }
                    
                    let intendedStart;
                    if (isFirstValid) intendedStart = node.startTs;
                    else if (child.isParallel) intendedStart = groupStartTs;
                    else intendedStart = currentWaterfallStart;
                    
                    scheduleNode(child, intendedStart);
                    
                    if (isFirstValid) {
                        groupStartTs = child.startTs;
                        isFirstValid = false;
                    } else if (!child.isParallel) {
                        groupStartTs = child.startTs;
                    }
                    
                    if (child.endTs > maxChildEnd) maxChildEnd = child.endTs;
                    currentWaterfallStart = addWorkingDays(maxChildEnd, 1);
                }
                node.endTs = maxChildEnd;
            }

            let currentL0Start = fileGlobalStartTs || new Date().setHours(0,0,0,0); 
            let maxL0End = currentL0Start; 
            let groupL0StartTs = currentL0Start; 
            let isFirstValidL0 = true;

            for (let i = 0; i < tree.length; i++) {
                let l0Node = tree[i];
                if (l0Node.row._isExplicitZero) { scheduleNode(l0Node, currentL0Start); continue; }
                
                let intendedStart;
                if (isFirstValidL0) intendedStart = currentL0Start;
                else if (l0Node.isParallel) intendedStart = groupL0StartTs;
                else intendedStart = currentL0Start;
                
                scheduleNode(l0Node, intendedStart);
                
                if (isFirstValidL0) {
                    groupL0StartTs = l0Node.startTs;
                    isFirstValidL0 = false;
                } else if (!l0Node.isParallel) {
                    groupL0StartTs = l0Node.startTs;
                }
                
                if (l0Node.endTs > maxL0End) maxL0End = l0Node.endTs;
                currentL0Start = addWorkingDays(maxL0End, 1);
            }

            let _newlyFrozenCount = 0;
            function applyDatesToRow(node) {
                node.row._calcStartTs = node.startTs;
                node.row._calcPlanTs = node.endTs;

                // 🔒 [일정 고정] 리프(자식 없는) 행이 날짜를 새로 계산받으면 그 즉시 셀에 값을 써넣고
                //     Forced로 전환해 굳힙니다. 이후 새 업무가 들어오거나 다른 행이 움직여도
                //     이 행은 재계산에서 제외되며, "선택 구간 재계산"으로 명시적으로 풀었을 때만 다시 계산됩니다.
                //     부모/중간 레벨(자식이 있는 행)은 자식의 변화를 계속 반영해야 하므로 굳히지 않습니다.
                if (node.children.length === 0 && !node.row._isExplicitZero && !node.row._scheduleModeManual) {
                    const wasFrozen = node.row._startForced || node.row._planForced;
                    if (!wasFrozen) {
                        if (colIdx.start !== -1 && node.startTs) node.row[colIdx.start] = formatTsToYMD(node.startTs);
                        if (colIdx.plan  !== -1 && node.endTs)   node.row[colIdx.plan]  = formatTsToYMD(node.endTs);
                        node.row._startForced = true;
                        node.row._planForced  = true;
                        _newlyFrozenCount++;
                    }
                }

                for (let child of node.children) applyDatesToRow(child);
            }
            for (let l0Node of tree) applyDatesToRow(l0Node);

            // 🔒 여러 건이 한 번에 새로 고정된 경우(최초 로드/대량 가져오기 등) 요약 로그 1건만 남김.
            //    새 업무 1건이 추가되며 조용히 고정되는 일상적인 경우는 로그를 남기지 않음(노이즈 방지).
            //    "선택 구간 재계산"이 자체적으로 상세 로그를 남기는 동안에는 window._suppressFreezeLog로 중복 억제.
            if (_newlyFrozenCount >= 2 && !window._suppressFreezeLog) {
                window.changeLogs.push({
                    time: new Date().toLocaleString('ko-KR'),
                    userName: window.currentUserName || '비로그인 (로컬)',
                    rowName: '-', colName: '일정 고정',
                    oldVal: '자동 계산 상태', newVal: `일정 자동 고정: ${_newlyFrozenCount}건`, reason: ''
                });
            }

            // 💡 축 범위(현재 일정 + 비교 계획 포함) 재계산 — window.recomputeGanttViewRange()로 분리됨
            window.recomputeGanttViewRange();

            renderTable(globalData); applyFilters();
            window.pushUndoSnapshot();
            
            window.showToast(window._currentLang === 'en' ? "✅ Schedule updated." : "✅ 일정이 업데이트 되었습니다.");

            if (typeof window.syncRowHighlight === 'function') {
                window.syncRowHighlight();
            }

            // 💡 [2026-08-24 버그 수정] Summary "개발 진척 현황" 타임라인은 예전엔 Summary 탭에 "들어올
            //    때"만 다시 그려져서, 이미 Summary 탭을 보고 있는 중에 다른 경로(메일 완전자동 배치,
            //    셀 편집, 선택 구간 재계산 등)로 일정이 바뀌면 화면이 갱신 안 된 채로 남아있었다 —
            //    Alarm/Calendar 탭이 시트 전환 시 이미 하던 "지금 보이는 탭이면 즉시 다시 그림" 패턴을
            //    여기(모든 일정 변경이 결국 거쳐가는 recalculateSchedules)에도 적용해 실시간으로 맞춘다.
            const tabSummaryEl = document.getElementById('tab-summary');
            if (tabSummaryEl && tabSummaryEl.classList.contains('active') && window.renderSummaryTimeline) {
                window.renderSummaryTimeline();
            }
        }, 10);
    };

// ─── 🔓 선택 구간 일정 재계산 (Ctrl/Shift로 선택한 행만 잠금 해제 후 다시 계산) ───
    window.recalcSelectedRange = function() {
        const sel = window._selectedRows;
        if (!sel || sel.size === 0) { alert('먼저 재계산할 행을 선택해주세요. (Ctrl/Shift로 여러 행 선택 가능)'); return; }
        const indices = Array.from(sel).sort(function(a,b){ return a-b; });

        // 💡 실행취소(Ctrl+Z)로 복구 가능해서 확인창 없이 바로 진행

        const reason = window.promptOptionalReason('선택 구간 일정 재계산');
        if (reason === null) return; // 취소

        // 재계산 전 스냅샷 (변경 여부 판정용)
        const before = {};
        indices.forEach(function(i) {
            const row = globalData[i]; if (!row) return;
            before[i] = {
                start: row._calcStartTs, plan: row._calcPlanTs,
                startStr: colIdx.start !== -1 ? (row[colIdx.start] || '') : '',
                planStr:  colIdx.plan  !== -1 ? (row[colIdx.plan]  || '') : ''
            };
        });

        // 선택 행만 잠금 해제 후 재계산
        indices.forEach(function(i) {
            const row = globalData[i]; if (!row) return;
            row._startForced = false; row._planForced = false;
            if (colIdx.start !== -1) row[colIdx.start] = "";
            if (colIdx.plan  !== -1) row[colIdx.plan]  = "";
        });

        // 이 액션 전체(재계산+정렬)를 하나의 Undo 단위로 묶기 위해, 중간 자동 스냅샷을 잠시 억제
        window._isRestoringUndo = true;
        window._suppressFreezeLog = true; // 아래에서 상세 로그를 남기므로 일괄 요약 로그는 생략
        window.recalculateSchedules();
        window._suppressFreezeLog = false;

        // 실제로 날짜가 바뀐 행만 로그
        let changedCount = 0;
        indices.forEach(function(i) {
            const row = globalData[i]; const b = before[i];
            if (!row || !b) return;
            if (b.start !== row._calcStartTs || b.plan !== row._calcPlanTs) {
                changedCount++;
                const oldTxt = `시작 ${b.startStr || (b.start ? formatTsToYMD(b.start) : '-')} · 완료 ${b.planStr || (b.plan ? formatTsToYMD(b.plan) : '-')}`;
                const newTxt = `시작 ${colIdx.start !== -1 ? (row[colIdx.start] || '-') : '-'} · 완료 ${colIdx.plan !== -1 ? (row[colIdx.plan] || '-') : '-'}`;
                window.changeLogs.push({
                    time: new Date().toLocaleString('ko-KR'),
                    userName: window.currentUserName || '비로그인 (로컬)',
                    rowName: i, colName: '일정 재계산',
                    oldVal: oldTxt, newVal: newTxt, reason: reason
                });
            }
        });

        // 🔀 영향받은 구간(최소~최대 선택 인덱스)만 시작일 기준으로 행 순서 정리 (구간 밖은 그대로 유지)
        const fromIdx = indices[0], toIdx = indices[indices.length - 1];
        window._sortSubRangeByStartDate(fromIdx, toIdx);
        window.recalculateSchedules();

        window._isRestoringUndo = false;
        window.pushUndoSnapshot(); // 재계산+정렬 전체를 하나의 Undo 단위로 기록

        window._selectedRows = new Set();
        if (typeof window.syncRowHighlight === 'function') window.syncRowHighlight();
        alert(changedCount > 0 ? `✅ ${changedCount}건의 일정이 재계산되고, 구간 내 행 순서도 정리되었습니다.\n(사유: ${reason})` : 'ℹ️ 선택한 구간의 일정에 변경이 없어 순서만 정리되었습니다.');
    };

    // =========================================================
    // ↩️↪️ Undo / Redo — recalculateSchedules() 종료 시점마다 자동 스냅샷
    // =========================================================
    window._undoStack = [];
    window._redoStack = [];
    window._isRestoringUndo = false;
    const UNDO_MAX = 50;

    function _snapshotState() {
        return {
            globalData: globalData.map(function(row, idx) {
                if (idx === 0 || !Array.isArray(row)) return { data: Array.from(row || []) };
                let o = { data: Array.from(row) };
                for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
                return o;
            }),
            colIdx: JSON.parse(JSON.stringify(colIdx))
        };
    }

    function _restoreState(snap) {
        globalData = snap.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        colIdx = JSON.parse(JSON.stringify(snap.colIdx));
    }

    window.pushUndoSnapshot = function() {
        if (window._isRestoringUndo) return;
        if (!globalData || globalData.length === 0) return;
        window._undoStack.push(_snapshotState());
        if (window._undoStack.length > UNDO_MAX) window._undoStack.shift();
        window._redoStack = []; // 새 작업이 생기면 redo 스택은 무효화
        window.updateUndoRedoButtons();
    };

    window.undoLastAction = function() {
        if (window._undoStack.length < 2) { alert('더 이상 실행 취소할 작업이 없습니다.'); return; }
        window._isRestoringUndo = true;
        const current = window._undoStack.pop();
        window._redoStack.push(current);
        const prev = window._undoStack[window._undoStack.length - 1];
        _restoreState(prev);
        window.recalculateSchedules();
        // 📌 recalculateSchedules() 내부가 setTimeout(10ms)으로 끝나므로, 그보다 늦게 풀어야
        //    복원된 상태가 "새 작업"으로 몰래 다시 스택에 쌓이는 걸 막을 수 있음 (여러 번 undo 안 되던 원인)
        setTimeout(function() {
            window._isRestoringUndo = false;
            window.updateUndoRedoButtons();
        }, 30);
    };

    window.redoLastAction = function() {
        if (window._redoStack.length === 0) { alert('다시 실행할 작업이 없습니다.'); return; }
        window._isRestoringUndo = true;
        const next = window._redoStack.pop();
        window._undoStack.push(next);
        _restoreState(next);
        window.recalculateSchedules();
        setTimeout(function() {
            window._isRestoringUndo = false;
            window.updateUndoRedoButtons();
        }, 30);
    };

    window.updateUndoRedoButtons = function() {
        const u = document.getElementById('undo-btn'); const r = document.getElementById('redo-btn');
        if (u) u.disabled = window._undoStack.length < 2;
        if (r) r.disabled = window._redoStack.length === 0;
    };

    // 단축키: Ctrl+Z(실행취소) / Ctrl+Y 또는 Ctrl+Shift+Z(다시실행)
    window.addEventListener('keydown', function(e) {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' ||
                         activeEl.isContentEditable || activeEl.getAttribute('contenteditable') === 'true');
        if (isInput) return; // 셀 편집 중에는 브라우저 기본 텍스트 undo에 맡김
        const ctrl = e.ctrlKey || e.metaKey;
        if (!ctrl) return;
        if (e.key === 'z' || e.key === 'Z') {
            if (e.shiftKey) { e.preventDefault(); window.redoLastAction(); }
            else { e.preventDefault(); window.undoLastAction(); }
        } else if (e.key === 'y' || e.key === 'Y') {
            e.preventDefault(); window.redoLastAction();
        }
    });

    // 💡 현재 조작 중인 행의 하이라이트를 추적·관리하는 헬퍼 함수 정의
    window.highlightRow = function(rowIndex) {
        window.clearRowHighlight();
        let tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
        if (tr) {
            tr.classList.add('highlighted-row');
        }
    };

    // 💡 [2026-08-24] WBS 두 번째 클릭 — 부모의 하위(자식) 행들만 옅게 하이라이트. 본인 행(highlighted-row)
    //    보다 확실히 연한 별도 클래스(highlighted-row-child)를 써서, "이건 하위라서 연하게 표시된 것"임을
    //    구분할 수 있게 한다. 하위 판정은 moveSelectedRows와 동일한 방식(플랫 배열에서 자기보다 level이
    //    더 깊은 연속 구간)을 재사용.
    window.highlightRowChildren = function(rowIndex) {
        document.querySelectorAll('tr.highlighted-row-child').forEach(tr => tr.classList.remove('highlighted-row-child'));
        const rows = globalData;
        if (!rows || !rows[rowIndex]) return;
        const lvOf = (r) => (r && typeof r._level === 'number') ? r._level : 4;
        const L = lvOf(rows[rowIndex]);
        for (let j = rowIndex + 1; j < rows.length; j++) {
            if (lvOf(rows[j]) <= L) break;
            const tr = document.querySelector(`tr[data-row-index="${j}"]`);
            if (tr) tr.classList.add('highlighted-row-child');
        }
    };

    window.clearRowHighlight = function() {
        document.querySelectorAll('tr.highlighted-row').forEach(tr => {
            tr.classList.remove('highlighted-row');
        });
        document.querySelectorAll('tr.highlighted-row-child').forEach(tr => tr.classList.remove('highlighted-row-child'));
        // 💡 하이라이트가 어디서든(외부클릭 닫기/행삭제 정리 등) 지워지면, WBS 클릭 사이클도 함께 리셋해서
        //    다음에 같은 행을 클릭했을 때 엉뚱한 단계(2/3)부터 이어지지 않고 항상 1단계(선택)부터 시작하게 함.
        window._rowClickCycle = { index: null, step: 0 };
    };

    window.syncRowHighlight = function() {
        let popup = document.getElementById('row-action-popup');
        if (popup && popup.style.display === 'block' && popup.dataset.rowIndex) {
            window.highlightRow(parseInt(popup.dataset.rowIndex, 10));
        } else {
            window.clearRowHighlight();
        }
    };

    // ─── 행 다중 선택 (No. 칸 Ctrl/Shift 클릭 + 테이블 전역 Ctrl/Shift 클릭) ───────────────────
    window._selectedRows = new Set();
    window._selAnchor = null;

    // 💡 어느 셀에서든 Ctrl/Shift+클릭하면 그 행이 선택되도록 위임(delegation) 처리.
    //    캡처 단계에서 가로채서, Ctrl/Shift가 눌리지 않은 "일반 클릭"은 절대 건드리지 않고 그대로 통과시킴.
    //    (달력 열기·상태변경·편집 진입 등 각 셀 고유 동작에 전혀 영향 없음)
    (function bindRowSelectDelegation() {
        const tbody = document.getElementById('table-body');
        if (!tbody || tbody._rowSelectDelegationBound) return;
        tbody._rowSelectDelegationBound = true;
        tbody.addEventListener('click', function(ev) {
            // 📌 알림 / 🔒 잠금 아이콘은 자체 Ctrl/Shift 선택 & 일괄 적용 로직을 갖고 있으므로,
            //    Ctrl/Shift 여부와 상관없이 이 위임 핸들러가 선택을 먼저 지우지 않도록 최상단에서 예외 처리
            const target = ev.target;
            // 💡 svg/path 등 아이콘 내부 요소를 클릭해도 감지되도록 closest로 조상까지 탐색
            const lockOrAlarmIcon = target.closest && target.closest('[onclick*="wrToggleAlarm"], [onclick*="wrToggleScheduleLock"]');
            if (lockOrAlarmIcon) return;

            // 💡 일반 클릭(Ctrl/Shift 없음)이고 다중 선택이 남아있는 상태면, 어느 열을 클릭하든
            //    선택을 해제만 하고 그 열 고유의 클릭 동작(편집 진입·달력 열기 등)은 그대로 진행되게 둠
            //    (preventDefault/stopPropagation을 걸지 않아서 원래 동작을 막지 않음)
            if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
                if (window._selectedRows && window._selectedRows.size > 0 && !ev.target.closest('.no-td') && !ev.target.closest('#row-action-popup')) {
                    window._selectedRows.clear();
                    window._selAnchor = null;
                    if (window.paintRowSelection) window.paintRowSelection();
                    const p = document.getElementById('row-action-popup');
                    if (p) p.style.display = 'none';
                    window.clearRowHighlight();
                }
                return; // 일반 클릭은 선택 해제만 하고 그대로 통과
            }
            // 💡 No열도 WBS 열과 동일하게 공용 위임 로직으로 Ctrl/Shift 다중 선택 처리 (전용 팝업 트리거는 제거됨)

            const tr = target.closest('tr[data-row-index]');
            if (!tr) return;
            const i = parseInt(tr.getAttribute('data-row-index'), 10);
            if (isNaN(i)) return;

            ev.preventDefault();
            ev.stopPropagation();
            if (window.getSelection) window.getSelection().removeAllRanges();

            if (!window._selectedRows) window._selectedRows = new Set();
            const sel = window._selectedRows;
            if (ev.shiftKey && window._selAnchor != null) {
                sel.clear();
                const a = Math.min(window._selAnchor, i), b = Math.max(window._selAnchor, i);
                for (let k = a; k <= b; k++) sel.add(k);
            } else {
                if (sel.has(i)) sel.delete(i); else sel.add(i);
                window._selAnchor = i;
            }
            if (window.paintRowSelection) window.paintRowSelection();
        }, true); // 캡처 단계 — 셀 자체의 onclick(달력·드롭다운 등)보다 먼저 실행되어야 충돌 없이 가로챌 수 있음
    })();

    window.paintRowSelection = function() {
        document.querySelectorAll('tr.multi-selected').forEach(tr => tr.classList.remove('multi-selected'));
        if (window._selectedRows) {
            window._selectedRows.forEach(i => {
                const tr = document.querySelector(`tr[data-row-index="${i}"]`);
                if (tr) tr.classList.add('multi-selected');
            });
        }
        if (window.updateStickyPositions) window.updateStickyPositions();   // 고정열 배경도 즉시 갱신
    };

    // 토글이 아니라 무조건 '열기'로 동작
    function forceOpenRowActions(td, i) {
        const p = document.getElementById('row-action-popup');
        if (p) p.dataset.rowIndex = '__force__';
        window.toggleRowActions(td, i);
    }

    // 행별 알림 필요 여부 토글 (추후 자동 메일 발송 트리거용 데이터만 저장 — 발송 로직은 별도)
    window.wrToggleAlarm = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        const row = globalData[rowIndex];
        if (!row) return;

        // Ctrl/Shift + 핀 클릭 → 즉시 토글하지 않고, 이 행을 다중선택 목록에 추가/제거만 함
        // (핀을 여러 개 Ctrl/Shift로 먼저 고른 뒤, 마지막에 아무 핀이나 '일반 클릭'하면 전체 일괄 토글됨)
        if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
            if (!window._selectedRows) window._selectedRows = new Set();
            const sel = window._selectedRows;
            if (ev.shiftKey && window._selAnchor != null) {
                sel.clear();
                const a = Math.min(window._selAnchor, rowIndex), b = Math.max(window._selAnchor, rowIndex);
                for (let k = a; k <= b; k++) sel.add(k);
            } else {
                if (sel.has(rowIndex)) sel.delete(rowIndex); else sel.add(rowIndex);
                window._selAnchor = rowIndex;
            }
            if (window.paintRowSelection) window.paintRowSelection();
            return;
        }

        // 이미 여러 행이 선택되어 있고, 그 중 한 행의 핀을 '일반 클릭'했다면 → 선택된 행 전체를 같은 상태로 일괄 토글
        const isBulk = window._selectedRows && window._selectedRows.size > 1 && window._selectedRows.has(rowIndex);

        if (isBulk) {
            const newState = !row._알림; // 클릭한 행 기준으로 전체를 동일하게 맞춤
            window._selectedRows.forEach(idx => {
                const r = globalData[idx];
                if (r) r._알림 = newState;
            });
            logChange(rowIndex, -1, '알림 설정', (newState ? '알림 일괄 켜짐' : '알림 일괄 꺼짐') + ` (${window._selectedRows.size}건)`);
        } else {
            row._알림 = !row._알림;
            logChange(rowIndex, -1, '알림 설정', row._알림 ? '알림 켜짐' : '알림 꺼짐');
        }

        renderTable(globalData);
        applyFilters();
        if (window.paintRowSelection) window.paintRowSelection(); // 토글 후에도 선택 하이라이트 유지
        // 알람 탭이 열려 있으면 즉시 갱신
        const alarmPanel = document.getElementById('tab-alarm');
        if (alarmPanel && alarmPanel.classList.contains('active')) {
            if (window.renderAlarmTab) window.renderAlarmTab();
        }
    };

    // 💡 [2026-08-30 신규] 핀셋(📌) 클릭/더블클릭 구분 — 한 번 클릭이면 기존처럼 알람 토글, 두 번
    // 빠르게 클릭(더블클릭)하면 토글하지 않고 알람 목록(Alarm/Notice 탭)의 이 업무 행으로 바로 이동한다.
    // wrToggleAlarm은 클릭 즉시 renderTable()로 표 전체를 다시 그려서 원래 <span> 자체가 사라지므로,
    // 클릭을 곧바로 실행하면 두 번째 클릭이 새로 그려진(다른) <span>에 떨어져 브라우저가 dblclick을
    // 아예 인식하지 못한다 — 그래서 클릭을 250ms 살짝 지연시켜, 그 사이 두 번째 클릭(dblclick)이 오면
    // 토글을 취소하고 이동만 실행하는 방식으로 처리한다(알람 탭 목록 행의 동일 패턴과 통일).
    window._wrPinClickTimer = null;
    window._wrPinClick = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        if (window._wrPinClickTimer) { clearTimeout(window._wrPinClickTimer); window._wrPinClickTimer = null; return; }
        window._wrPinClickTimer = setTimeout(function() {
            window._wrPinClickTimer = null;
            window.wrToggleAlarm(rowIndex, ev);
        }, 250);
    };
    window._wrPinDblClick = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        if (window._wrPinClickTimer) { clearTimeout(window._wrPinClickTimer); window._wrPinClickTimer = null; }
        if (window._jumpToAlarmRow) window._jumpToAlarmRow(rowIndex);
    };
    // 💡 Gantt 표의 핀셋(📌) 더블클릭 → Alarm/Notice 탭의 "알람" 뷰로 전환한 뒤, collectAlarmItems()가
    // 만드는 목록에서 이 업무(rowIdx로 매칭)를 찾아 그 행으로 스크롤+반짝임 표시한다(알람이 꺼진 업무는
    // 애초에 그 목록에 없으므로 안내만 하고 종료).
    window._jumpToAlarmRow = async function(rowIndex) {
        const _en = window._currentLang === 'en';
        const row = typeof globalData !== 'undefined' && globalData ? globalData[rowIndex] : null;
        if (!row || !row._알림) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ This task has no alarm set.'
                : '⚠️ 이 업무는 알람이 설정되어 있지 않습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('alarm');
        if (window._switchAlarmView) window._switchAlarmView('alarm');
        if (window.renderAlarmTab) { try { await window.renderAlarmTab(); } catch (e) {} }
        const items = window.collectAlarmItems ? window.collectAlarmItems() : [];
        const idx = items.findIndex(function(it) { return it.rowIdx === rowIndex; });
        if (idx === -1) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find this task in the alarm list.'
                : '⚠️ 알람 목록에서 이 업무를 찾지 못했습니다.', 'warning');
            return;
        }
        setTimeout(function() {
            const tr = document.querySelectorAll('#alarm-table-body tr')[idx];
            if (tr && window._aiFlashRow) window._aiFlashRow(tr);
        }, 60);
    };

    // 행별 일정 모드(자동↔고정) 토글. Ctrl/Shift는 선택만, 일반 클릭은 토글(선택된 행 있으면 일괄 적용)
    window.wrToggleScheduleLock = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        const row = globalData[rowIndex];
        if (!row) return;

        if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
            if (!window._selectedRows) window._selectedRows = new Set();
            const sel = window._selectedRows;
            if (ev.shiftKey && window._selAnchor != null) {
                sel.clear();
                const a = Math.min(window._selAnchor, rowIndex), b = Math.max(window._selAnchor, rowIndex);
                for (let k = a; k <= b; k++) sel.add(k);
            } else {
                if (sel.has(rowIndex)) sel.delete(rowIndex); else sel.add(rowIndex);
                window._selAnchor = rowIndex;
            }
            if (window.paintRowSelection) window.paintRowSelection();
            return;
        }

        const isBulk = window._selectedRows && window._selectedRows.size > 1 && window._selectedRows.has(rowIndex);
        const wasLocked = !!(row._startForced && row._planForced);
        const toLocked = !wasLocked; // 클릭한 행 기준으로 반대 상태로 전환

        if (isBulk) {
            // 💡 다중 선택 일괄 적용은 명시적으로 선택한 행에만 적용 (하위 업무 자동 포함 X)
            window._applyScheduleLockToIndices(Array.from(window._selectedRows), toLocked, false);
            logChange(rowIndex, -1, '일정 모드', (toLocked ? '일괄 고정' : '일괄 자동') + ` (${window._selectedRows.size}건, 선택 행만)`);
        } else {
            window._applyScheduleLockToIndices([rowIndex], toLocked, true);
            logChange(rowIndex, -1, '일정 모드', toLocked ? '고정 (하위 포함)' : '자동 (하위 포함)');
        }

        window.recalculateSchedules();
    };

    // 💡 행 인덱스 배열에 고정/자동 상태를 일괄 적용 (하위 업무 포함) — 아이콘 일괄클릭/선택버튼 공용
    window._applyScheduleLockToIndices = function(indices, toLocked, withChildren) {
        if (withChildren === undefined) withChildren = true; // 기본값: 기존 동작(하위 포함) 유지
        function applyMode(r) {
            r._scheduleModeManual = true; // 사용자가 직접 토글한 행 — 자동재잠금 로직에서 제외
            if (toLocked) {
                if (colIdx.start !== -1 && r._calcStartTs) r[colIdx.start] = formatTsToYMD(r._calcStartTs);
                if (colIdx.plan  !== -1 && r._calcPlanTs)  r[colIdx.plan]  = formatTsToYMD(r._calcPlanTs);
                r._startForced = true; r._planForced = true;
            } else {
                if (colIdx.start !== -1) r[colIdx.start] = "";
                if (colIdx.plan  !== -1) r[colIdx.plan]  = "";
                r._startForced = false; r._planForced = false;
            }
        }
        function applyModeWithChildren(idx) {
            const r = globalData[idx];
            if (!r) return;
            applyMode(r);
            if (!withChildren) return; // 💡 다중 선택 일괄 적용 시엔 하위로 번지지 않도록 여기서 멈춤
            const parentLevel = r._level || 0;
            for (let j = idx + 1; j < globalData.length; j++) {
                const child = globalData[j];
                if (!child) continue;
                if ((child._level || 0) <= parentLevel) break;
                applyMode(child);
            }
        }
        indices.forEach(idx => applyModeWithChildren(idx));
    };

    // 🆕 "선택한 행만" 일괄 고정/자동 전환 — row-action-popup 자물쇠 버튼에서 호출
    window.applyScheduleLockToSelected = function(fallbackRowIndex) {
        const indices = (window._selectedRows && window._selectedRows.size >= 2)
            ? Array.from(window._selectedRows)
            : [fallbackRowIndex];
        const allLocked = indices.every(idx => {
            const r = globalData[idx];
            return !!(r && r._startForced && r._planForced);
        });
        const toLocked = !allLocked;
        window._applyScheduleLockToIndices(indices, toLocked);
        logChange(indices[0], -1, '일정 모드', (toLocked ? '선택 일괄 고정' : '선택 일괄 자동') + ` (${indices.length}건, 하위 포함)`);
        window.recalculateSchedules();
    };

    // 🔒 [2026-08-27 변경] 소요일 머릿글 자물쇠 클릭 — 이전엔 "현재 전체가 다 잠겨있으면 전체 해제,
    //    아니면 전체 잠금"으로 토글됐으나, 그래서 어쩌다 전체가 다 잠긴 상태에서 누르면 예상과 달리
    //    전체가 풀려버리는 문제가 있었음. 이제는 현재 상태와 무관하게 항상 "전체 잠금"만 수행함
    //    (전체 해제가 필요하면 개별 행 자물쇠 / Ctrl·Shift 다중 선택 후 일괄 전환 / "선택 구간 재계산" 이용).
    window.wrToggleAllScheduleLock = function() {
        if (!globalData || globalData.length <= 1) return;
        // 💡 레벨/리프 여부 상관없이 전체 행 대상 (일관성 우선 — 부모 행은 완료일엔 영향 없고 시작일에만 실질 영향 있음)
        const leafIndices = [];
        for (let idx = 1; idx < globalData.length; idx++) {
            const row = globalData[idx]; if (!row) continue;
            leafIndices.push(idx);
        }
        if (leafIndices.length === 0) return;

        leafIndices.forEach(idx => {
            const r = globalData[idx];
            r._scheduleModeManual = true; // 💡 사용자가 직접 토글한 행 — 자동재잠금 로직에서 제외
            if (colIdx.start !== -1 && r._calcStartTs) r[colIdx.start] = formatTsToYMD(r._calcStartTs);
            if (colIdx.plan  !== -1 && r._calcPlanTs)  r[colIdx.plan]  = formatTsToYMD(r._calcPlanTs);
            r._startForced = true; r._planForced = true;
        });

        logChange(0, -1, '일정 모드', `전체 고정 (${leafIndices.length}건)`);
        window.recalculateSchedules();
    };

    window.toggleTopbarMenu = function(popupId, btn) {
        document.querySelectorAll('.topbar-popup').forEach(p => { if (p.id !== popupId) p.style.display = 'none'; });
        const popup = document.getElementById(popupId);
        if (!popup) return;
        const willShow = popup.style.display !== 'block';
        popup.style.display = willShow ? 'block' : 'none';
        if (willShow) {
            const closeHandler = function(e) {
                if (!popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                    popup.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    };

    // ✅ 구글 로그인 완료 / 엑셀 파일 로드 시 열려있는 파일·업무 드롭다운을 자동으로 닫음
    window.closeAllTopbarMenus = function() {
        document.querySelectorAll('.topbar-popup').forEach(p => { p.style.display = 'none'; });
    };

    // ✅ [2026-08-24] 팝업 하나만 닫기 — 예전부터 "자동알람 설정"/"메일 자동배치 설정" 버튼 onclick에서
    //    이 함수를 호출하고 있었는데(closeTopbarMenu('settings-menu-popup')) 정작 정의가 없어서 매번
    //    콘솔에 조용히 에러만 찍히고 있었음(모달 자체는 첫 statement에서 이미 열려서 눈에는 안 띔).
    window.closeTopbarMenu = function(popupId) {
        const popup = document.getElementById(popupId);
        if (popup) popup.style.display = 'none';
    };

    // ✅ [2026-08-24] "프로젝트"/"설정" 드롭다운의 하위 메뉴 버튼을 누르면 드롭다운이 자동으로 닫히도록.
    //    ON/OFF 상태를 계속 바꿔가며 눌러야 하는 토글 버튼(자동알람 ON, 메일 반자동)은 매번 닫히면
    //    다시 열어야 해서 불편하므로, data-keep-open="true"가 있는 버튼만 예외로 열어둠.
    document.querySelectorAll('.topbar-popup').forEach(function(popup) {
        popup.addEventListener('click', function(e) {
            const item = e.target.closest('.topbar-menu-item');
            if (!item || item.dataset.keepOpen === 'true') return;
            popup.style.display = 'none';
        });
    });

    // ═══════════════════════════════════════════════════════
    // 📐 계획(Baseline) 저장 및 비교 — "최초 수립 일정 대비 얼마나 바뀌었는지" 확인용
    //    ⚠️ 참고: localStorage에 전역으로 저장되어, 같은 브라우저에서 다른 프로젝트 파일을 열어도
    //    계획 목록이 공유됩니다. 여러 프로젝트를 구분해서 쓰실 경우 추후 파일별로 분리 가능합니다.
    //    ⚠️ 참고: 행 매칭은 "레벨+업무명 텍스트" 조합으로 하므로, 같은 레벨에 이름이 완전히 같은
    //    업무가 여러 개 있으면 첫 번째 것으로 뭉뚱그려 매칭될 수 있습니다.
    // ═══════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════
    // 📐 계획(Baseline) 저장 및 비교 — "최초 수립 일정 대비 얼마나 바뀌었는지" 확인용
    //    ⚠️ [버그 수정 완료] 예전엔 localStorage에 전역 고정 키로 저장돼서, 같은 브라우저에서 어떤 프로젝트를
    //    열든 계획 목록이 공유되는 문제가 있었음 — 지금은 프로젝트(드라이브 파일 ID)별로 키를 분리함.
    //    ⚠️ 참고: 행 매칭은 "0레벨 소속 그룹명 + 레벨 + 업무명" 조합으로 하므로, 같은 0레벨 그룹
    //    "안"에서 완전히 동일한 업무명이 반복되는 경우까지는 구분하지 못합니다.
    // ═══════════════════════════════════════════════════════
    // 💡 [버그 수정] 예전엔 이 키가 프로젝트 구분 없이 고정 문자열이라, 브라우저 하나에서 어떤 프로젝트를 열든
    //    전부 같은 계획(Baseline) 목록을 공유했음 — 멀티시트로 여러 프로젝트를 동시에 열면서 바로 드러남.
    //    프로젝트(드라이브 파일 ID)별로 키를 분리.
    //    💡 [추가 버그 수정] Drive에 아직 저장 안 한 새 프로젝트는 currentDriveFileId가 없어서 전부
    //    "local" 하나로 뭉쳐졌음 — 멀티시트로 새 프로젝트 여러 개를 동시에 열면 서로 계획이 섞임.
    //    이 경우 세션 한정으로나마 구분되도록 지금 열려있는 시트의 고유 key를 대신 사용.
    function _baselineStorageKey() {
        return 'gantt_schedule_baselines_' + (window.currentDriveFileId || ('session_' + (window._activeSheetKey || 'local')));
    }
    const CURRENT_BASELINE_ID = 'bl_current'; // 📌 "현재 일정" 고정 슬롯 id

    window._scheduleBaselines = [];
    window._compareTargetId = null; // 📐 비교할 계획 하나 — 항상 "현재 일정"과 대조됨

    function getBaselineById(id) {
        return window._scheduleBaselines.find(b => b.id === id);
    }
    function getBaselineRowDates(bl, row) {
        if (!bl || !row) return null;
        const val = bl.rows[getTaskKey(row)];
        if (val == null) return null;
        return (typeof val === 'object') ? { s: val.s || null, e: val.e || null } : { s: val, e: null };
    }

    // 📌 차트 축 범위(ganttViewStartTs/Duration) 재계산 — 현재 일정 + (비교 중이면) 비교 계획의
    //    시작/완료일을 모두 포함해 가장 이르고 가장 늦은 날짜로 넓힘. 일정 재계산 시뿐 아니라
    //    비교 계획을 선택/해제/삭제할 때도 호출해 축이 항상 최신 상태를 반영하게 함.
    window.recomputeGanttViewRange = function() {
        if (!globalData || globalData.length <= 1) return;
        let chartMinTs = null; let chartMaxTs = null;
        for (let i = 1; i < globalData.length; i++) {
            let rStart = globalData[i]._calcStartTs; let rEnd = globalData[i]._calcPlanTs;
            if (rStart && (chartMinTs === null || rStart < chartMinTs)) chartMinTs = rStart;
            if (rEnd && (chartMaxTs === null || rEnd > chartMaxTs)) chartMaxTs = rEnd;
        }
        if (window._compareTargetId && typeof getBaselineById === 'function') {
            const cmpBl = getBaselineById(window._compareTargetId);
            if (cmpBl && cmpBl.rows) {
                Object.keys(cmpBl.rows).forEach(function(k) {
                    const v = cmpBl.rows[k];
                    const s = (v && typeof v === 'object') ? v.s : v;
                    const e = (v && typeof v === 'object') ? v.e : null;
                    if (s && (chartMinTs === null || s < chartMinTs)) chartMinTs = s;
                    if (s && (chartMaxTs === null || s > chartMaxTs)) chartMaxTs = s;
                    if (e && (chartMaxTs === null || e > chartMaxTs)) chartMaxTs = e;
                    if (e && (chartMinTs === null || e < chartMinTs)) chartMinTs = e;
                });
            }
        }
        if (chartMinTs === null) chartMinTs = new Date().setHours(0,0,0,0);
        if (chartMaxTs === null) chartMaxTs = chartMinTs + (86400000 * 30);
        window.ganttViewStartTs = chartMinTs;
        window.ganttViewDuration = Math.max(chartMaxTs - chartMinTs, 86400000 * 7);
    };
    // 📌 "현재 일정" 고정 슬롯 — 계획 버튼 열 때마다 항상 최신 상태로 덮어씀
    window.autoSaveCurrentSnapshot = function() {
        if (!globalData || globalData.length <= 1) return;
        const rows = {};
        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i]; if (!row || !row._calcStartTs) continue;
            rows[getTaskKey(row)] = { s: row._calcStartTs, e: row._calcPlanTs || null };
        }
        const idx = window._scheduleBaselines.findIndex(b => b.id === CURRENT_BASELINE_ID);
        const snapshot = { id: CURRENT_BASELINE_ID, label: window._currentLang === 'en' ? 'Current Schedule' : '현재 일정', savedAt: Date.now(), rows: rows };
        if (idx === -1) window._scheduleBaselines.push(snapshot);
        else window._scheduleBaselines[idx] = snapshot;
        persistScheduleBaselines();
    };

    // 💡 [성능 수정] 드라이브 파일에 넣을 계획(Baseline) 목록만 골라냄.
    //    "현재 일정"(bl_current) 슬롯은 계획 메뉴를 열 때마다 지금 globalData에서 그대로 다시 만들어내는
    //    파생 데이터라(위 autoSaveCurrentSnapshot 참고), 드라이브에 같이 저장하면 이미 globalData에 들어있는
    //    전체 일정 날짜를 통째로 한 벌 더 복사해 넣는 셈이다. 실측(500행 기준) baseline 1개가 약 41KB로,
    //    저장 시 본저장+백업 2회 업로드 + 열 때 다운로드까지 매번 이 무게를 그대로 짊어졌다.
    //    → 파생 슬롯은 빼고, 사람이 실제로 저장한 계획(최초 킥오프 포함)만 팀 공용으로 남긴다.
    window._scheduleBaselinesForSave = function() {
        return (window._scheduleBaselines || []).filter(function(b) { return b && b.id !== CURRENT_BASELINE_ID; });
    };

    // 💡 [버그 수정] 예전엔 "이 프로젝트 전용 키가 비어있으면 옛 전역 계획을 물려받는다"는 마이그레이션이
    //    있었는데, 주석엔 "1회성"이라 적혀있었지만 실제로는 조건(!raw)에 걸릴 때마다 — 즉 계획을 아직 한
    //    번도 저장 안 한 "모든" 새 프로젝트를 열 때마다 — 매번 실행됐음. 그 결과 서로 전혀 무관한 여러
    //    프로젝트가 전부 똑같은 옛 계획을 자기 것인 양 보여주는 게 "이상하게 관리된다"고 느끼신 원인이었음.
    //    프로젝트 분리 전 데이터가 어느 프로젝트 것인지 지금은 알 방법이 없으므로, 더 이상 자동으로
    //    물려주지 않음 — 각 프로젝트는 스스로 계획을 저장하기 전까진 빈 목록에서 시작한다.
    window.loadScheduleBaselines = function() {
        try {
            const key = _baselineStorageKey();
            const raw = localStorage.getItem(key);
            window._scheduleBaselines = JSON.parse(raw || '[]');
        }
        catch(e) { window._scheduleBaselines = []; }
    };
    window.loadScheduleBaselines();

    function persistScheduleBaselines() {
        try { localStorage.setItem(_baselineStorageKey(), JSON.stringify(window._scheduleBaselines)); } catch(e) {}
    }

    function getTaskKey(row) {
        if (!row) return '';
        const txt = row._level === 0 ? row._origDev : row._level === 1 ? row._origT1 : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4;
        return (row._l0Group || '') + '::' + (row._level || 0) + '::' + (txt || '').toString().trim();
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 [새 프로젝트 최초 등록] Summary "PROTO Start(계획)" 날짜를 Gantt 시작일 기준(anchor)으로 삼아
    //    전체 일정을 다시 계산하고, 그 결과를 "최초 계획"으로 자동 저장한다 (_saveToGoogleDriveRaw에서
    //    "드라이브에 아직 없는 새 프로젝트를 처음 등록"할 때 1회만 호출됨).
    //    ⚠️ 주의: 엑셀을 드래그해서 불러오면 900ms 뒤 모든 행이 "오늘" 기준 계산일로 자동 잠금(고정)된다
    //    (5298번째 줄 부근 "[초기 잠금]" 참고). 이 함수는 그 잠금을 풀고 PROTO Start 기준으로 다시 계산·
    //    재잠금한다 — 즉, 이 시점 이전에 사용자가 특정 행의 날짜를 수동으로 조정해 두었다면 그 수동
    //    조정분은 여기서 덮어써진다. "새 프로젝트를 막 등록하는 시점"에서만 쓰이도록 저장 로직에서
    //    가드(파일이 아직 없고, 계획이 하나도 없을 때만)를 걸어두었다.
    // ═══════════════════════════════════════════════════════════
    window._reanchorScheduleAndLock = function(anchorTs) {
        if (!globalData || globalData.length <= 1 || colIdx.start === -1) return false;

        // 1) 기존 잠금(수동 고정) 해제 + 예전 시작/완료일 셀 텍스트를 전부 비움.
        //    💡 [버그 수정] _startForced/_planForced만 풀어서는 부족했다 — computeCalcDatesForRows는
        //    "0레벨 행은 잠금 여부와 무관하게 자기 셀의 날짜를 무조건 명시적 기준으로 쓴다"(row._level===0
        //    조건이 _startForced보다 우선 적용됨). 그래서 ES/PP 등 두 번째 이후 0레벨 구간은 플래그를
        //    풀어도 "초기 잠금" 때 찍힌 옛(오늘 기준) 날짜가 셀에 그대로 남아있어 그 구간만 자동계산에서
        //    빠지고, PROTO Start 앵커가 거기까지 이어지지 않는 문제가 있었다. 첫 0레벨 앵커 행 하나만
        //    남기고 모든 행의 시작/완료 셀을 비워서, 진짜로 "처음부터 끝까지" 순수 소요일 기준으로
        //    다시 계산되게 한다(비운 셀은 바로 아래 4번 단계에서 계산 결과로 다시 채워짐).
        for (let i = 1; i < globalData.length; i++) {
            const r = globalData[i]; if (!r) continue;
            r._startForced = false; r._planForced = false; r._scheduleModeManual = false;
            if (colIdx.start !== -1) r[colIdx.start] = '';
            if (colIdx.plan !== -1) r[colIdx.plan] = '';
        }

        // 2) 0레벨(최상위) 첫 행의 시작일 셀만 PROTO Start로 지정 → 전체 일정의 유일한 기준(anchor)이 됨
        let firstL0 = null;
        for (let i = 1; i < globalData.length; i++) {
            if (globalData[i] && globalData[i]._level === 0) { firstL0 = globalData[i]; break; }
        }
        if (!firstL0) return false;
        firstL0[colIdx.start] = formatTsToYMD(anchorTs);

        // 3) 순수 계산(DOM 미접촉) — 전체 행의 _calcStartTs/_calcPlanTs를 채움 (recalculateSchedules()의
        //    핵심 로직만 뽑아낸 computeCalcDatesForRows 재사용)
        if (window.computeCalcDatesForRows) window.computeCalcDatesForRows(globalData.slice(1), colIdx);

        // 4) 계산 결과를 실제 셀에 기록하고 다시 잠금 — 엑셀 최초 로드 시의 "초기 잠금"과 동일한 방식
        for (let i = 1; i < globalData.length; i++) {
            const r = globalData[i]; if (!r || !r._calcStartTs) continue;
            if (colIdx.start !== -1) r[colIdx.start] = formatTsToYMD(r._calcStartTs);
            if (colIdx.plan !== -1 && r._calcPlanTs) r[colIdx.plan] = formatTsToYMD(r._calcPlanTs);
            r._startForced = true; r._planForced = true; r._scheduleModeManual = true;
        }
        return true;
    };

    window._registerNewProjectInitialPlan = function() {
        try {
            if (!globalData || globalData.length <= 1) return; // Gantt 데이터가 아직 없으면 손댈 것이 없음
            const dateEl = document.getElementById('sum-ms-plan-protostart');
            const raw = dateEl ? String(dateEl.value || '').trim() : '';
            if (!raw) return;
            const parsed = parseDateValue(raw);
            if (!parsed) return;

            const applied = window._reanchorScheduleAndLock(parsed.ts);
            if (!applied) return;

            const rows = {};
            for (let i = 1; i < globalData.length; i++) {
                const row = globalData[i]; if (!row || !row._calcStartTs) continue;
                rows[getTaskKey(row)] = { s: row._calcStartTs, e: row._calcPlanTs || null };
            }
            if (Object.keys(rows).length === 0) return;

            const label = window._currentLang === 'en' ? 'Initial Plan (Kickoff)' : '최초 계획 (킥오프)';
            // 💡 isInitialPlan: true — "이게 최초 킥오프 계획이다"를 라벨 문자열 매칭이 아니라 명시적 플래그로
            //    표시. Gantt 실적 연동 버튼(syncSummaryActualsFromGantt)이 이 값을 찾아 계획(Plan) 행을
            //    되살리는 데 씀 — 사용자가 나중에 이 계획 이름을 바꾸거나 다른 계획을 더 저장해도 흔들리지 않음.
            const baseline = { id: 'bl_' + Date.now(), label: label, savedAt: Date.now(), rows: rows, isInitialPlan: true };
            window._scheduleBaselines.push(baseline);
            persistScheduleBaselines();
            if (window.renderBaselineMenu) window.renderBaselineMenu();

            if (typeof renderTable === 'function') renderTable(globalData);
            if (typeof applyFilters === 'function') applyFilters();
            if (window.recomputeGanttViewRange) window.recomputeGanttViewRange();

            window.showToast(window._t(
                `📐 PROTO Start(${raw}) 기준으로 전체 일정을 계산하고 "${label}"으로 저장했습니다.`,
                `📐 Calculated the schedule from PROTO Start (${raw}) and saved it as "${label}".`
            ));
        } catch (e) { console.error('최초 계획 자동 저장 실패:', e); }
    };

    // 🆕 저장된 baseline 중 "최초 킥오프 계획"을 찾아 반환 (없으면 null — 이 기능 이전에 등록된 옛 프로젝트 등)
    window._getInitialKickoffBaseline = function() {
        return (window._scheduleBaselines || []).find(function(b) { return b && b.isInitialPlan; }) || null;
    };

    // 🆕 [2026-08-24] 이미 운용 중인(=새 프로젝트 등록 자동저장 시점을 놓친) 프로젝트를 위한 수동 지정 기능.
    //    _getInitialKickoffBaseline()이 라벨 문자열이 아니라 isInitialPlan 플래그로 찾기 때문에, 저장된
    //    계획 중 하나를 골라 이 플래그를 붙여주면 이름과 무관하게 동일하게 동작함(이름만 "최초 계획(킥오프)"로
    //    똑같이 저장해선 안 됨 — saveScheduleBaseline()은 이 플래그를 붙이지 않음).
    //    한 프로젝트당 킥오프는 하나만 있어야 _getInitialKickoffBaseline()의 find()가 헷갈리지 않으므로,
    //    지정 시 다른 계획에 붙어있던 플래그는 자동으로 해제한다.
    window.toggleKickoffDesignation = function(id) {
        const bl = (window._scheduleBaselines || []).find(function(b) { return b.id === id; });
        if (!bl || id === CURRENT_BASELINE_ID) return; // 📌 "현재 일정"은 매번 새로 만들어지는 파생 슬롯이라 킥오프로 지정 불가
        const _blEn = window._currentLang === 'en';
        if (bl.isInitialPlan) {
            delete bl.isInitialPlan;
            window.showToast(window._t(`"${bl.label}"의 최초 계획(킥오프) 지정을 해제했습니다.`, `Unset "${bl.label}" as the initial plan (kickoff).`));
        } else {
            (window._scheduleBaselines || []).forEach(function(b) { if (b && b.id !== id) delete b.isInitialPlan; });
            bl.isInitialPlan = true;
            window.showToast(window._t(`🏁 "${bl.label}"을(를) 최초 계획(킥오프)으로 지정했습니다. 이제 Gantt 실적 연동 시 계획(Plan) 행에 자동 반영됩니다.`, `🏁 Designated "${bl.label}" as the initial plan (kickoff). It will now be used for the Plan row when syncing actuals from Gantt.`));
        }
        persistScheduleBaselines();
        window.renderBaselineMenu();
    };

    // 🆕 baseline의 rows(키: "그룹::레벨::업무명")에서 0레벨 항목만 뽑아 {name, startTs} 목록으로 변환.
    //    syncSummaryActualsFromGantt()가 "실적"은 현재 Gantt로, "계획"은 이 baseline으로 동일한 방식으로 계산한다.
    window._level0RowsFromBaseline = function(bl) {
        if (!bl || !bl.rows) return [];
        const out = [];
        Object.keys(bl.rows).forEach(function(key) {
            const parts = key.split('::');
            if (parts.length < 3) return;
            if (parts[1] !== '0') return; // 레벨0만
            const val = bl.rows[key];
            const s = (val && typeof val === 'object') ? val.s : val;
            if (!s) return;
            out.push({ name: parts.slice(2).join('::').trim(), startTs: s });
        });
        return out;
    };

    // 🛠️ 일정 도구 메뉴 팝업 — 원래 별도 버튼이던 "📐 계획"(저장/비교선택/삭제)을 이 메뉴 위쪽으로
    //    합침(2026-08-27, 버튼 정리) — 계획 관련 조작과 일정 재계산/정렬 조작이 다 "이 표의 일정을
    //    어떻게 다룰지"라는 같은 성격이라 버튼 하나로 묶는 게 자연스러움. 팝업 DOM/id는 그대로
    //    schedule-tools-popup 하나만 쓰고, 그 안에 계획 목록을 그리는 자리(schedule-baseline-section)만
    //    별도 div로 둬서 renderBaselineMenu()가 계속 그 자리만 갱신하면 되게 함(호출부 여럿 안 건드림).
    window.toggleScheduleToolsMenu = function(ev) {
        if (ev) ev.stopPropagation();
        let popup = document.getElementById('schedule-tools-popup');
        if (popup && popup.style.display === 'block') { popup.style.display = 'none'; return; }
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'schedule-tools-popup';
            popup.className = 'row-action-popup';
            popup.style.minWidth = '230px';
            popup.style.padding = '6px';
            const _stEn = window._currentLang === 'en';
            popup.innerHTML = `
                <div id="schedule-baseline-section"></div>
                <div style="border-top:1px solid #e9ecef; margin:4px 0;"></div>
                <div onclick="document.getElementById('schedule-tools-popup').style.display='none'; window.recalcSelectedRange();" style="padding:8px; cursor:pointer; border-radius:4px; font-size:12px;" onmouseover="this.style.background='#f1f3f5'" onmouseout="this.style.background='transparent'">${_stEn ? '🔓 Recalc Selected Range' : '🔓 선택 구간 재계산'}<div style="font-size:10px; color:#adb5bd; font-weight:normal;">${_stEn ? 'Unlock selected rows and recalculate dates (data will change)' : '선택한 행의 잠금을 풀고 날짜를 다시 계산 (데이터 변경)'}</div></div>
                <div style="border-top:1px solid #e9ecef; margin:4px 0;"></div>
                <div onclick="document.getElementById('schedule-tools-popup').style.display='none'; window.sortRowsByStartDate();" style="padding:8px; cursor:pointer; border-radius:4px; font-size:12px;" onmouseover="this.style.background='#f1f3f5'" onmouseout="this.style.background='transparent'">${_stEn ? '📅 Sort by Date' : '📅 날짜순 정렬'}<div style="font-size:10px; color:#adb5bd; font-weight:normal;">${_stEn ? 'Keep dates as-is, reorder rows by start date' : '날짜는 그대로 두고, 표시 순서만 시작일순 정리'}</div></div>
                <div style="border-top:1px solid #e9ecef; margin:4px 0;"></div>
                <div onclick="document.getElementById('schedule-tools-popup').style.display='none'; window.restoreAiTaskDateAll();" style="padding:8px; cursor:pointer; border-radius:4px; font-size:12px;" onmouseover="this.style.background='#f1f3f5'" onmouseout="this.style.background='transparent'">${_stEn ? '📅 Restore AI-analyzed Dates (All)' : '📅 AI 분석 날짜로 복원 (전체)'}<div style="font-size:10px; color:#adb5bd; font-weight:normal;">${_stEn ? 'Restore original AI dates for every task that has a backup, in one go' : '백업이 있는 모든 업무의 날짜를 AI 분석 원본으로 한 번에 복원'}</div></div>
            `;
            document.body.appendChild(popup);
            document.addEventListener('click', function(e) {
                if (!popup.contains(e.target) && e.target.id !== 'schedule-tools-btn') popup.style.display = 'none';
            });
        }
        window.autoSaveCurrentSnapshot(); // 📌 버튼 누를 때마다 "현재 일정" 슬롯 최신화 (예전 toggleBaselineMenu에 있던 동작)
        window.renderBaselineMenu();
        const btn = document.getElementById('schedule-tools-btn');
        const rect = btn.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.bottom + 4) + 'px';
        popup.style.display = 'block';
    };

    window.renderBaselineMenu = function() {
        const popup = document.getElementById('schedule-baseline-section');
        if (!popup) return;
        const _blEn = window._currentLang === 'en';
        let html = `<div onclick="event.stopPropagation(); window.saveScheduleBaseline()" style="padding:6px 8px; cursor:pointer; border-radius:4px; font-size:12px; color:#1971c2; font-weight:bold;" onmouseover="this.style.background='#f1f3f5'" onmouseout="this.style.background='transparent'">➕ ${_blEn ? 'Save current schedule as plan' : '현재 일정을 새 계획으로 저장'}</div>`;
        html += `<div style="padding:2px 8px 4px; font-size:10px; color:#adb5bd;">${_blEn ? 'Click a plan to compare with the current schedule (selected: teal)' : '비교할 계획을 하나 클릭하세요 — 현재 일정과 대조됩니다 (선택됨: 청록색)'}</div>`;
        html += `<div style="border-top:1px solid #e9ecef; margin:4px 0;"></div>`;

        const targetId = window._compareTargetId;
        const list = window._scheduleBaselines.slice().sort((a, b) => (a.id === CURRENT_BASELINE_ID ? -1 : b.id === CURRENT_BASELINE_ID ? 1 : b.savedAt - a.savedAt));

        if (list.length === 0) {
            html += `<div style="padding:8px; font-size:11px; color:#adb5bd;">${_blEn ? 'No saved plans' : '저장된 계획이 없습니다'}</div>`;
        } else {
            list.forEach(bl => {
                const isPinned = bl.id === CURRENT_BASELINE_ID;
                const isTarget = bl.id === targetId;
                const isKickoff = !!bl.isInitialPlan;
                const dateStr = new Date(bl.savedAt).toLocaleDateString(_blEn ? 'en-US' : 'ko-KR', { month:'2-digit', day:'2-digit' });
                const dot = isTarget
                    ? `<span style="display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%; background:#0c8599; color:#fff; font-size:9px; margin-right:6px; flex-shrink:0;">✓</span>`
                    : `<span style="display:inline-block; width:14px; height:14px; margin-right:6px; flex-shrink:0;"></span>`;
                // 🆕 킥오프 지정 토글 — "현재 일정"(파생 슬롯)은 지정 대상에서 제외
                const kickoffTitle = isKickoff
                    ? (_blEn ? 'Currently the initial plan (kickoff) — click to unset' : '최초 계획(킥오프)으로 지정됨 — 클릭하면 해제')
                    : (_blEn ? 'Designate as the initial plan (kickoff)' : '이 계획을 최초 계획(킥오프)으로 지정');
                const kickoffIcon = isPinned
                    ? `<span style="width:14px; margin-left:4px; flex-shrink:0;"></span>`
                    : `<span onclick="event.stopPropagation(); window.toggleKickoffDesignation('${bl.id}')" title="${kickoffTitle}" style="cursor:pointer; font-size:12px; margin-left:4px; flex-shrink:0; color:${isKickoff ? '#f08c00' : '#ced4da'};">${isKickoff ? '⭐' : '☆'}</span>`;
                const delIcon = isPinned ? `<span style="width:12px; margin-left:6px; flex-shrink:0;"></span>` : `<span onclick="event.stopPropagation(); window.deleteScheduleBaseline('${bl.id}')" title="이 계획 삭제" style="cursor:pointer; color:#e03131; font-size:12px; margin-left:6px; flex-shrink:0;">🗑️</span>`;
                const clickAttr = isPinned ? '' : `onclick="event.stopPropagation(); window.toggleCompareSelection('${bl.id}');"`;
                html += `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-radius:4px; ${isTarget ? 'background:#e6fcf5;' : ''}">
                    <span ${clickAttr} style="cursor:${isPinned ? 'default' : 'pointer'}; font-size:12px; flex:1; display:flex; align-items:center; ${isTarget ? 'font-weight:bold;' : ''}" title="${escapeHtml(bl.label)}">${dot}${isPinned ? '📌 ' : ''}${isKickoff ? '🏁 ' : ''}${escapeHtml(bl.label)} <span style="color:#adb5bd; font-size:10px; margin-left:4px;">(${dateStr})</span></span>
                    ${kickoffIcon}${delIcon}
                </div>`;
            });
        }
        popup.innerHTML = html;
    };

    window.saveScheduleBaseline = function() {
        if (!globalData || globalData.length <= 1) { alert('저장할 일정이 없습니다.'); return; }
        const defaultLabel = new Date().toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        const label = prompt('이 계획의 이름을 입력하세요 (예: 킥오프 계획, 26년 5월 계획 등)', defaultLabel);
        if (label === null) return;

        const rows = {};
        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i]; if (!row || !row._calcStartTs) continue;
            rows[getTaskKey(row)] = { s: row._calcStartTs, e: row._calcPlanTs || null };
        }

        const baseline = { id: 'bl_' + Date.now(), label: (label || defaultLabel).trim(), savedAt: Date.now(), rows: rows };
        window._scheduleBaselines.push(baseline);
        persistScheduleBaselines();
        window.renderBaselineMenu();
        window.showToast(window._t(`✅ "${baseline.label}" 계획으로 ${Object.keys(rows).length}건의 시작일·완료일을 저장했습니다.`, `✅ Saved ${Object.keys(rows).length} date(s) as plan "${baseline.label}".`));
    };

    window.toggleCompareSelection = function(id) {
        window._compareTargetId = (window._compareTargetId === id) ? null : id; // 다시 클릭하면 해제, 다른 걸 클릭하면 교체
        window.recomputeGanttViewRange(); // 📌 비교 대상이 바뀌었으니 축 범위도 새로 넓히거나 좁힘
        renderTable(globalData);
        applyFilters();
        window.renderBaselineMenu();
        const popup = document.getElementById('schedule-tools-popup');
        if (popup) popup.style.display = 'block'; // 🔒 안전장치: 재렌더링 중 팝업이 닫히는 걸 방지
    };

    // 선택한 계획 하나 vs 현재(live) — 그 이상도 이하도 아님
    // 💡 [기능 추가] 계획 저장 이후 새로 추가된 WBS 행은 계획에 매칭되는 항목이 없어 그동안 아무 표시도
    //    없이 조용히 넘어갔음 — "이게 원래 있던 업무인지 새로 생긴 업무인지" 구분이 안 됐던 부분이라,
    //    비교 중일 때 매칭이 안 되면 isNew 플래그를 따로 내려서 호출부에서 신규 배지를 띄울 수 있게 함
    window.getRowCompareInfo = function(row) {
        if (!row || !window._compareTargetId) return null;
        const bl = getBaselineById(window._compareTargetId);
        if (!bl) return null;
        const d = getBaselineRowDates(bl, row);
        if (!d) return { isNew: true, aLabel: bl.label };
        return { mode: 'vsCurrent', aLabel: bl.label, aStart: d.s, aEnd: d.e, bLabel: '현재', bStart: row._calcStartTs, bEnd: row._calcPlanTs };
    };

    window.deleteScheduleBaseline = function(id) {
        if (id === CURRENT_BASELINE_ID) return; // 📌 고정 슬롯은 삭제 불가
        const bl = window._scheduleBaselines.find(b => b.id === id);
        if (!bl) return;
        // 🆕 킥오프로 지정된 계획을 지우면 Gantt 실적 연동의 "계획" 행이 더 이상 채워지지 않으므로 미리 경고
        const kickoffWarn = bl.isInitialPlan
            ? window._t('\n⚠️ 이 계획은 "최초 계획(킥오프)"으로 지정되어 있습니다 — 삭제하면 Gantt 실적 연동 시 계획(Plan) 행이 더 이상 자동 반영되지 않습니다.', '\n⚠️ This plan is designated as the initial plan (kickoff) — deleting it means the Plan row will no longer auto-fill when syncing actuals from Gantt.')
            : '';
        if (!confirm(window._t(`"${bl.label}" 계획을 삭제할까요? 되돌릴 수 없습니다.${kickoffWarn}`, `Delete plan "${bl.label}"? This cannot be undone.${kickoffWarn}`))) return;
        if (!verifyAdminPassword(`🔒 "${bl.label}" 계획을 삭제하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)`)) {
            alert('❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.');
            return;
        }

        window._scheduleBaselines = window._scheduleBaselines.filter(b => b.id !== id);
        persistScheduleBaselines();

        if (window._compareTargetId === id) {
            window._compareTargetId = null;
            window.recomputeGanttViewRange(); // 📌 비교가 해제됐으니 축 범위를 현재 일정 기준으로 되돌림
            renderTable(globalData);
            applyFilters();
        }
        window.renderBaselineMenu();
    };

    window.onRowNoClick = function(td, i, ev) {
        // 💡 [2026-08-28 버그 수정] 더블클릭으로 이미 편집 모드(contenteditable)에 들어간 뒤, 커서를
        //    원하는 위치로 옮기려고 세 번째로 클릭하면 이 함수가 매번 다시 실행돼서(더블클릭 판정은
        //    ev.detail로만 걸러졌지 "지금 편집 중인지"는 안 봤음) forceOpenRowActions/하이라이트 등
        //    행 선택 사이클이 다시 돌면서 포커스가 흔들려 편집 모드가 풀렸다. 편집 중인 셀 클릭은
        //    아예 이 함수를 건너뛰어서, 브라우저 기본 동작대로 클릭한 위치에 커서만 놓이게 한다.
        if (td.getAttribute('contenteditable') === 'true') return;
        if (window.getSelection) window.getSelection().removeAllRanges();   // shift 클릭 시 글자 파랗게 선택되는 것 방지
        if (!window._selectedRows) window._selectedRows = new Set();
        const sel = window._selectedRows;

        if (ev && ev.shiftKey && window._selAnchor != null) {           // 범위 선택
            sel.clear();
            const a = Math.min(window._selAnchor, i), b = Math.max(window._selAnchor, i);
            for (let k = a; k <= b; k++) sel.add(k);
            forceOpenRowActions(td, i);
            window.paintRowSelection();
            return;
        }
        if (ev && (ev.ctrlKey || ev.metaKey)) {                          // 개별 토글
            if (sel.has(i)) sel.delete(i); else sel.add(i);
            window._selAnchor = i;
            if (sel.size > 0) forceOpenRowActions(td, i);
            else { const p = document.getElementById('row-action-popup'); if (p) p.style.display = 'none'; window.clearRowHighlight(); }
            window.paintRowSelection();
            return;
        }
        // 일반 클릭: 묶음 선택 해제, 단일 메뉴
        sel.clear(); window._selAnchor = i;

        // 💡 [2026-08-24] WBS 1→2→3 클릭 사이클: 1클릭=행 선택(기존), 2클릭=하위행까지 옅게 하이라이트(신규),
        //    3클릭=전체 해제. ondblclick="makeEditable(this)"(텍스트 수정)와 절대 안 겹치게 하기 위해
        //    ev.detail(브라우저가 세는 연속 클릭 횟수)이 2 이상이면 — 즉 "빠르게 두 번 눌러서 브라우저가
        //    진짜 더블클릭으로 인식한 클릭"이면 — 이 사이클은 아예 건드리지 않고 그대로 둔다. 그 직후
        //    ondblclick이 정상적으로 발동해 수정모드로 들어간다(기존 동작 100% 유지). 반대로 천천히
        //    따로따로 누른 단독 클릭(매번 ev.detail===1, 브라우저가 더블클릭으로 안 묶어서 dblclick
        //    자체가 안 뜸)만 이 사이클을 한 단계씩 진행시킨다 — 그래서 두 클릭 방식이 절대 충돌하지 않음.
        if (ev && ev.detail >= 2) { window.paintRowSelection(); return; }

        if (!window._rowClickCycle) window._rowClickCycle = { index: null, step: 0 };
        const nextStep = (window._rowClickCycle.index === i) ? (window._rowClickCycle.step % 3) + 1 : 1;

        if (nextStep === 3) {
            const p = document.getElementById('row-action-popup'); if (p) p.style.display = 'none';
            window.clearRowHighlight(); // 내부에서 _rowClickCycle도 {index:null, step:0}으로 리셋됨
        } else {
            forceOpenRowActions(td, i); // 항상 '열기'로 동작 + highlightRow(i)로 본인 행 하이라이트(내부에서 이전 하이라이트 정리)
            if (nextStep === 2) window.highlightRowChildren(i);
            // 💡 forceOpenRowActions 내부의 clearRowHighlight()가 방금 사이클을 리셋했을 수 있으므로,
            //    최종 사이클 상태는 모든 하이라이트 처리가 끝난 뒤 여기서 마지막에 확정해서 덮어쓴다.
            window._rowClickCycle = { index: i, step: nextStep };
        }
        window.paintRowSelection();
    };

    // 선택된 여러 행(+하위)을 한 덩어리로 위/아래 이동
   window.moveSelectedRows = function(direction) {
        const rows = globalData;
        const lvOf = (r) => (r && typeof r._level === 'number') ? r._level : 4;
        const sel = window._selectedRows;
        if (!sel || sel.size === 0) return null;
        if (sel.size === 1) {
            const only = [...sel][0];
            const ns = window.moveRow(only, direction);
            const fin = (ns != null) ? ns : only;
            window._selectedRows = new Set([fin]);
            return fin;
        }
        const expanded = new Set();
        for (const idx of sel) {
            const L = lvOf(rows[idx]);
            expanded.add(idx);
            for (let j = idx + 1; j < rows.length; j++) { if (lvOf(rows[j]) > L) expanded.add(j); else break; }
        }
        const selIdx = [...expanded].sort((a, b) => a - b);
        const top = selIdx[0], bottom = selIdx[selIdx.length - 1];
        const G = lvOf(rows[top]);
        let insertAt;
        if (direction < 0) {
            if (top <= 1) return null;
            let ps = -1;
            for (let j = top - 1; j >= 1; j--) { const lv = lvOf(rows[j]); if (lv > G) continue; ps = j; break; }
            if (ps === -1) ps = 1;
            insertAt = ps;
        } else {
            const after = bottom + 1;
            if (after >= rows.length) return null;
            const nl = lvOf(rows[after]);
            let ne = after;
            for (let j = after + 1; j < rows.length; j++) { if (lvOf(rows[j]) > nl) ne = j; else break; }
            insertAt = ne + 1;
        }
        const picked = selIdx.map(i => rows[i]);
        for (let k = selIdx.length - 1; k >= 0; k--) rows.splice(selIdx[k], 1);
        insertAt -= selIdx.filter(i => i < insertAt).length;
        rows.splice(insertAt, 0, ...picked);
        const newSel = new Set();
        for (let k = 0; k < picked.length; k++) newSel.add(insertAt + k);
        window._selectedRows = newSel;
        logChange(top, -1, '행 이동', `선택 ${selIdx.length}개 ${direction > 0 ? '아래' : '위'}로 이동(하위 포함)`);
        window.recalculateSchedules();
        window.paintRowSelection();
        return insertAt;
    };

    // 선택된 여러 행(+하위)을 한 번에 삭제
    window.deleteSelectedRows = function() {
        const rows = globalData;
        const lvOf = (r) => (r && typeof r._level === 'number') ? r._level : 4;
        const sel = window._selectedRows;
        if (!sel || sel.size === 0) return false;

        // 자손까지 확장
        const expanded = new Set();
        for (const idx of sel) {
            const L = lvOf(rows[idx]);
            expanded.add(idx);
            for (let j = idx + 1; j < rows.length; j++) { if (lvOf(rows[j]) > L) expanded.add(j); else break; }
        }
        const delIdx = [...expanded].sort((a, b) => a - b);
        if (delIdx.length === 0) return false;
        if (!confirm(window._t(`선택한 ${sel.size}개 행(하위 포함 총 ${delIdx.length}개)을 삭제할까요?`, `Delete ${sel.size} selected row(s) (${delIdx.length} total including children)?`))) return false;

        for (let k = delIdx.length - 1; k >= 0; k--) rows.splice(delIdx[k], 1);  // 뒤에서부터 제거

        window._selectedRows = new Set();
        window._selAnchor = null;
        logChange(delIdx[0], -1, '행 삭제', `선택 ${sel.size}개(하위 포함 ${delIdx.length}개) 삭제`);
        window.recalculateSchedules();
        return true;
    };

// 선택된 여러 행의 WBS 레벨을 한 번에 변경
    window.changeSelectedRowsLevel = function(direction) {
        const rows = globalData;
        const sel = window._selectedRows;
        if (!sel || sel.size < 2) return false;
        const idxs = [...sel].sort((a, b) => a - b);
        let changed = 0;
        idxs.forEach(index => {
            const row = rows[index];
            if (!row) return;
            const oldLevel = (typeof row._level === 'number') ? row._level : 4;
            const newLevel = Math.max(0, Math.min(4, oldLevel + direction));
            if (newLevel === oldLevel) return;
            let taskTxt = "";
            if (oldLevel === 0) taskTxt = row._origDev; else if (oldLevel === 1) taskTxt = row._origT1; else if (oldLevel === 2) taskTxt = row._origT2; else if (oldLevel === 3) taskTxt = row._origT3; else if (oldLevel === 4) taskTxt = row._origT4;
            taskTxt = (taskTxt || "").toString().trim() || "새로운 업무";
            row._level = newLevel;
            row._origDev = ""; row._origT1 = ""; row._origT2 = ""; row._origT3 = ""; row._origT4 = "";
            if (newLevel === 0) row._origDev = taskTxt; else if (newLevel === 1) row._origT1 = taskTxt; else if (newLevel === 2) row._origT2 = taskTxt; else if (newLevel === 3) row._origT3 = taskTxt; else if (newLevel === 4) row._origT4 = taskTxt;
            const currentDur = row._finalDuration || 1;
            if (colIdx.dur1 !== -1) row[colIdx.dur1] = (newLevel === 1) ? currentDur.toString() : "";
            if (colIdx.dur2 !== -1) row[colIdx.dur2] = (newLevel === 2) ? currentDur.toString() : "";
            if (colIdx.dur3 !== -1) row[colIdx.dur3] = (newLevel === 3) ? currentDur.toString() : "";
            if (colIdx.dur4 !== -1) row[colIdx.dur4] = (newLevel === 4) ? currentDur.toString() : "";
            changed++;
        });
        if (changed === 0) return false;
        logChange(idxs[0], -1, '계층 변경', `선택 ${changed}개 ${direction > 0 ? '레벨 내림' : '레벨 올림'}`);
        window.recalculateSchedules();
        window.paintRowSelection();
        return true;
    };

    // 📥 GitHub raw 파일 강제 다운로드 (cross-origin에서 download 속성이 무시되는 문제 우회)
    window.downloadRawFile = async function(url, filename) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            alert(`다운로드 실패: ${e.message}\n\n아래 주소를 새 탭에서 열어 [Ctrl+S]로 저장해주세요:\n${url}`);
        }
    };

    // 📋 다운로드가 보안 정책으로 막힐 때 대비 — 클립보드 복사 + 수동 저장 안내
    window.copyRawFileToClipboard = async function(url, filename) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            await navigator.clipboard.writeText(text);
            alert(
                `✅ "${filename}" 내용이 클립보드에 복사되었습니다.\n\n` +
                `1. 메모장(Notepad) 실행\n` +
                `2. Ctrl+V로 붙여넣기\n` +
                `3. [다른 이름으로 저장] → 파일 이름: ${filename}\n` +
                `   (저장 형식을 "모든 파일"로 선택해야 .txt로 안 바뀝니다)`
            );
        } catch (e) {
            alert(`복사 실패: ${e.message}`);
        }
    };

    // =========================================================
    // 🛠️ 파일 업로드 및 유틸리티 로직
    // =========================================================
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', handleFiles, false);
    window.addEventListener("dragover", function(e) { e.preventDefault(); }, false);
    // ✅ 페이지 어디에 드롭해도(표의 빈 안내 문구 영역 포함) 엑셀 로드가 동작하도록 처리
    window.addEventListener("drop", function(e) {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            document.getElementById('file-input').value = '';
            handleFiles({ target: { files: e.dataTransfer.files } });
        }
    }, false);
    const dropZone = document.getElementById('app-topbar');
    dropZone.addEventListener('dragenter', function(e) { dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function(e) { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
        dropZone.classList.remove('drag-over');
    });

        function handleFiles(e) {
        const files = e.target.files; if (!files || files.length === 0) return;

        // ✅ 이미 로드된 프로젝트(파일 연결됨) 또는 화면에 이미 실제 Gantt 데이터가 있는 상태에서
        //    엑셀을 드래그하면 "그 내용을 덮어쓰는" 것이므로 비밀번호로 막는다.
        //    💡 [버그 수정] 예전엔 조건이 `window.isDriveConnected`만 봐서, 프로젝트가 하나도 안 열려있는
        //    "완전히 빈 화면"(구글 연동은 돼있지만 아무 파일도 안 불러온 상태)에서도 매번 비밀번호를
        //    물었다 — 빈 화면은 애초에 "덮어쓸" 내용이 없으므로 막을 이유가 없다. 실제로 덮어써질 데이터가
        //    있을 때(파일이 연결돼 있거나, 화면에 이미 Gantt 행이 있을 때)만 확인하도록 좁힌다.
        //    (새 프로젝트 등록 자체의 비밀번호 보호는 여기가 아니라 실제 신규 파일 생성 시점인
        //    _saveToGoogleDriveRaw에서 한다 — 진입 경로(버튼/드래그 등)에 상관없이 항상 걸리도록)
            if (window.currentDriveFileId || (window.isDriveConnected && globalData && globalData.length > 1)) {
            const success = verifyAdminPassword(
                "🔒 이미 열려있는 프로젝트 데이터가 있습니다.\n\n" +
                "엑셀 파일로 덮어쓰려면\n관리자 비밀번호를 입력하세요.\n\n" +
                "(취소 시 엑셀 로드가 중단됩니다)"
            );
            if (!success) {
                alert("❌ 비밀번호 인증 실패. 엑셀 로드가 취소되었습니다.");
                document.getElementById('file-input').value = '';
                return;
            }
            // 연동 유지 (currentDriveFileId 그대로)
        } else if (!window.isDriveConnected) {
            window.currentDriveFileId = null;
        }

        window.closeAllTopbarMenus(); // ✅ 엑셀 로드 시작 시 열려있던 파일/업무 드롭다운 자동 닫기
        globalData = []; existingDevStages = []; filterColumns = []; currentFilters = {}; window.projectDistributions = []; // 📥 [Phase 2.5] 새 프로젝트 로드 시 원장 초기화
        colIdx = { no: -1, bogo: -1, start: -1, plan: -1, period: -1, dur1: -1, dur2: -1, dur3: -1, dur4: -1, assignee: -1, taskType1: -1, taskType2: -1, taskType3: -1, taskType4: -1, status: -1, customer: -1, model: -1, inch: -1, devStage: -1, content: -1, answer: -1, chart: -1, wbs: -1 };
        let headerRow = []; let filesProcessed = 0; let totalFiles = files.length;
        // 드라이브 연동 유지 시 기존 로그 보존
        window.changeLogs = []; window.lastSavedLogCount = 0;
        

        for (let i = 0; i < totalFiles; i++) {
            let file = files[i]; let reader = new FileReader();
            reader.onload = function(e) {
                let data = new Uint8Array(e.target.result); let workbook;
                try { workbook = XLSX.read(data, {type: 'array', cellStyles: true, cellHTML: true}); } catch (readErr) { workbook = XLSX.read(data, {type: 'array'}); }
                
                // 💡 시트 순서가 Summary/Brief SPEC/M.C Table/GanttChart/수정이력 순이므로,
                //    위치(SheetNames[0])가 아니라 이름으로 GanttChart 시트를 찾는다 (이름이 없는 옛 형식 파일은 첫 시트로 폴백)
                let firstSheetName = workbook.SheetNames.find(n => n.trim() === "GanttChart") || workbook.SheetNames.find(n => n.trim() === "GanttChart_RAW") || workbook.SheetNames[0];
                let worksheet = workbook.Sheets[firstSheetName];
                let jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: "", raw: true});
                
                let historySheetName = workbook.SheetNames.find(n => n.trim() === "Gantt 수정이력") || workbook.SheetNames.find(n => n.includes("수정이력") && !n.includes("M.C")); // 💡 'M.C 수정이력' 오인식 버그 수정
                if (historySheetName && filesProcessed === 0) { 
                    let historyWs = workbook.Sheets[historySheetName];
                    let historyJson = XLSX.utils.sheet_to_json(historyWs, {header: 1, defval: ""});
                    for (let k = 1; k < historyJson.length; k++) {
                        let hRow = historyJson[k];
                        if (hRow && hRow[0] && k > 0) { 
                            if (hRow.length >= 6) { window.changeLogs.push({ time: hRow[0], userName: hRow[1], rowName: hRow[2], colName: hRow[3], oldVal: hRow[4], newVal: hRow[5] }); } 
                            else { window.changeLogs.push({ time: hRow[0], userName: "이전 기록", rowName: hRow[1], colName: hRow[2], oldVal: hRow[3], newVal: hRow[4] }); }
                        }
                    }
                }

                // 💡 알림메일 시트 → _loadedAlarmNames 복원
                const alarmSheetName = workbook.SheetNames.find(n => n.includes('알림메일'));
                if (alarmSheetName) {
                    const alarmWs   = workbook.Sheets[alarmSheetName];
                    const alarmJson = XLSX.utils.sheet_to_json(alarmWs, { header: 1, defval: '' });
                    window._loadedAlarmNames = new Set();
                    for (let k = 1; k < alarmJson.length; k++) {
                        const aRow = alarmJson[k];
                        if (aRow && aRow[0]) {
                            const nm  = String(aRow[0]).replace(/📧/g, '').trim();
                            // 완료일(aRow[2]) → YYYY-MM-DD 정규화
                            let due   = String(aRow[2] || '').trim();
                            if (/^\d{4}-\d{2}-\d{2}/.test(due)) due = due.slice(0, 10);
                            if (nm) window._loadedAlarmNames.add(nm + '|' + due);
                        }
                    }
                }

                // 💡 Summary / Brief SPEC / M.C Table 시트가 있으면 사용자가 회색 칸에 작성한 내용을 읽어와
                //    projectMeta / tabData에 반영 (구글 드라이브 JSON과 동일하게, 로컬 엑셀에서도 복원)
                if (window.parseConceptSheetsFromWorkbook) window.parseConceptSheetsFromWorkbook(workbook);

                if(jsonData.length > 0) {
                    if (headerRow.length === 0) {
                        headerRow = jsonData[0];
                        headerRow.forEach((h, idx) => {
                            if(!h) return; let str = h.toString().replace(/\s+/g, ''); let strUpper = str.toUpperCase();
                            if(strUpper.includes("NO")) colIdx.no = idx;
                            else if(str === "보고" || strUpper === "VIEW" || strUpper === "LEVEL(WBS)" || strUpper === "LEVELWBS") colIdx.bogo = idx;
                            else if(str.includes("시작")) colIdx.start = idx;
                            else if(str.includes("계획") || str.includes("완료")) colIdx.plan = idx;
                            else if(str === "기간" || str === "기간일" || str === "소요일") colIdx.period = idx;
                            else if(str === "소요1") colIdx.dur1 = idx;
                            else if(str === "소요2") colIdx.dur2 = idx;
                            else if(str === "소요3" || str === "소요" || str.includes("소요일수")) colIdx.dur3 = idx;
                            else if(str === "소요4") colIdx.dur4 = idx;
                            else if(str.includes("담당자")) colIdx.assignee = idx;
                            else if(str === "업무구분1" || str === "업무1") colIdx.taskType1 = idx;
                            else if(str === "업무구분2" || str === "업무2") colIdx.taskType2 = idx;
                            else if(str === "업무구분3" || str === "업무3") colIdx.taskType3 = idx;
                            else if(str === "업무구분4" || str === "업무4") colIdx.taskType4 = idx;
                            else if(strUpper === "개발업무(WBS)") colIdx.wbs = idx;
                            else if(str.includes("상태") || str.includes("업무상태")) colIdx.status = idx;
                            else if(str.includes("고객")) colIdx.customer = idx;
                            else if(str.includes("모델")) colIdx.model = idx;
                            else if(str.includes("인치")) colIdx.inch = idx;
                            else if(str.includes("단계") || str.includes("개발단계")) colIdx.devStage = idx;
                            else if(str.includes("업무내용") || str.includes("요청내용") || str.includes("업무상세내용") || str.includes("상세내용")) colIdx.content = idx;
                            else if(str.includes("답변") || str.includes("대응내용") || str.includes("대응")) colIdx.answer = idx;
                            else if(str.includes("현황")) colIdx.chart = idx;
                        });
                        
                        filterColumns = []; let orderedNames = ['LEVEL(WBS)', '개발단계', '업무상태'];
                        orderedNames.forEach(name => {
                            if (name === 'LEVEL(WBS)' && colIdx.bogo !== -1) filterColumns.push({ index: colIdx.bogo, name: 'LEVEL(WBS)' });
                            else if (name === '개발단계' && colIdx.devStage !== -1) filterColumns.push({ index: colIdx.devStage, name: '개발단계' });
                            else if (name === '개발단계' && colIdx.wbs !== -1) filterColumns.push({ index: colIdx.wbs, name: '개발단계' });
                            else if (name === '업무상태' && colIdx.status !== -1) filterColumns.push({ index: colIdx.status, name: '업무상태' });
                        });
                    }
                    
                    let stageSet = new Set(); let lastDev = "", lastT1 = "", lastT2 = "", lastT3 = "", lastT4 = "";
                    for (let j = 1; j < jsonData.length; j++) {
                        if (!jsonData[j] || jsonData[j].length === 0) continue;
                        if (jsonData[j].join('').trim() === '') continue;
                        let row = jsonData[j];
                        
                        const stripPrefix = s => s.replace(/^[├└─\s]+/, '').trim();
                        let origD0 = colIdx.devStage  !== -1 ? stripPrefix((row[colIdx.devStage]  || "").toString().trim()) : "";
                        let origD1 = colIdx.taskType1 !== -1 ? stripPrefix((row[colIdx.taskType1] || "").toString().trim()) : "";
                        let origD2 = colIdx.taskType2 !== -1 ? stripPrefix((row[colIdx.taskType2] || "").toString().trim()) : "";
                        let origD3 = colIdx.taskType3 !== -1 ? stripPrefix((row[colIdx.taskType3] || "").toString().trim()) : "";
                        let origD4 = colIdx.taskType4 !== -1 ? stripPrefix((row[colIdx.taskType4] || "").toString().trim()) : "";

                        // 💡 웹형 엑셀(단일 "개발업무(WBS)" 열): LEVEL(WBS) 값으로 레벨 판별해 라우팅
                        if (colIdx.wbs !== -1 && colIdx.devStage === -1) {
                            const wbsTxt = stripPrefix((row[colIdx.wbs] || "").toString());
                            let lvRaw = parseInt(colIdx.bogo !== -1 ? row[colIdx.bogo] : "", 10);
                            if (isNaN(lvRaw)) {
                                // 💡 LEVEL 누락 시 폴백: 들여쓰기(레벨당 2칸)로 추정, 그것도 없으면 직전 행 레벨 유지
                                const rawWbs = (row[colIdx.wbs] || "").toString();
                                const m = rawWbs.match(/^(\s*)/);
                                if (rawWbs.trim() !== "" && m && m[1].length > 0) lvRaw = Math.round(m[1].length / 2);
                                else if (/^[├└]/.test(rawWbs.trim())) lvRaw = (window._lastImportLv !== undefined ? window._lastImportLv : 1);
                                else lvRaw = (window._lastImportLv !== undefined ? window._lastImportLv : 3);
                            }
                            const lv = Math.max(0, Math.min(4, lvRaw));
                            window._lastImportLv = lv;
                            if (lv === 0) origD0 = wbsTxt; else if (lv === 1) origD1 = wbsTxt; else if (lv === 2) origD2 = wbsTxt; else if (lv === 3) origD3 = wbsTxt; else origD4 = wbsTxt;
                        }
                        row._origDev = origD0; row._origT1 = origD1; row._origT2 = origD2; row._origT3 = origD3; row._origT4 = origD4;
                        if (origD0 !== "") { lastDev = origD0; lastT1 = ""; lastT2 = ""; lastT3 = ""; lastT4 = ""; }
                        if (origD1 !== "") { lastT1 = origD1; lastT2 = ""; lastT3 = ""; lastT4 = ""; }
                        if (origD2 !== "") { lastT2 = origD2; lastT3 = ""; lastT4 = ""; }
                        if (origD3 !== "") { lastT3 = origD3; lastT4 = ""; }
                        if (origD4 !== "") { lastT4 = origD4; }

                        if (colIdx.devStage !== -1) row[colIdx.devStage] = lastDev;
                        if (colIdx.wbs !== -1 && colIdx.devStage === -1) row[colIdx.wbs] = lastDev; // 💡 개발단계 필터용
                        if (colIdx.taskType1 !== -1) row[colIdx.taskType1] = lastT1;
                        if (colIdx.taskType2 !== -1) row[colIdx.taskType2] = lastT2;
                        if (colIdx.taskType3 !== -1) row[colIdx.taskType3] = lastT3;
                        if (colIdx.taskType4 !== -1) row[colIdx.taskType4] = lastT4;

                        if (origD4 !== "") row._level = 4; else if (origD3 !== "") row._level = 3; else if (origD2 !== "") row._level = 2; else if (origD1 !== "") row._level = 1; else if (origD0 !== "") row._level = 0; else row._level = 3;

                        row._startForced = false; row._planForced  = false;
                        row._isStrikeContent = checkStrikeThrough(worksheet, j, colIdx.content); row._isStrikeAnswer = checkStrikeThrough(worksheet, j, colIdx.answer);
                        
                        let name = ""; if (row._level === 0) name = origD0; if (row._level === 1) name = origD1; if (row._level === 2) name = origD2; if (row._level === 3) name = origD3; if (row._level === 4) name = origD4;
                        let contentStr = colIdx.content !== -1 ? (row[colIdx.content] || "").toString() : "";
                        row._isParallel = name.includes('*') || name.includes('＊') || contentStr.includes('*') || contentStr.includes('＊');

                        globalData.push(row); 
                    }
                }
                    filesProcessed++;
                    if(filesProcessed === totalFiles) { 
                        globalData = [headerRow, ...globalData];

                        // ✅ 파일 로드 시 이름 확인
                        const authBtn = document.getElementById('auth_button');
                        const isGoogleLoggedIn = authBtn && authBtn.innerText.includes('🟢');
                        
                        if (!isGoogleLoggedIn) {
                            let savedName = localStorage.getItem('gantt_local_user') || "";
                            let localName = prompt("수정이력에 기록될 이름을 입력해주세요.", savedName);
                            if (!localName || localName.trim() === '') localName = savedName || "로컬 사용자";
                            localName = localName.trim();
                            localStorage.setItem('gantt_local_user', localName);
                            window.currentUserName = localName;
                            if (authBtn && !authBtn.innerText.includes('🔄')) {
                                authBtn.innerText = `👤 ${localName} (${window._currentLang === 'en' ? 'Connect Drive' : '드라이브 연동하기'})`;
                                authBtn.style.borderColor = '#28a745';
                                authBtn.style.color = '#28a745';
                            }
                        }
                        
                        window.recalculateSchedules();

                        // 🔒 [초기 잠금] 프로젝트를 새로 불러온 직후, 계산된 일정을 그대로 전체 행(0레벨 포함) 잠금 상태로 고정
                        //    recalculateSchedules 내부 setTimeout 계산이 끝난 뒤 실행되도록 넉넉히 지연시킴
                        setTimeout(() => {
                            for (let gi = 1; gi < globalData.length; gi++) {
                                const gr = globalData[gi]; if (!gr) continue;
                                if (colIdx.start !== -1 && gr._calcStartTs) gr[colIdx.start] = formatTsToYMD(gr._calcStartTs);
                                if (colIdx.plan  !== -1 && gr._calcPlanTs)  gr[colIdx.plan]  = formatTsToYMD(gr._calcPlanTs);
                                gr._startForced = true;
                                gr._planForced  = true;
                                gr._scheduleModeManual = true; // 자동재잠금 로직과 무관하게 항상 '수동 고정'으로 취급
                            }
                            window.recalculateSchedules();
                        }, 900);

                        // 💡 recalculateSchedules 내부 setTimeout 완료 후 _알림 복원
                        if (window._loadedAlarmNames && window._loadedAlarmNames.size > 0) {
                            setTimeout(() => {
                                globalData.forEach((row, idx) => {
                                    if (idx === 0) return;
                                    const lv = row._level || 0;
                                    let nm = '';
                                    if (lv === 0)      nm = row._origDev || '';
                                    else if (lv === 1) nm = row._origT1  || '';
                                    else if (lv === 2) nm = row._origT2  || '';
                                    else if (lv === 3) nm = row._origT3  || '';
                                    else if (lv === 4) nm = row._origT4  || '';
                                    nm = nm.replace(/📧/g, '').trim();
                                    const due = String(row[colIdx.plan] || '').trim().slice(0, 10);
                                    if (nm && window._loadedAlarmNames.has(nm + '|' + due)) {
                                        row._알림 = true;
                                    }
                                });
                                // 복원 완료 후 _loadedAlarmNames 제거 → 이후 row._알림만 사용
                                window._loadedAlarmNames = null;
                                renderTable(globalData);
                                applyFilters();
                            }, 800);
                        }
                    }
            };
            reader.readAsArrayBuffer(file);
        }
    }

    
    // 🔒 [수정] 표를 깨끗한 사본으로 복제해서 별도 인쇄 전용 영역에 넣고, 그 영역만 인쇄
    //    화면의 스크롤 박스/필터 숨김 등에 전혀 영향받지 않음 (필터링된 행 전체가 항상 그대로 인쇄됨)
    window.smartPrint = function() {
        const sourceTable = document.getElementById('myTable');
        if (!sourceTable) { window.print(); return; }

        // 인쇄 전용 컨테이너가 이미 있으면 비우고, 없으면 새로 생성
        let printArea = document.getElementById('gantt-print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'gantt-print-area';
            document.body.appendChild(printArea);
        }
        printArea.innerHTML = '';

        // 💡 표를 통째로 복제 (현재 화면에 보이는 필터링/정렬 상태 그대로, sticky 등 인라인 스타일은 인쇄 CSS가 따로 정리)
        const tableClone = sourceTable.cloneNode(true);
        tableClone.removeAttribute('id'); // 원본과 id 충돌 방지
        // 💡 인쇄는 화면에 보이는 상태(확장/기본) 그대로 따라가도록 클래스 및 열 순서를 그대로 유지

        // 💡 <select>(업무상태)는 인쇄 시 선택된 텍스트가 안 그려지는 브라우저가 많아 일반 텍스트로 치환
        tableClone.querySelectorAll('select').forEach(function(sel) {
            const selectedOption = sel.options[sel.selectedIndex];
            const span = document.createElement('span');
            span.textContent = selectedOption ? selectedOption.textContent : '';
            span.style.cssText = sel.getAttribute('style') || '';
            sel.parentNode.replaceChild(span, sel);
        });

        printArea.appendChild(tableClone);

        // 💡 다른 탭들과 동일하게, 계산 전(측정 대상에 포함되는 시점)에 실제 콘텐츠로 삽입
        const _pfNow = new Date();
        const _pfDateStr = _pfNow.getFullYear() + '-' + String(_pfNow.getMonth()+1).padStart(2,'0') + '-' + String(_pfNow.getDate()).padStart(2,'0');
        const _pfPm = window.projectMeta || {};
        const _pfProjectName = [_pfPm.고객사, _pfPm.고객모델명].filter(Boolean).join(' > ');
        // 📌 <tfoot>은 표가 여러 페이지로 나뉠 때 브라우저가 페이지마다 자동으로 반복해줌 (thead와 동일한 원리)
        const ganttFooterTfoot = document.createElement('tfoot');
        ganttFooterTfoot.innerHTML = '<tr><td colspan="100" style="padding-top:4px; margin:0; border:none; border-radius:0; box-shadow:none;">'
            + '<span style="display:table-cell; width:1300px; text-align:left; font-size:8px; color:#000; font-family:\'Malgun Gothic\',sans-serif;">ⓒ Copyright ' + _pfNow.getFullYear() + ' KORTEK Corporation</span>'
            + '<span style="display:table-cell; width:1100px; text-align:right; font-size:8px; color:#000; font-family:\'Malgun Gothic\',sans-serif;">' + _pfDateStr + (_pfProjectName ? '_' + _pfProjectName : '') + '</span>'
            + '</td></tr>';
        tableClone.appendChild(ganttFooterTfoot);

        document.body.classList.add('gantt-printing-mode');
        window.print();
    };

    // 💡 인쇄가 끝나면(취소 포함) 인쇄 전용 사본을 정리 — 단, afterprint가 미리보기 직후 너무 빨리
    //    발생하는 브라우저(Chrome 등)에서 사본이 미리보기 도중 비워지지 않도록 약간 지연시킴
    window.printTabSection = function(tabId) {
        const tabEl = document.getElementById(tabId);
        const source = tabEl ? tabEl.querySelector('.concept-tab-wrap') : null;
        if (!source) { window.print(); return; }

        let printArea = document.getElementById('tab-print-area');
        if (!printArea) { printArea = document.createElement('div'); printArea.id = 'tab-print-area'; document.body.appendChild(printArea); }
        printArea.innerHTML = '';

        const clone = source.cloneNode(true);
        clone.querySelectorAll('.concept-header-box').forEach(function(el) { el.remove(); }); // 제목/버튼 영역 제외
        clone.querySelectorAll('[id$="-history-box"]').forEach(function(el) { el.remove(); }); // 변경/수정 이력 확인 박스 제외 (id가 "-history-box"로 끝나는 요소 전부: sum/bs/mc/addr-history-box)
        // 💡 <select>는 인쇄 시 선택된 텍스트가 안 그려지는 브라우저가 많아 일반 텍스트로 치환 (Gantt와 동일 처리)
        clone.querySelectorAll('select').forEach(function(sel) {
            const selectedOption = sel.options[sel.selectedIndex];
            const span = document.createElement('span');
            span.textContent = selectedOption ? selectedOption.textContent : '';
            span.style.cssText = sel.getAttribute('style') || '';
            sel.parentNode.replaceChild(span, sel);
        });

        const isSummary = (tabId === 'tab-summary');
        const isBriefSpec = (tabId === 'tab-briefspec');
        const isMcTable = (tabId === 'tab-mctable');
        const isCalendar = (tabId === 'tab-calendar');
        const isWeekly = (tabId === 'tab-weekly');
        const isAlarm = (tabId === 'tab-alarm');
        const isNotice = (tabId === 'tab-notice');
        const isAddress = (tabId === 'tab-address');
        const isRowPagedPortrait = isAlarm || isNotice || isAddress; // 🎯 A4 세로 + 40행/페이지 (여러 페이지로 이어짐)
        // 💡 [버그 수정] Weekly Report는 원래 여기 포함돼서 무조건 1페이지로 욱여넣었는데, 업무가 많으면
        //    글자가 안 보일 정도로 축소되거나 억지로 잘렸다. "적당한 위치에서 페이지가 나뉘길" 원하므로
        //    1페이지 강제축소 대상에서 빼고, 대신 wr-print-block 단위로 자연스럽게 여러 페이지로 흐르게 함.
        const fitOnePage = isSummary || isBriefSpec; // 💡 1페이지 축소 대상 탭

        if (isSummary) {
            // 📷 제품 사진 섹션은 인쇄에서 제외
            clone.querySelectorAll('#product-images-section').forEach(function(el) { el.remove(); });
        }
        if (fitOnePage || isMcTable || isCalendar || isWeekly || isRowPagedPortrait) {
            // 💡 화면용 내부 스크롤 제한(overflow-y:auto/max-height) 해제 → 전체 내용이 실제 높이로 측정되도록
            clone.querySelectorAll('[style*="overflow-y"]').forEach(function(el) {
                el.style.overflow = 'visible';
                el.style.maxHeight = 'none';
            });
        }

        // 💡 페이지 맞춤 계산(zoom/scale)이 이 콘텐츠(footer 포함) 높이를 측정해서 결정되므로,
        //    반드시 clone "안"에 footer를 넣은 다음, 계산이 일어나기 전에 clone을 printArea에 붙여야 함
        const _pfNow = new Date();
        const _pfDateStr = _pfNow.getFullYear() + '-' + String(_pfNow.getMonth()+1).padStart(2,'0') + '-' + String(_pfNow.getDate()).padStart(2,'0');
        const _pfPm = window.projectMeta || {};
        const _pfProjectName = [_pfPm.고객사, _pfPm.고객모델명].filter(Boolean).join(' > ');
        // 📌 알람/주소록/Brief SPEC/M.C Table처럼 표 하나짜리 탭은 <tfoot>으로 넣어 페이지마다 자동 반복.
        //    💡 [버그 수정] "1페이지에 맞추기" 축소 계산이 실측 오차로 완벽하게 안 맞아 내용이 2페이지로
        //    넘어갈 때가 있는데, 그동안 푸터를 맨 끝에 "한 번만" 넣다 보니 1페이지가 끝나는 지점(=표 중간)
        //    에서 잘려서 푸터가 화면 중앙 근처에 끼어 보이는 버그가 있었음.
        //    - M.C Table: 예전엔 "펼침" 상태일 때만 tfoot을 썼는데, 접힘 상태도 표 하나라 똑같이 넘칠 수
        //      있어서 상태와 무관하게 항상 tfoot 사용하도록 수정.
        //    - Summary/Weekly: 표 하나로 안 끝나는(여러 섹션 div) 구조라 진짜 <table>이 없음 → 전체를
        //      가짜 테이블 1개로 감싸서 그 tfoot에 푸터를 넣음(아래 else 분기) — 표가 있든 없든 페이지가
        //      몇 장이 되든 항상 그 페이지 맨 아래에 반복되는 걸 보장.
        let footerTable = null;
        if (isRowPagedPortrait || isBriefSpec) {
            footerTable = clone.querySelector('table');
        } else if (isMcTable) {
            // 💡 일반/비교 표 중 실제로 보이는 쪽의 table을 찾음 (숨겨진 쪽은 높이 0이라 잘못 짚으면 안 됨)
            const compSectionEl = clone.querySelector('#mc-comparison-section');
            const isComparisonView = !!(compSectionEl && compSectionEl.style.display !== 'none');
            const activeSection = isComparisonView ? compSectionEl : (clone.querySelector('#mc-normal-section') || clone);
            footerTable = activeSection.querySelector('table');
        }
        let fixedFooterDiv = null;
        if (footerTable) {
            const footerTfoot = document.createElement('tfoot');
            footerTfoot.innerHTML = '<tr><td colspan="100" style="padding-top:2px; border:none;">'
                + '<span style="display:table-cell; width:1300px; text-align:left; font-size:13px; color:#000; font-family:\'Malgun Gothic\',sans-serif;">ⓒ Copyright ' + _pfNow.getFullYear() + ' KORTEK Corporation</span>'
                + '<span style="display:table-cell; width:1100px; text-align:right; font-size:13px; color:#000; font-family:\'Malgun Gothic\',sans-serif;">' + _pfDateStr + (_pfProjectName ? '_' + _pfProjectName : '') + '</span>'
                + '</td></tr>';
            footerTable.appendChild(footerTfoot);
        } else if (!isCalendar && isSummary) {
            // 🐛 [버그 수정] Summary는 예전에 Weekly와 같은 "position:fixed로 페이지 맨 아래(6mm)에 고정"
            //    방식을 같이 썼는데, 그 고정 위치는 박스가 JS 배율로 줄어드는 것과 전혀 무관하게 항상
            //    페이지 맨 아래에 붙어서 — 박스 하단과 푸터 사이에 빈 틈이 생기며 "박스에서 벗어나
            //    따로 떨어져 보이는" 문제가 있었다. 대신 박스(.summary-outer-box) "안쪽" 맨 끝에 그냥
            //    흐르는 요소로 넣어서, 배율 계산에도 포함되고 항상 박스 마지막 내용 바로 밑에 붙는다.
            // 🐛 [2026-08-30 버그 수정] 셀 너비를 1300px/1100px로 고정해뒀었는데, 이 박스(.summary-outer-box)의
            // 실제 렌더 폭은 fitOnePage 배율 계산이 프로젝트 내용량에 따라 매번 다르게 정하는 값이라
            // 2400px(1300+1100)와 거의 항상 어긋났다 — table-layout:fixed에서 셀의 절대 px 너비는 table
            // 자신의 width(100%)와 무관하게 그대로 유지되므로, 실제 폭이 2400px보다 좁으면 오른쪽 셀
            // (날짜_파일명)이 페이지 인쇄 영역 밖으로 밀려나 잘려 보이지 않았다. 절대 px 대신 비율(%)로
            // 바꿔서 실제 렌더 폭이 얼마든 항상 박스 안에 맞도록 수정.
            const summaryFooter = document.createElement('div');
            summaryFooter.style.cssText = 'display:table; width:100%; table-layout:fixed; box-sizing:border-box; font-size:9px; line-height:1.2; color:#000; font-family:"Malgun Gothic",sans-serif; padding-top:6px;';
            summaryFooter.innerHTML = '<span style="display:table-cell; width:54%; text-align:left;">ⓒ Copyright ' + _pfNow.getFullYear() + ' KORTEK Corporation</span>'
                + '<span style="display:table-cell; width:46%; text-align:right;">' + _pfDateStr + (_pfProjectName ? '_' + _pfProjectName : '') + '</span>';
            (clone.querySelector('.summary-outer-box') || clone).appendChild(summaryFooter);
        } else if (!isCalendar) {
            // 💡 [범용 반복 푸터 v2] 표가 없는 탭(Weekly 등)은 가짜 테이블로 감싸도 행이 1개뿐이라
            //    tfoot이 페이지마다 반복될 계기 자체가 없었음(표 안이 그냥 거대한 통짜 셀 하나라 페이지네이션이
            //    안 걸림) — 그래서 여전히 중간에 끼는 문제가 재현됨. 대신 Chrome은 인쇄 시 position:fixed
            //    요소를 매 페이지 하단에 자동으로 반복해서 그려주므로, 그 성질을 그대로 이용한다
            //    (clone 안이 아니라 printArea의 형제로 붙임 — clone 안에 넣으면 fitOnePage 축소계산에
            //    끼어들어 배율에 영향을 주므로, 페이지 하단에 고정 오버레이되는 요소는 분리해두는 게 맞음)
            fixedFooterDiv = document.createElement('div');
            fixedFooterDiv.className = 'print-fixed-footer';
            fixedFooterDiv.style.cssText = 'display:table; width:100%; table-layout:fixed; box-sizing:border-box; font-size:13px; line-height:1.2; color:#000; font-family:"Malgun Gothic",sans-serif;';
            fixedFooterDiv.innerHTML = '<span style="display:table-cell; width:1300px; text-align:left;">ⓒ Copyright ' + _pfNow.getFullYear() + ' KORTEK Corporation</span>'
                + '<span style="display:table-cell; width:1100px; text-align:right;">' + _pfDateStr + (_pfProjectName ? '_' + _pfProjectName : '') + '</span>';
        }

        printArea.appendChild(clone);
        if (fixedFooterDiv) printArea.appendChild(fixedFooterDiv);
        document.body.classList.add('tab-printing-mode');

        if (isSummary) document.body.classList.add('printing-tab-summary');
        if (isBriefSpec) document.body.classList.add('printing-tab-briefspec');
        if (isWeekly) document.body.classList.add('printing-tab-weekly');

        if (fitOnePage) {
            // 📐 탭별 실제 @page 방향에 맞는 표준 여백 기준 페이지 폭/높이(px)
            //    Brief SPEC = A4 가로(briefspecLandscapePage),
            //    Summary/Weekly Report = A4 세로(summaryPortraitPage/weeklyPortraitPage)
            // 💡 SAFETY: 실측과 실제 인쇄 렌더링 간의 미세한 오차로 경계선에서 다음 페이지로
            //    넘어가는 것을 막기 위한 여유 마진 (6% — 예전 4%에서 확대, 표 하나로 안 끝나는
            //    Summary/Weekly는 tfoot 반복 푸터를 못 써서 애초에 안 넘치는 게 더 중요함)
            // 💡 [버그 수정] Brief SPEC "펼치기" 상태는 숨겨진 행까지 다 나와 행 수가 많아지는데,
            //    이 측정은 화면(screen) CSS 기준이라 인쇄 전용(@media print) 셀 여백 축소 규칙이
            //    반영 안 된 상태로 배율을 계산한다 — 그 오차를 흡수하도록 마진을 더 크게 잡음(10%).
            const bsExpanded = isBriefSpec && window._bmExpanded && window._bmExpanded.bs;
            const SAFETY = bsExpanded ? 0.90 : 0.94;
            const pageLongMm = 297 - 20, pageShortMm = 210 - 20; // 10mm 여백 기준
            const isPortraitTab = isWeekly || isSummary;
            const pageWidthPx  = (isPortraitTab ? pageShortMm : pageLongMm) * 96 / 25.4 * SAFETY;
            const pageHeightPx = (isPortraitTab ? pageLongMm : pageShortMm) * 96 / 25.4 * SAFETY;

            printArea.style.position = 'fixed';
            printArea.style.left = '-99999px';
            printArea.style.top = '0';
            printArea.style.display = 'block';

            // 💡 Brief SPEC은 내용이 페이지보다 짧을 때도 확대해서 페이지를 꽉 채움 (Summary/Weekly는 1배율 상한 유지)
            const maxScale = isBriefSpec ? 999 : 1;

            let width = pageWidthPx;
            let scale = 1;
            for (let i = 0; i < 4; i++) {
                clone.style.zoom = 1;
                clone.style.width = width + 'px';
                const h = clone.scrollHeight;
                scale = Math.min(maxScale, pageHeightPx / h);
                width = pageWidthPx / scale;
            }

            clone.style.width = width + 'px';
            clone.style.zoom = scale;

            // 📌 안전 보정: 4회 수렴으로도 여전히 페이지(여유 마진 포함 기준)를 넘으면, 실제 렌더링
            //    높이를 다시 재서 줄이는 과정을 최대 5회 반복(예전 3회에서 확대) — 1~3회만으로는 경계
            //    근처에서 부족해서 Copyright 푸터가 다음 페이지로 밀려나는 경우가 있었음. 여유 마진
            //    (pageHeightPx)도 계속 유지하도록 기준을 통일함
            // 🐛 [2026-08-30 버그 수정] 여기서 zoom(scale)만 더 줄이고 width는 그대로 둬서, width*scale
            // (=실제로 인쇄되는 가로 폭)이 pageWidthPx보다 좁아져 내용이 페이지 왼쪽에 작게 몰리고 양옆에
            // 빈 여백이 크게 남는 문제가 있었다 — scale을 줄이는 만큼 width를 반대로 늘려서 width*scale이
            // 항상 pageWidthPx(=페이지 전체 폭)로 유지되도록 함(세로만 줄고 가로 폭은 항상 페이지를 꽉 채움).
            for (let j = 0; j < 5; j++) {
                const actualH = clone.getBoundingClientRect().height;
                if (actualH <= pageHeightPx) break;
                const factor = (pageHeightPx / actualH) * 0.98;
                scale = scale * factor;
                width = width / factor;
                clone.style.width = width + 'px';
                clone.style.zoom = scale;
            }

            printArea.style.position = '';
            printArea.style.left = '';
            printArea.style.top = '';
            printArea.style.display = '';
        }

        if (isMcTable) {
            document.body.classList.add('printing-tab-mctable');

            // 📐 A4 가로 표준 여백 기준 페이지 폭/높이(px)
            const pageWidthPx  = (297 - 20) * 96 / 25.4; // A4 가로 실측 가로폭
            const pageHeightPx = (210 - 20) * 96 / 25.4; // A4 가로 실측 세로폭

            printArea.style.position = 'fixed';
            printArea.style.left = '-99999px';
            printArea.style.top = '0';
            printArea.style.display = 'block';

            // 💡 현재 펼치기/접기 상태를 그대로 읽음 (window.mcToggleHiddenUnified가 관리하는 플래그)
            const mcExpanded = !!(window._bmExpanded && window._bmExpanded.mc);

            // 💡 일반 표/비교 표 중 "지금 실제로 보이는" 쪽 판별 — 펼침/접힘 두 분기 모두에서 공통으로 씀
            const compSectionEl = clone.querySelector('#mc-comparison-section');
            const isComparisonView = !!(compSectionEl && compSectionEl.style.display !== 'none');
            const activeSection = isComparisonView
                ? compSectionEl
                : (clone.querySelector('#mc-normal-section') || clone);

            let scale;

            if (mcExpanded) {
                // 🔼 펼침: 페이지당 40행 기준 고정 배율 (여러 페이지로 자연스럽게 이어짐)
                const TARGET_ROWS_PER_PAGE = 40;

                clone.style.zoom = 1;
                clone.style.width = pageWidthPx + 'px';

                const theadEl = activeSection.querySelector('thead');
                const rowEl = activeSection.querySelector('tbody tr');
                const theadHeight = theadEl ? theadEl.offsetHeight : 0;
                const rowHeight = rowEl ? rowEl.offsetHeight : 24;

                const budget = theadHeight + TARGET_ROWS_PER_PAGE * rowHeight;
                scale = budget > 0 ? Math.min(1, pageHeightPx / budget) : 1;

                clone.style.width = (pageWidthPx / scale) + 'px';
            } else {
                // 🔽 접힘: 전체 내용(표 + 견적 수정이력 박스 포함)을 무조건 1페이지에 맞춤
                const SAFETY = 0.96;
                const targetHeightPx = pageHeightPx * SAFETY;

                let width = pageWidthPx;
                scale = 1;
                for (let i = 0; i < 4; i++) {
                    clone.style.zoom = 1;
                    clone.style.width = width + 'px';
                    const h = clone.scrollHeight;
                    scale = Math.min(999, targetHeightPx / h);
                    width = pageWidthPx / scale;
                }
                clone.style.width = width + 'px';
            }

            // 💡 비교 표뿐 아니라 일반(R1~R5) 표도 열 너비 합계가 페이지 폭과 안 맞으면 동일하게 좁게 찍힘.
            //    <col>이든 <th>든 너비가 어디서 왔는지 상관없이, 실제 렌더링된 데이터 행(tbody tr)의
            //    셀 폭을 직접 측정해서 비례 재계산 — 배경색/글자 스타일은 전혀 건드리지 않음
            (function() {
                const activeTable = activeSection.querySelector('table');
                if (!activeTable) return;
                const cols = activeTable.querySelectorAll('colgroup col');
                const sampleRow = activeTable.querySelector('tbody tr');
                if (!cols.length || !sampleRow) return;
                const cells = sampleRow.querySelectorAll(':scope > td');
                if (cells.length !== cols.length) return; // 열/셀 개수가 안 맞으면(숨김 열 등) 손대지 않고 건너뜀
                // 💡 Note 열처럼 <col> 너비가 auto(비워짐)인 칸은 측정 시점에 폭이 0~매우 작게 잡힐 수 있음
                //    — 최소 기본값(200px)을 보장해서 비례 재계산에서 사라지지 않게 함
                const MIN_FALLBACK = 200;
                const naturalWidths = Array.from(cells).map(function(td) {
                    const w = td.getBoundingClientRect().width;
                    return (w && w > 10) ? w : MIN_FALLBACK;
                });
                const naturalSum = naturalWidths.reduce(function(a, b) { return a + b; }, 0);
                const targetWidth = pageWidthPx / scale;
                if (naturalSum <= 0) return;
                const widthScale = targetWidth / naturalSum;
                cols.forEach(function(c, i) { c.style.width = (naturalWidths[i] * widthScale) + 'px'; });
            })();

            clone.style.zoom = scale;

            printArea.style.position = '';
            printArea.style.left = '';
            printArea.style.top = '';
            printArea.style.display = '';
        }

        if (isCalendar) {
            document.body.classList.add('printing-tab-calendar');

            // 📐 A4 가로 표준 여백 기준 페이지 폭/높이(px) + 경계선 오차 방지 여유 마진
            const pageWidthPx  = (297 - 20) * 96 / 25.4;
            const pageHeightPx = (210 - 20) * 96 / 25.4;
            const SAFETY = 0.96;
            const targetW = pageWidthPx * SAFETY;
            const targetH = pageHeightPx * SAFETY;

            printArea.style.position = 'fixed';
            printArea.style.left = '-99999px';
            printArea.style.top = '0';
            printArea.style.display = 'block';

            // 💡 달마다 주 수(4~6주)가 달라 높이가 다르므로, 각 달 블록을 개별로 측정해서
            //    그 페이지에 맞는 배율을 따로 계산 (한 달 = 한 페이지)
            const monthBlocks = clone.querySelectorAll('.cal-month-block');

            // 📌 달 블록(=페이지)마다 맨 끝에 카피라이트 푸터 추가 — 블록 전체가 페이지 높이에 맞춰
            //    늘어나므로, 마지막 자식인 이 푸터는 자연스럽게 매 페이지 맨 아래에 위치하게 됨
            monthBlocks.forEach(function(block) {
                const footer = document.createElement('div');
                footer.style.cssText = 'display:table; width:100%; table-layout:fixed; box-sizing:border-box; margin-top:8px; font-size:11px; color:#000; font-family:"Malgun Gothic",sans-serif;';
                footer.innerHTML = '<span style="display:table-cell; text-align:left;">ⓒ Copyright ' + _pfNow.getFullYear() + ' KORTEK Corporation</span>'
                    + '<span style="display:table-cell; text-align:right;">' + _pfDateStr + (_pfProjectName ? '_' + _pfProjectName : '') + '</span>';
                block.appendChild(footer);
            });

            // 📌 달마다 따로 배율을 정하면 내용 적은 달이 확대되어 페이지마다 글자 크기가
            //    들쭉날쭉해짐 — 가장 내용이 많은(가장 많이 줄여야 하는) 달을 기준으로
            //    배율을 하나만 정해서 모든 페이지에 똑같이 적용
            let uniformScale = 1;
            monthBlocks.forEach(function(block) {
                let width = targetW;
                let scale = 1;
                for (let i = 0; i < 4; i++) {
                    block.style.zoom = 1;
                    block.style.width = width + 'px';
                    const h = block.scrollHeight;
                    scale = Math.min(1, targetH / h); // 여기선 확대 안 함 — 기준값 측정용
                    width = targetW / scale;
                }
                uniformScale = Math.min(uniformScale, scale);
            });
            monthBlocks.forEach(function(block) {
                block.style.width = (targetW / uniformScale) + 'px';
                block.style.zoom = uniformScale;
            });

            printArea.style.position = '';
            printArea.style.left = '';
            printArea.style.top = '';
            printArea.style.display = '';
        }

        if (isRowPagedPortrait) {
            document.body.classList.add(isAlarm ? 'printing-tab-alarm' : isNotice ? 'printing-tab-notice' : 'printing-tab-address');

            // 📐 A4 세로 표준 여백 기준 페이지 폭/높이(px)
            const pageWidthPx  = (210 - 20) * 96 / 25.4;
            const pageHeightPx = (297 - 20) * 96 / 25.4;
            const TARGET_ROWS_PER_PAGE = 40;

            printArea.style.position = 'fixed';
            printArea.style.left = '-99999px';
            printArea.style.top = '0';
            printArea.style.display = 'block';

            // 📌 폭이 바뀌면 줄바꿈이 달라져 행 높이도 변하므로, M.C Table/캘린더와 동일하게
            //    "폭 지정 → 실측 → 배율 재계산"을 4회 반복 수렴 (1회 측정의 오차 제거)
            //    + 행 높이는 첫 행 하나가 아니라 tbody 전체 평균으로, tfoot(반복 푸터) 몫도 포함
            const SAFETY = 0.96; // 경계선 오차 방지 여유 마진 (다른 탭과 동일)
            const targetHeightPx = pageHeightPx * SAFETY;

            const theadEl = clone.querySelector('thead');
            const tbodyEl = clone.querySelector('tbody');
            const tfootEl = clone.querySelector('tfoot');

            let width = pageWidthPx;
            let scale = 1;
            for (let i = 0; i < 4; i++) {
                clone.style.zoom = 1;
                clone.style.width = width + 'px';
                const theadHeight = theadEl ? theadEl.offsetHeight : 0;
                const tfootHeight = tfootEl ? tfootEl.offsetHeight : 0;
                const rowCount = tbodyEl ? tbodyEl.children.length : 0;
                const rowHeight = (tbodyEl && rowCount > 0) ? (tbodyEl.offsetHeight / rowCount) : 24;
                const budget = theadHeight + TARGET_ROWS_PER_PAGE * rowHeight + tfootHeight;
                scale = budget > 0 ? Math.min(1, targetHeightPx / budget) : 1;
                width = pageWidthPx / scale;
            }
            clone.style.width = width + 'px';
            clone.style.zoom = scale;

            printArea.style.position = '';
            printArea.style.left = '';
            printArea.style.top = '';
            printArea.style.display = '';
        }

        window.print();
    };

    // 💡 [공용화] afterprint/포커스 복귀 양쪽에서 똑같이 쓰는 정리 로직 — 인쇄 미리보기 중에만 화면에서
    //    숨겨야 하는 요소(사이드바/상단바/시트탭바 등 — CSS가 body.tab-printing-mode 기준으로 숨김)를
    //    되돌린다. 이 클래스가 body에 남아있는 한 화면 전체 chrome이 계속 안 보이므로, 정리를 놓치면
    //    안 되는 중요한 훅이다.
    window._clearPrintingModeClasses = function() {
        const printArea = document.getElementById('tab-print-area');
        if (printArea) printArea.innerHTML = '';
        document.body.classList.remove('tab-printing-mode');
        document.body.classList.remove('printing-tab-summary');
        document.body.classList.remove('printing-tab-briefspec');
        document.body.classList.remove('printing-tab-mctable');
        document.body.classList.remove('printing-tab-calendar');
        document.body.classList.remove('printing-tab-weekly');
        document.body.classList.remove('printing-tab-alarm');
        document.body.classList.remove('printing-tab-address');

        // 💡 Gantt 인쇄 전용 사본도 같이 정리 (안 지우면 다음 인쇄 때 다른 탭과 겹쳐 보임)
        const ganttPrintArea = document.getElementById('gantt-print-area');
        if (ganttPrintArea) ganttPrintArea.innerHTML = '';
        document.body.classList.remove('gantt-printing-mode');

        // 💡 AI 프로젝트 요약 인쇄 전용 사본도 함께 정리
        const aiSummaryPrintArea = document.getElementById('ai-summary-print-area');
        if (aiSummaryPrintArea) aiSummaryPrintArea.innerHTML = '';
        document.body.classList.remove('ai-summary-printing-mode');
    };
    window.addEventListener('afterprint', function() {
        setTimeout(window._clearPrintingModeClasses, 1000);
    });
    // 🐛 [버그 수정] afterprint 이벤트는 브라우저/실행 환경에 따라(인쇄창을 특정 방식으로 닫거나,
    // 원격/임베디드 브라우저인 경우 등) 아예 발생하지 않을 수 있다 — 그러면 위 정리가 영원히 안 일어나
    // body.tab-printing-mode가 그대로 남아, 사이드바·상단바·시트탭바가 화면에서 사라진 것처럼 보이는
    // 상태로 굳어버린다(새로고침 전까진 복구 불가). 안전망으로, 인쇄 대화상자가 떠 있는 동안 잃었던
    // 창 포커스가 돌아오는 시점(=인쇄창을 어떤 식으로든 닫음)에도 같은 정리를 한 번 더 시도한다.
    window.addEventListener('focus', function() {
        if (document.body.classList.contains('tab-printing-mode') || document.body.classList.contains('gantt-printing-mode') || document.body.classList.contains('ai-summary-printing-mode')) {
            setTimeout(window._clearPrintingModeClasses, 300);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 🤖 [2026-08-24 신규] AI 프로젝트 요약 리포트 — Gantt 현황(통계+지연/임박 업무+최근 변경이력)을
    //    압축해서 AI에게 넘기고, 신호등 총평/주요 리스크/담당자별 액션추천을 받아 리포트로 보여준다.
    //    메일 분석과 동일한 AI 키/제공사(window.getActiveAiKey/callAiBackend)를 그대로 재사용.
    //    "🔄 다시 생성" 버튼을 눌러야만 새로 호출(자동 재호출 없음) — 결과는 projectMeta에 캐싱해서
    //    프로젝트 저장 시 함께 보관되고, 다음에 열었을 때도 마지막 생성 결과가 그대로 남아있다.
    // ═══════════════════════════════════════════════════════════

    // 💡 [2026-08-28 신규] AI 요약/AI 문답 공용 유틸 — 날짜를 "8/26~8/27" 형태로 간결하게 표시하고
    //    (연도는 생략 — 어차피 같은 프로젝트 내 업무들이라 굳이 안 보여줘도 헷갈릴 일이 적음), 시작/계획일
    //    중 하나만 있거나 둘이 같으면 하나만 표시한다. 원본 ISO 값은 그대로 컨텍스트에 같이 남겨서
    //    (아래 taskListText 등) AI가 상대 날짜 계산(오늘/이번주 등)을 할 때는 정확한 값을 쓰게 한다.
    // 🐛 [2026-08-30 버그 수정] "이번 주 업무 요약해줘" 같은 상대 날짜 질문에 연도가 다른(작년/내년)
    // 업무까지 섞여 나오는 문제 — 원인은 이 함수가 연도를 아예 버리고 "M/D"만 만들어서, AI가 [오늘
    // 날짜](연도 포함)와 [업무 목록]의 "기간:"(연도 없음)을 비교할 때 월/일만 같으면 몇 년도 업무인지
    // 구분할 방법이 전혀 없었던 것 — 8/26이 2025년이든 2026년이든 2027년이든 AI 눈엔 똑같이 "8/26"
    // 이었음. 올해(현재 연도)와 같으면 예전처럼 "M/D"만 쓰고, 다르면 "YYYY.M/D"로 연도를 붙여
    // AI와 사람 둘 다 확실히 구분할 수 있게 한다.
    window._fmtDateRangeShort = function(startRaw, endRaw) {
        const curYear = new Date().getFullYear();
        const fmt = function(v) {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d)) return '';
            const md = (d.getMonth() + 1) + '/' + d.getDate();
            return d.getFullYear() === curYear ? md : (d.getFullYear() + '.' + md);
        };
        const s = fmt(startRaw), e = fmt(endRaw);
        if (s && e) return s === e ? s : (s + '~' + e);
        return s || e || '';
    };

    // 💡 [2026-08-28 신규] "담당자/발신인/수신인 기준으로 검색해줘" 요청에 AI가 답을 못 하던 문제 수정 —
    //    AI 요약/AI 문답 컨텍스트에는 담당자(assignee)만 있고 발신인/수신인은 아예 없었다. 발신인/수신인은
    //    별도 컬럼이 아니라 메일 자동등록 업무의 "상세내용" 첫 줄에 남는 [발신자→수신자] 태그에서 추출해야
    //    하는데(🔔 알람 탭이 발송 대상을 정할 때 쓰는 것과 동일한 패턴 — window._addrSplitNames 재사용),
    //    이 추출을 AI용 컨텍스트에서는 아예 하지 않고 있었다. 태그가 없는 수동 입력 업무는 { sender:'',
    //    receiver:'' }를 반환(호출부에서 표시를 생략).
    window._extractMailSenderReceiver = function(contentRaw) {
        const raw = String(contentRaw || '');
        const arrowMatch = raw.match(/\[([^\]→]+)→((?:\[[^\]]*\]|[^\]])+)\]/);
        if (!arrowMatch) return { sender: '', receiver: '' };
        const stripTag = function(s) { return String(s || '').trim().replace(/^\[[^\]]*\]\s*/, ''); };
        const senderNames = window._addrSplitNames ? window._addrSplitNames(stripTag(arrowMatch[1])) : [stripTag(arrowMatch[1])];
        const receiverNames = window._addrSplitNames ? window._addrSplitNames(stripTag(arrowMatch[2])) : [stripTag(arrowMatch[2])];
        return { sender: senderNames.filter(Boolean).join(', '), receiver: receiverNames.filter(Boolean).join(', ') };
    };

    // 💡 Gantt 원본 전체를 던지지 않고, AI가 판단하기 좋은 형태로 통계+목록만 추려서 압축
    window._buildProjectSummaryData = function() {
        // 🐛 [2026-08-30 버그 수정] "프로젝트 정보를 수정/저장했는데도 AI가 기존 정보를 그대로 쓴다"는
        // 지적의 실제 원인 — Summary 탭의 입력칸(프로젝트 개요/고객사/담당자/마일스톤 등)은 타이핑하는
        // 즉시 window.projectMeta/window.tabData.summary에 반영되는 게 아니라, collectTabData()가
        // 화면의 <input> 값을 실제로 "긁어올" 때만 반영된다(collectAlarmItems 등 다른 기능은 이미 이걸
        // 먼저 호출하고 있었는데, AI 요약/문답 컨텍스트만 빠져 있었음). 그래서 최근에 고친 값이 아직
        // 한 번도 collectTabData()를 거치지 않은 시점(예: 다른 조작 없이 바로 AI 요약을 다시 생성)에는
        // 화면엔 새 값이 보여도 AI에게 넘어가는 pm/tabData.summary는 예전 값 그대로였다. 매번 최신
        // 화면 값을 반영하도록 여기서 직접 한 번 호출한다(저장 여부와 무관하게 항상 최신 상태 보장).
        if (window.collectTabData) window.collectTabData();
        const pm = window.projectMeta || {};
        // 💡 [2026-08-28 신규] "#98 업무로 이동" 클릭 기능을 AI 요약에서도 쓰려면 리스크/액션추천이
        //    가리키는 업무의 원래 globalData 인덱스를 알아야 한다 — filter로 빠지는 행이 있어 slice
        //    순서만으론 복원 불가하므로, AI 문답 컨텍스트(_buildGanttQaContext)와 동일하게 filter 전에
        //    원래 인덱스(idx)를 먼저 붙여둔다.
        const rows = (typeof globalData !== 'undefined' && globalData)
            ? globalData.map(function(r, i) { return { row: r, idx: i }; }).slice(1).filter(function(x) { return x.row && x.row._level !== undefined; })
            : [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const koMap = (typeof LANG !== 'undefined' && LANG.ko && LANG.ko.statusMap) ? LANG.ko.statusMap : {};

        const normStatus = function(raw) {
            const s = (raw || '').toString().trim();
            if (!s) return '(미지정)';
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

        const counts = { 완료: 0, 진행: 0, 대기: 0, 지연: 0 };
        const delayed = [];
        const dueSoon = [];

        rows.forEach(function(x) {
            const row = x.row;
            const st = normStatus(colIdx.status !== -1 ? row[colIdx.status] : '');
            if (counts[st] !== undefined) counts[st]++; else counts.대기++; // 알 수 없는 상태값은 대기로 편입(집계 누락 방지)

            if (st === '완료') return;
            const planRaw = (colIdx.plan !== -1 && row[colIdx.plan]) ? row[colIdx.plan] : (row._calcPlanTs ? formatTsToYMD(row._calcPlanTs) : '');
            if (!planRaw) return;
            const planDate = new Date(planRaw);
            if (isNaN(planDate)) return;
            planDate.setHours(0, 0, 0, 0);
            const diffDays = Math.round((planDate - today) / 86400000);
            const label = taskLabel(row) || '(제목없음)';
            const assignee = (colIdx.assignee !== -1 && row[colIdx.assignee]) ? row[colIdx.assignee] : '미지정';
            // 💡 [2026-08-28 신규] 시작일도 같이 담아서 "8/26~8/27"처럼 기간으로 보여줄 수 있게 함(기존엔
            //    마감일만 있어서 기간이 아니라 마감일 하루만 알 수 있었음). window._fmtDateRangeShort 참고.
            const startRaw = (colIdx.start !== -1 && row[colIdx.start]) ? row[colIdx.start] : (row._calcStartTs ? formatTsToYMD(row._calcStartTs) : '');
            // 💡 [버그 수정] 지연/임박 업무 목록에 업무명·담당자·날짜만 담고 "무슨 이슈인지"(상세내용)는
            //    아예 안 넣고 있었음 — AI 문답에서 발견된 것과 똑같은 원인으로, AI 요약의 리스크/액션추천도
            //    실제 내용을 못 보고 업무명만 보고 짐작해서 만든 것이라 부실할 수 있었음. 같은 설정값
            //    ([🤖 AI 도구 > ⚙️ 설정])으로 상세내용/답변을 함께 담아줌.
            const _psMaxLen = window.getAiContentMaxLen ? window.getAiContentMaxLen() : 500;
            const detail = (colIdx.content !== -1 && row[colIdx.content]) ? String(row[colIdx.content]).replace(/\s+/g, ' ').trim().slice(0, _psMaxLen) : '';
            const detailAnswer = (colIdx.answer !== -1 && row[colIdx.answer]) ? String(row[colIdx.answer]).replace(/\s+/g, ' ').trim().slice(0, _psMaxLen) : '';
            // 💡 [2026-08-28 신규] "담당자/발신인/수신인 기준으로 검색해줘"에 답 못하던 문제 수정 —
            //    window._extractMailSenderReceiver 참고.
            const mailPeople = window._extractMailSenderReceiver(colIdx.content !== -1 ? row[colIdx.content] : '');
            // 💡 [2026-08-28 신규] "원문 메일도 봐달라"는 요청에 AI 요약도 못 읽던 문제 수정 — 지연/임박
            //    목록은 이미 최대 15+15건으로 제한돼 있어(아래 return의 slice(0,15)), 상세내용/답변과
            //    같은 글자수 한도로 원문 메일(_mailRaw) 발췌를 같이 담아도 프롬프트가 과도하게 커지지 않는다.
            //    (AI 문답처럼 300건 전체를 훑는 목록이 아니라서, 여기서는 [원문有] 표시 대신 발췌를 바로 포함.)
            const mailExcerpt = row._mailRaw ? String((row._mailRaw.body2000 || '')).replace(/\s+/g, ' ').trim().slice(0, _psMaxLen) : '';
            if (diffDays < 0) {
                delayed.push({ idx: x.idx, task: label, assignee: assignee, startDate: startRaw, dueDate: planRaw, overdueDays: -diffDays, detail: detail, detailAnswer: detailAnswer, mailExcerpt: mailExcerpt, sender: mailPeople.sender, receiver: mailPeople.receiver });
            } else if (diffDays <= 7) {
                dueSoon.push({ idx: x.idx, task: label, assignee: assignee, startDate: startRaw, dueDate: planRaw, dDay: diffDays, detail: detail, detailAnswer: detailAnswer, mailExcerpt: mailExcerpt, sender: mailPeople.sender, receiver: mailPeople.receiver });
            }
        });

        delayed.sort(function(a, b) { return b.overdueDays - a.overdueDays; });
        dueSoon.sort(function(a, b) { return a.dDay - b.dDay; });

        const recentLogs = (window.changeLogs || []).slice(-15).reverse().map(function(l) {
            return `${l.time} ${l.userName} — ${l.rowName}/${l.colName}: ${l.oldVal} → ${l.newVal}`;
        });

        return {
            project: { customer: pm.고객사 || '', model: pm.고객모델명 || '', pm: pm.프로젝트담당자 || '' },
            totalTasks: rows.length,
            counts: counts,
            delayed: delayed.slice(0, 15),
            dueSoon: dueSoon.slice(0, 15),
            recentLogs: recentLogs
        };
    };

    // 💡 위 데이터를 AI 프롬프트로 변환 — 파싱 안정성을 위해 구조화된 JSON으로만 답하도록 명시적으로 요청
    // 💡 [2026-08-24 신규] 메일분석 프롬프트(getSystemPrompt/_msBuildDefaultPrompt)와 완전히 동일한
    //    트릭 재사용: 진짜 파라미터로 부르면 진짜 프롬프트가 나오고, 플레이스홀더 "문자열"을 그대로
    //    파라미터 자리에 넣어서 부르면 그 문자열이 그대로 본문에 박힌 "편집용 템플릿"이 나온다.
    //    한 함수로 "실제 프롬프트 생성"과 "편집 기본값 생성"을 둘 다 해결.
    window._buildProjectSummaryPromptFromData = function(customer, model, pm, totalTasks, countDone, countProgress, countPending, countDelay, delayedList, dueSoonList, recentLogs) {
        return `당신은 프로젝트 관리 보조 AI입니다. 아래 Gantt 프로젝트 현황 데이터를 보고, 실무자가 한눈에 파악할 수 있는 간단한 프로젝트 분석 보고서를 작성하세요.

[프로젝트] ${customer} ${model} (PM: ${pm})
[전체 업무 수] ${totalTasks}건 — 완료 ${countDone} / 진행 ${countProgress} / 대기 ${countPending} / 지연 ${countDelay}

[지연 업무 목록]
${delayedList}

[임박 마감(D-7 이내) 목록]
${dueSoonList}

[최근 변경 이력]
${recentLogs}

다음 JSON 형식으로만 답하세요 (다른 텍스트 없이 JSON만):
{
  "신호등": "🟢 또는 🟡 또는 🔴 (전체 지연 비율과 심각도 기준으로 판단)",
  "총평": "한 문장 총평",
  "리스크": ["#98 업무는 ~해서 위험함(왜 위험한지 포함)", "리스크2", "리스크3"],
  "액션추천": ["담당자명: #98 업무를 ~하세요", "담당자명: 추천 행동"]
}
리스크/액션추천은 최대 5개씩, 근거가 부족하면 빈 배열([])로 두세요.
📌 특정 업무를 가리킬 때는 위 [지연 업무 목록]/[임박 마감 목록]의 각 줄 맨 앞에 있는 "#숫자"를 반드시 그대로 포함해서 언급하세요(예: "#98 업무는..."). 이 번호를 클릭하면 실제 업무로 이동하는 기능이 있으니, 번호 없이 업무명만 쓰지 마세요.
총평/리스크/액션추천에서 특정 업무의 일정을 언급할 때는 위 목록의 "기간:" 표시(예: 8/26~8/27)를 그대로 쓰세요. YYYY-MM-DD로 풀어쓰지 마세요.`;
    };

    // 💡 코드 기본값(진짜 로직) — "🔄 기본값으로 초기화" 버튼이 참조. localStorage 상태와 무관하게
    //    항상 이 값이 "진짜 코드 기본 템플릿"임(자기순환 방지, getSystemPrompt와 동일한 이유).
    window._defaultProjectSummaryPromptTemplate = window._buildProjectSummaryPromptFromData(
        '${customer}', '${model}', '${pm}', '${totalTasks}', '${countDone}', '${countProgress}', '${countPending}', '${countDelay}', '${delayedList}', '${dueSoonList}', '${recentLogs}'
    );

    // 💡 실제 사용 지점 — localStorage에 팀원이 고쳐둔 프롬프트가 있으면 그걸 쓰고(플레이스홀더만
    //    실값으로 치환), 없으면 코드 기본 템플릿을 그대로 씀. getSystemPrompt와 동일 패턴.
    window._buildProjectSummaryPrompt = function(d) {
        // 💡 [버그 수정] 업무명·날짜만 넣고 상세내용은 안 보여줘서, AI가 "왜 위험한지" 실제 이유를
        //    모른 채 리스크/액션추천을 지어내야 했음 — detail(상세내용)/detailAnswer(답변)가 있으면 같이 붙임.
        // 💡 [2026-08-28 신규] 마감일 하루만 보여주던 것을 "8/26~8/27"처럼 시작~마감 기간으로 표시
        //    (window._fmtDateRangeShort). 발신인/수신인도 있으면 같이 붙여서 그 기준 검색/필터 질문에
        //    답할 수 있게 함(window._extractMailSenderReceiver 결과).
        const delayedText = d.delayed.length
            ? d.delayed.map(function(x) {
                const range = window._fmtDateRangeShort(x.startDate, x.dueDate) || x.dueDate;
                let line = `- #G${x.idx} ${x.task} (담당:${x.assignee}, 기간:${range}, ${x.overdueDays}일 지연)`;
                if (x.sender) line += ` | 발신:${x.sender}`;
                if (x.receiver) line += ` | 수신:${x.receiver}`;
                if (x.detail) line += ` | 내용:${x.detail}`;
                if (x.detailAnswer) line += ` | 대응:${x.detailAnswer}`;
                if (x.mailExcerpt) line += ` | 원문메일:${x.mailExcerpt}`;
                return line;
            }).join('\n')
            : '(없음)';
        const dueSoonText = d.dueSoon.length
            ? d.dueSoon.map(function(x) {
                const range = window._fmtDateRangeShort(x.startDate, x.dueDate) || x.dueDate;
                let line = `- #G${x.idx} ${x.task} (담당:${x.assignee}, 기간:${range}, D-${x.dDay})`;
                if (x.sender) line += ` | 발신:${x.sender}`;
                if (x.receiver) line += ` | 수신:${x.receiver}`;
                if (x.detail) line += ` | 내용:${x.detail}`;
                if (x.detailAnswer) line += ` | 대응:${x.detailAnswer}`;
                if (x.mailExcerpt) line += ` | 원문메일:${x.mailExcerpt}`;
                return line;
            }).join('\n')
            : '(없음)';
        const logsText = d.recentLogs.length ? d.recentLogs.join('\n') : '(없음)';

        const savedPrompt = localStorage.getItem('gantt_project_summary_prompt');
        const template = savedPrompt || window._defaultProjectSummaryPromptTemplate;
        // 💡 [버그 수정] String.replace(문자열, ...)은 첫 번째로 매치되는 자리만 치환한다 — 사용자가
        //    편집한 프롬프트에서 같은 플레이스홀더(예: ${customer})를 두 번 이상 쓰면, 첫 자리만 실값으로
        //    바뀌고 나머지는 "${customer}" 글자 그대로 AI에게 전달되어 "수정했는데 반영이 안 되는" 것처럼
        //    보이는 원인이 됨. replaceAll로 모든 자리를 치환하도록 수정. 치환값에 "$"가 들어있어도
        //    특수 치환 패턴으로 오인되지 않도록 함수형 replacer를 사용.
        const rep = function(str, token, value) {
            return str.split(token).join(String(value));
        };
        // 🐛 [2026-08-31 버그 수정] "프롬프트에 ${todayDate}를 넣었는데 반영이 안 된다" — 원래 이 프롬프트
        // (AI 요약)에는 오늘 날짜를 알려주는 기능 자체가 없었다(AI 문답 쪽 프롬프트에만 있었음). 그래서
        // 사용자가 직접 프롬프트를 고쳐 "${todayDate}" 자리를 만들어도, 아래 rep() 목록에 그 토큰이
        // 없어서 치환되지 않고 "${todayDate}"라는 글자 그대로 AI에게 전달되고 있었다 — AI가 "기간 집중
        // 분석"을 하려 해도 기준일 자체를 모르니 제대로 판단할 수 없었을 것이다. 이제 이 프롬프트도
        // 오늘 날짜를 지원한다.
        const todayDate = (function() { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); })();
        let result = template;
        result = rep(result, '${todayDate}', todayDate);
        result = rep(result, '${customer}', d.project.customer || '');
        result = rep(result, '${model}', d.project.model || '');
        result = rep(result, '${pm}', d.project.pm || '미지정');
        result = rep(result, '${totalTasks}', d.totalTasks);
        result = rep(result, '${countDone}', d.counts.완료);
        result = rep(result, '${countProgress}', d.counts.진행);
        result = rep(result, '${countPending}', d.counts.대기);
        result = rep(result, '${countDelay}', d.counts.지연);
        result = rep(result, '${delayedList}', delayedText);
        result = rep(result, '${dueSoonList}', dueSoonText);
        result = rep(result, '${recentLogs}', logsText);
        return result;
    };

    // 💡 실제 생성 실행 — 결과는 projectMeta.aiSummaryReport에 캐싱(프로젝트 저장 시 함께 보관됨)
    window.generateAiProjectSummary = async function() {
        const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!apiKey) { alert('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.'); return; }

        const btn = document.getElementById('ai-summary-generate-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 생성 중...'; }

        try {
            const data = window._buildProjectSummaryData();
            const prompt = window._buildProjectSummaryPrompt(data);
            const result = await window.callAiBackend(apiKey, prompt, {});
            if (!result.ok) throw result.error || new Error('알 수 없는 오류');

            const text = (result.data.result && result.data.result.candidates && result.data.result.candidates[0]
                && result.data.result.candidates[0].content && result.data.result.candidates[0].content.parts
                && result.data.result.candidates[0].content.parts[0] && result.data.result.candidates[0].content.parts[0].text) || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
            const parsed = JSON.parse(match[0]);

            window.projectMeta = window.projectMeta || {};
            window.projectMeta.aiSummaryReport = {
                신호등: parsed.신호등 || '🟡',
                총평: parsed.총평 || '',
                // 🐛 [2026-08-31 버그 수정] "프롬프트에 '업무 요약' 항목을 추가했는데 안 나온다" — 원래
                // 이 앱의 JSON 응답 형식은 4개 키(신호등/총평/리스크/액션추천)만 읽도록 고정되어 있어서,
                // 사용자가 프롬프트를 고쳐 AI에게 "업무 요약"이라는 5번째 항목을 추가로 요청해도 AI가
                // 실제로 그 내용을 응답에 포함시켰든 안 시켰든 여기서 아예 안 읽고 버리고 있었다(다른
                // 필드처럼 파싱해서 저장해야 화면에도 그려짐). 커스텀 프롬프트가 없는 사람에겐 이 키가
                // 원래 없으므로 빈 배열로 저장되고, 그 경우 아래 렌더링에서 이 섹션 자체가 안 보인다.
                업무요약: Array.isArray(parsed['업무 요약']) ? parsed['업무 요약'] : [],
                리스크: Array.isArray(parsed.리스크) ? parsed.리스크 : [],
                액션추천: Array.isArray(parsed.액션추천) ? parsed.액션추천 : [],
                generatedAt: new Date().toISOString(),
                dataSnapshot: data // 재생성 없이도 통계 숫자를 그대로 다시 보여줄 수 있게 같이 보관
            };
            window._renderAiProjectSummaryBody();
            if (window.showToast) window.showToast('🤖 AI 프로젝트 요약을 생성했습니다.', 'info');
        } catch (e) {
            alert('⚠️ AI 요약 생성 실패: ' + (e && e.message ? e.message : e));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 다시 생성'; }
        }
    };

    window._renderAiProjectSummaryBody = function() {
        const body = document.getElementById('ai-summary-body');
        if (!body) return;
        const r = (window.projectMeta || {}).aiSummaryReport;
        if (!r) {
            body.innerHTML = '<div style="padding:36px 10px; text-align:center; color:#999; font-size:12px;">아직 생성한 요약이 없습니다.<br>아래 [🔄 다시 생성] 버튼을 눌러 AI 요약을 만들어보세요.</div>';
            return;
        }
        const d = r.dataSnapshot || { counts: {} };
        const genDate = new Date(r.generatedAt);
        const genStr = isNaN(genDate) ? '' : `${genDate.getFullYear()}-${String(genDate.getMonth() + 1).padStart(2, '0')}-${String(genDate.getDate()).padStart(2, '0')} ${String(genDate.getHours()).padStart(2, '0')}:${String(genDate.getMinutes()).padStart(2, '0')}`;

        // 💡 [2026-08-28 신규] 리스크/액션추천/총평에 AI가 적어주는 "#98"을 클릭하면 그 업무로 이동할 수
        //    있게 링크로 바꿔준다(window._linkifyTaskRefs — AI 문답 채팅창과 공용 로직).
        const riskHtml = (r.리스크 && r.리스크.length)
            ? '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.리스크.map(function(x) { return `<li style="margin-bottom:4px;">${window._linkifyTaskRefs(escapeHtml(x))}</li>`; }).join('') + '</ul>'
            : '<div style="color:#999; font-size:12px;">특별한 리스크가 감지되지 않았습니다.</div>';
        const actionHtml = (r.액션추천 && r.액션추천.length)
            ? '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.액션추천.map(function(x) { return `<li style="margin-bottom:4px;">${window._linkifyTaskRefs(escapeHtml(x))}</li>`; }).join('') + '</ul>'
            : '<div style="color:#999; font-size:12px;">추천 액션이 없습니다.</div>';
        // 💡 [2026-08-31 신규] "업무 요약" — 기본 프롬프트엔 없는 선택적 항목이라, 커스텀 프롬프트를
        // 안 쓰는 사람에겐 이 값이 항상 빈 배열이다. 그런 경우 리스크/액션추천처럼 "없습니다" 문구를
        // 굳이 보여주지 않고 섹션 자체를 통째로 생략한다(안 쓰는 기능이 빈 칸으로 계속 보이면 어색함).
        const taskSummaryHtml = (r.업무요약 && r.업무요약.length)
            ? '<div style="margin-bottom:14px;"><div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">📋 업무 요약</div>'
                + '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.업무요약.map(function(x) { return `<li style="margin-bottom:4px;">${window._linkifyTaskRefs(escapeHtml(x))}</li>`; }).join('') + '</ul></div>'
            : '';

        body.innerHTML = `
        <div id="ai-summary-report-content">
            <div style="font-size:11px; color:#999; margin-bottom:12px;">생성 시각: ${genStr}</div>
            <div style="display:flex; align-items:center; gap:10px; padding:14px; background:#f8f9fa; border-radius:8px; margin-bottom:14px;">
                <span style="font-size:28px;">${r.신호등 || '🟡'}</span>
                <span style="font-size:13px; font-weight:bold; color:#333;">${window._linkifyTaskRefs(escapeHtml(r.총평 || ''))}</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; text-align:center; font-size:12px;">
                <div style="padding:8px; background:#e7f6ec; border-radius:6px;"><b style="font-size:16px; color:#2f9e44;">${d.counts.완료 || 0}</b><br>완료</div>
                <div style="padding:8px; background:#eef3f7; border-radius:6px;"><b style="font-size:16px; color:#1971c2;">${d.counts.진행 || 0}</b><br>진행</div>
                <div style="padding:8px; background:#fff8e6; border-radius:6px;"><b style="font-size:16px; color:#b85c00;">${d.counts.대기 || 0}</b><br>대기</div>
                <div style="padding:8px; background:#ffe3e3; border-radius:6px;"><b style="font-size:16px; color:#e03131;">${d.counts.지연 || 0}</b><br>지연</div>
            </div>
            ${taskSummaryHtml}
            <div style="margin-bottom:14px;">
                <div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">⚠️ 주요 리스크</div>
                ${riskHtml}
            </div>
            <div>
                <div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">✅ 담당자별 액션 추천</div>
                ${actionHtml}
            </div>
        </div>
        <div id="ai-summary-feedback-block" style="margin-top:14px; padding:10px 12px; background:#f8f9fa; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; color:#888;">AI 분석 결과가 도움이 되었나요?</span>
                <div>
                    <button onclick="window.saveProjectSummaryFeedback('good')" id="ps-fb-good-btn"
                        onmouseover="if(!this.dataset.active) this.style.background='#c9ecd3';" onmouseout="if(!this.dataset.active) this.style.background='#e6f6ea';"
                        style="font-size:12px; padding:3px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; font-weight:bold; cursor:pointer; margin-right:4px; transition:background .15s;">
                        👍 좋음
                    </button>
                    <button onclick="window.saveProjectSummaryFeedback('bad')" id="ps-fb-bad-btn"
                        onmouseover="if(!this.dataset.active) this.style.background='#f5c2bd';" onmouseout="if(!this.dataset.active) this.style.background='#fbe4e2';"
                        style="font-size:12px; padding:3px 12px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:5px; font-weight:bold; cursor:pointer; transition:background .15s;">
                        👎 나쁨
                    </button>
                </div>
            </div>
            <div id="ps-fb-improve-trigger-row" style="display:none; margin-top:8px; text-align:right;">
                <button onclick="window.openPsImproveCommentModal()"
                    onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';"
                    style="font-size:12px; padding:5px 14px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">
                    💡 의견 남기고 AI 개선 요청
                </button>
            </div>
        </div>`;
    };

    window.openAiProjectSummaryModal = function() {
        let modal = document.getElementById('ai-summary-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-summary-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-summary-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:360px;">
                <div id="ai-summary-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 프로젝트 요약</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.openProjectSummaryPromptModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="이 리포트를 만들 때 AI에게 보내는 프롬프트(지시문)를 팀 공용으로 편집합니다" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">✏️ 프롬프트</button>
                        <button onclick="document.getElementById('ai-summary-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                    </div>
                </div>
                <div id="ai-summary-body" style="overflow-y:auto; flex:1; padding:16px 18px;"></div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px;">
                    <button id="ai-summary-generate-btn" onclick="window.generateAiProjectSummary()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🔄 다시 생성</button>
                    <button onclick="window.printAiProjectSummary()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:8px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🖨️ PDF</button>
                    <button onclick="window.exportAiProjectSummaryPPT()" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">📊 PPT</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ai-summary-box', 'ai-summary-drag');
            window._bindClickToFront('ai-summary-modal');
        }
        window._renderAiProjectSummaryBody();
        modal.style.display = 'block';
        window.bringModalToFront('ai-summary-modal');
    };

    // 💡 [2026-08-24 신규] "✏️ 프롬프트" 편집 모달 — 메일분석 프롬프트 편집(✏️ 프롬프트 탭)과 동일한
    //    저장/초기화 개념을 작은 모달로 옮긴 버전. 팀 공용(Drive)으로 저장되어 여러 명이 이어서
    //    다듬을 수 있고, 저장한 즉시 로컬(localStorage)에도 반영되어 바로 다음 "다시 생성"부터 적용됨.
    window.openProjectSummaryPromptModal = async function() {
        let modal = document.getElementById('ai-summary-prompt-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-summary-prompt-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-summary-prompt-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="ai-summary-prompt-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ AI 프로젝트 요약 — 프롬프트 편집</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.showPsPromptLogs()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">🕒 이력</button>
                        <button onclick="document.getElementById('ai-summary-prompt-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                    </div>
                </div>
                <div id="ai-summary-prompt-notice" style="margin:10px 18px 0; padding:8px 12px; font-size:11px; color:#495057; background:#eef3f8; border-radius:6px; line-height:1.5;"></div>
                <div id="ai-summary-prompt-meta" style="padding:4px 18px 0; font-size:10.5px; color:#aaa;"></div>
                <div style="flex:1; padding:10px 18px; overflow:hidden; display:flex; flex-direction:column;">
                    <textarea id="ai-summary-prompt-textarea" readonly style="flex:1; width:100%; resize:none; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:12px; font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic'; line-height:1.5; background:#f8f9fa; color:#555;"></textarea>
                    <input id="ai-summary-save-memo" type="text" maxlength="40" placeholder="💬 이번 저장 메모 (선택, 예: 우선순위 점수 필드 추가 v1)"
                        style="display:none; width:100%; margin-top:8px; padding:7px 10px; border:1px solid #ced4da; border-radius:6px; font-size:12px; box-sizing:border-box; flex-shrink:0;">
                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="ai-summary-unlock-btn" onclick="window.unlockPsPrompt()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="비밀번호 필요" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔒 수정하기</button>
                    <button id="ai-summary-save-btn" onclick="window.saveProjectSummaryPromptFromModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">💾 저장</button>
                    <button id="ai-summary-reset-btn" onclick="window.resetProjectSummaryPromptInModal()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; min-width:120px; padding:8px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">🔄 기본값으로 초기화</button>
                    <button onclick="window.triggerProjectSummaryPromptImprove('batch')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" title="쌓인 👎 피드백 케이스를 모아 한 번에 프롬프트 개선" style="flex:1; min-width:120px; padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🤖 일괄개선</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ai-summary-prompt-box', 'ai-summary-prompt-drag');
            window._bindClickToFront('ai-summary-prompt-modal');
        }

        // 💡 열 때마다 팀 공용(Drive) 최신본을 한 번 받아와서 로컬 캐시를 최신 상태로 맞춘 뒤 표시
        if (window.isDriveConnected && window.loadProjectSummaryPromptFromDrive) {
            await window.loadProjectSummaryPromptFromDrive();
        }
        const current = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        document.getElementById('ai-summary-prompt-textarea').value = current;
        const meta = window._projectSummaryPromptDriveMeta;
        const metaEl = document.getElementById('ai-summary-prompt-meta');
        if (metaEl) metaEl.textContent = (meta && meta.updatedBy) ? `마지막 수정: ${meta.updatedBy} · ${meta.updatedAt}` : '';

        // 💡 [2026-08-27] "AI 분석 프롬프트"(메일분석) 편집창과 UI/동작 통일 — 팀 공용 프롬프트를
        //    아무나 바로 고칠 수 있던 것을, 저쪽처럼 관리자 비밀번호로 잠가서 열 때마다 잠금 상태로
        //    초기화함 (실수로 팀 공용 프롬프트를 건드리는 걸 방지).
        document.getElementById('ai-summary-prompt-textarea').readOnly = true;
        document.getElementById('ai-summary-prompt-textarea').style.background = '#f8f9fa';
        document.getElementById('ai-summary-prompt-textarea').style.color = '#555';
        document.getElementById('ai-summary-unlock-btn').style.display = 'block';
        document.getElementById('ai-summary-save-btn').style.display = 'none';
        document.getElementById('ai-summary-reset-btn').style.display = 'none';
        const memoEl0 = document.getElementById('ai-summary-save-memo');
        if (memoEl0) memoEl0.style.display = 'none';
        const notice = document.getElementById('ai-summary-prompt-notice');
        notice.style.background = '#eef3f8';
        notice.style.color = '#495057';
        notice.textContent = window.isDriveConnected
            ? '💡 팀 공용(드라이브) 프롬프트입니다. 수정하려면 관리자 비밀번호가 필요합니다.'
            : '⚠️ 구글 드라이브 미연동 상태 — 이 PC에만 저장되며 팀과 공유되지 않습니다. 수정하려면 관리자 비밀번호가 필요합니다.';

        modal.style.display = 'block';
        window.bringModalToFront('ai-summary-prompt-modal');
    };

    // 💡 [2026-08-27] "AI 분석 프롬프트"의 unlockPrompt()와 동일한 잠금 해제 흐름 — 관리자 비밀번호
    //    확인 후에만 편집 가능해짐. 안내 문구는 이 프롬프트에서 실제로 쓰이는 변수(customer/delayedList
    //    등)로 바꿔서 보여줌.
    window.unlockPsPrompt = function() {
        const success = verifyAdminPassword('🔒 프롬프트 수정을 위해 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)');
        if (!success) { alert('❌ 비밀번호 인증 실패. 프롬프트 수정이 취소되었습니다.'); return; }

        document.getElementById('ai-summary-prompt-textarea').readOnly = false;
        document.getElementById('ai-summary-prompt-textarea').style.background = '#fffde7';
        document.getElementById('ai-summary-prompt-textarea').style.color = '#333';
        document.getElementById('ai-summary-unlock-btn').style.display = 'none';
        document.getElementById('ai-summary-save-btn').style.display = 'block';
        const memoEl = document.getElementById('ai-summary-save-memo');
        if (memoEl) memoEl.style.display = 'block';
        document.getElementById('ai-summary-reset-btn').style.display = 'block';
        const notice = document.getElementById('ai-summary-prompt-notice');
        notice.textContent = '✏️ 프롬프트를 자유롭게 수정하세요. ${customer}, ${delayedList} 등 변수는 그대로 유지하세요.';
        notice.style.color = '#0056b3';
        notice.style.background = '#e7f1ff';
    };

    // 💡 [2026-08-24 신규] 프롬프트 버전 전체 텍스트 스냅샷 저장(복원용) — 메일분석 프롬프트의
    //    savePromptVersionSnapshot과 완전히 동일한 패턴. 이 기능엔 지금까지 이력 저장이 아예 없었음
    //    (AI 개선 채택 시 버전 번호만 올라가고 실제 변경 이력/복원 기능은 빠져 있었음).
    window.savePsPromptVersionSnapshot = function(promptText, note) {
        window._projectSummaryPromptVersion = (window._projectSummaryPromptVersion || 1);
        let versions = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_versions') || '[]');
        versions.push({
            version: window._projectSummaryPromptVersion,
            time: new Date().toLocaleString('ko-KR'),
            userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + (note ? ' (' + note + ')' : ''),
            prompt: promptText
        });
        if (versions.length > 20) versions = versions.slice(-20);
        localStorage.setItem('gantt_project_summary_prompt_versions', JSON.stringify(versions));
    };

    window.saveProjectSummaryPromptFromModal = async function() {
        const text = document.getElementById('ai-summary-prompt-textarea').value.trim();
        if (!text) { alert('프롬프트 내용이 비어있습니다.'); return; }

        // ✅ 변경 이력 저장 (메일분석 프롬프트 편집과 동일한 이력 기능)
        const oldPrompt = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        if (oldPrompt !== text) {
            let logs = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_logs') || '[]');
            logs.push({
                time: new Date().toLocaleString('ko-KR'),
                userName: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
                newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
            });
            if (logs.length > 20) logs = logs.slice(-20);
            localStorage.setItem('gantt_project_summary_prompt_logs', JSON.stringify(logs));

            window._projectSummaryPromptVersion = (window._projectSummaryPromptVersion || 1) + 1;
            localStorage.setItem('gantt_project_summary_prompt_version', String(window._projectSummaryPromptVersion));
            // 💡 "AI 분석 프롬프트"와 동일하게 저장 메모(선택 입력)를 이력에 함께 남김
            const memoEl = document.getElementById('ai-summary-save-memo');
            const memo = memoEl && memoEl.value.trim() ? ': ' + memoEl.value.trim() : '';
            window.savePsPromptVersionSnapshot(text, '수동 저장 v' + window._projectSummaryPromptVersion + memo);
            if (memoEl) memoEl.value = ''; // 다음 저장을 위해 비워둠
        }

        localStorage.setItem('gantt_project_summary_prompt', text);
        // 💡 드라이브 미연동/업로드 실패 시 "아직 못 올린 로컬 변경"으로 표시 — 나중에 드라이브가
        //    연결됐을 때 loadProjectSummaryPromptFromDrive()가 옛 버전으로 덮어쓰지 않고 먼저 올리게 함
        if (window.isDriveConnected && window.saveProjectSummaryPromptToDrive) {
            const ok = await window.saveProjectSummaryPromptToDrive(text);
            if (ok) localStorage.removeItem('gantt_project_summary_prompt_pending_push');
            else localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
            if (window.showToast) window.showToast(ok ? '✏️ 프롬프트를 팀 공용으로 저장했습니다.' : '⚠️ 로컬엔 저장됐지만 팀 공용(Drive) 저장은 실패했습니다.', ok ? 'info' : 'error');
        } else {
            localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
            if (window.showToast) window.showToast('✏️ 이 PC에만 저장했습니다 (Drive 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다).', 'info');
        }
    };

    window.resetProjectSummaryPromptInModal = function() {
        if (!confirm('편집 중인 내용을 버리고 기본 프롬프트로 되돌릴까요?')) return;
        // 💡 리셋도 되돌릴 수 있도록, 리셋 전 현재 프롬프트를 스냅샷으로 남김
        const current = localStorage.getItem('gantt_project_summary_prompt');
        if (current) window.savePsPromptVersionSnapshot(current, '기본값 초기화 전 백업');
        document.getElementById('ai-summary-prompt-textarea').value = window._defaultProjectSummaryPromptTemplate || '';
    };

    // ── 💡 프롬프트 변경 이력 모달 — 메일분석의 방금 고친(단일 ✕, 드래그 가능, 배경 비차단) 표준
    //    패턴을 그대로 따름 ──────────────────────────────────────────────
    window.showPsPromptLogs = function() {
        let logs = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_logs') || '[]');
        let versions = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_versions') || '[]');
        if (logs.length === 0) { alert('프롬프트 변경 이력이 없습니다.'); return; }

        let logModal = document.getElementById('ps-prompt-log-modal');
        if (!logModal) {
            logModal = document.createElement('div');
            logModal.id = 'ps-prompt-log-modal';
            logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; pointer-events:none; background:none; align-items:center; justify-content:center;';
            logModal.innerHTML = `
                <div id="ps-prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                    <div id="ps-prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                        <span>🕒 AI 프로젝트 요약 — 프롬프트 변경 이력</span>
                        <button onclick="event.stopPropagation(); document.getElementById('ps-prompt-log-modal').style.display='none'"
                            style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px;
                                   color:#1a4f7a; font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';"
                            onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                            title="닫기">✕</button>
                    </div>
                    <div id="ps-prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                    <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                        <button onclick="window.clearPsPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                        <button onclick="document.getElementById('ps-prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">✖ 닫기</button>
                    </div>
                </div>`;
            document.body.appendChild(logModal);
            window._makeDraggable('ps-prompt-log-box', 'ps-prompt-log-drag');
            window._bindClickToFront('ps-prompt-log-modal');
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
                ? `<button onclick="window.restorePsPromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 복원</button>`
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

        document.getElementById('ps-prompt-log-content').innerHTML = html;
        logModal.style.display = 'flex';
        window.bringModalToFront('ps-prompt-log-modal');
    };

    // 💡 특정 버전으로 복원 — 즉시 저장하지 않고 편집창에 불러와서 검토 후 저장하도록 유도
    window.restorePsPromptVersion = function(version) {
        const versions = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_versions') || '[]');
        const target = versions.find(v => v.version === version);
        if (!target) { alert('해당 버전을 찾을 수 없습니다.'); return; }

        document.getElementById('ps-prompt-log-modal').style.display = 'none';
        const textarea = document.getElementById('ai-summary-prompt-textarea');
        if (textarea) textarea.value = target.prompt;
        alert('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 팀 공용으로 저장] 버튼을 눌러야 최종 반영됩니다.');
    };

    window.clearPsPromptLogs = function() {
        if (!confirm('프롬프트 변경 이력을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
        localStorage.removeItem('gantt_project_summary_prompt_logs');
        localStorage.removeItem('gantt_project_summary_prompt_versions');
        document.getElementById('ps-prompt-log-modal').style.display = 'none';
        alert('✅ 이력이 삭제되었습니다.');
    };

    // ── 💡 [2026-08-24 신규] AI 요약 피드백(👍/👎) + AI 프롬프트 자동개선 요청 ─────────────
    //    메일분석의 피드백/개선 시스템(saveFeedbackLog / triggerPromptImprove / _simpleLineDiff /
    //    renderPromptDiffHtml / showImprovePreviewModal / applyImprovedPrompt)과 완전히 동일한
    //    설계를 그대로 재사용하되, 이 기능엔 "사용자가 수정하는 편집 가능 필드"가 없으므로(읽기
    //    전용 AI 리포트) "AI 원본 vs 사용자 수정본" diff 대신 "리포트 결과 + 사용자 코멘트"만 기록.
    //    diff 유틸(_simpleLineDiff/renderPromptDiffHtml)은 범용이라 그대로 재사용.
    const _PSF_KEY = 'gantt_project_summary_feedback';
    window._projectSummaryPromptVersion = parseInt(localStorage.getItem('gantt_project_summary_prompt_version') || '1', 10);
    window._lastPsFeedbackUid = null; // 방금 저장한 피드백 uid (개선 요청 시 코멘트를 채워넣을 대상)

    window.saveProjectSummaryFeedback = function(rating) {
        const r = (window.projectMeta || {}).aiSummaryReport;
        if (!r) return;
        const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
        const uid = 'psfb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        log.unshift({
            uid: uid,
            date: new Date().toISOString(),
            promptVersion: window._projectSummaryPromptVersion,
            report: { 신호등: r.신호등, 총평: r.총평, 리스크: r.리스크, 액션추천: r.액션추천 },
            userComment: '',
            rating: rating,
            improved: false
        });
        if (log.length > 200) log.splice(200);
        localStorage.setItem(_PSF_KEY, JSON.stringify(log));

        const goodBtn = document.getElementById('ps-fb-good-btn');
        const badBtn  = document.getElementById('ps-fb-bad-btn');
        const triggerRow = document.getElementById('ps-fb-improve-trigger-row');

        if (rating === 'good') {
            window._lastPsFeedbackUid = null;
            if (triggerRow) triggerRow.style.display = 'none';
            if (goodBtn) { goodBtn.style.background = '#c9ecd3'; goodBtn.style.color = '#1f7a3d'; goodBtn.dataset.active = '1'; }
            if (badBtn)  { badBtn.style.background = '#fbe4e2'; badBtn.style.color = '#b1432f'; delete badBtn.dataset.active; }
            if (window.showToast) window.showToast('👍 피드백이 저장되었습니다.', 'info');
        } else {
            window._lastPsFeedbackUid = uid;
            if (triggerRow) triggerRow.style.display = 'block'; // 💡 나쁨 선택 시에만 개선요청 버튼 노출
            if (badBtn)  { badBtn.style.background = '#f5c2bd'; badBtn.style.color = '#b1432f'; badBtn.dataset.active = '1'; }
            if (goodBtn) { goodBtn.style.background = '#e6f6ea'; goodBtn.style.color = '#1f7a3d'; delete goodBtn.dataset.active; }
        }
    };

    // ── 💡 개선 요청 코멘트 입력 모달 (메일분석의 improve-comment-modal과 별도 — id 충돌 방지) ──
    // 💡 [2026-08-24 UX 개선] 다른 팝업들처럼 표준 모달 기능(드래그 이동, 배경 흐림/딤 처리로 뒤 화면
    //    조작 차단, 배경 클릭 시 닫기, 우상단 ✕ 버튼)을 적용 — 메일분석의 improve-comment-modal과
    //    동일한 처리를 적용함(디자인 일관성).
    window.openPsImproveCommentModal = function() {
        let modal = document.getElementById('ps-improve-comment-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ps-improve-comment-modal';
            // 💡 [2026-08-24] 처음엔 backdrop-filter:blur(3px)를 넣었는데, 개선 요청 코멘트를 쓰려면
            //    뒤에 있는 리포트/분석 결과 내용을 보면서 참고해야 하는데 블러 때문에 안 읽혀서 제거함
            //    (배경 톤만 살짝 남기고 흐림 효과는 뺌 — 뒤 내용이 그대로 읽힘).
            // 💡 [2026-08-24] 배경 클릭 시 닫히던 걸 제거함 — 코멘트를 쓰다가 뒤 리포트를 참고하려고
            //    배경을 클릭했는데 모달이 닫혀버리는 게 불편하다는 피드백. 이제 ✕ 버튼으로만 닫힘.
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9250; background:rgba(255,218,185,0.22);';
            modal.innerHTML = `
            <div id="ps-improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
                <div id="ps-improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ 어떤 부분이 문제였나요?</span>
                    <button onclick="event.stopPropagation(); document.getElementById('ps-improve-comment-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                </div>
                <div style="padding:18px;">
                    <textarea id="ps-improve-comment-input" placeholder="예: 완료율이 높은데도 신호등을 🔴로 판단함 (선택 입력)"
                        style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button onclick="window.submitPsImproveComment()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 요청</button>
                        <button onclick="document.getElementById('ps-improve-comment-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:9px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">✖ 취소</button>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ps-improve-comment-box', 'ps-improve-comment-drag');
            window._bindClickToFront('ps-improve-comment-modal');
        }
        document.getElementById('ps-improve-comment-input').value = '';
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('ps-improve-comment-modal');
    };

    window.submitPsImproveComment = function() {
        const comment = document.getElementById('ps-improve-comment-input').value.trim();
        document.getElementById('ps-improve-comment-modal').style.display = 'none';

        if (window._lastPsFeedbackUid) {
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const it = log.find(function(x) { return x.uid === window._lastPsFeedbackUid; });
            if (it) { it.userComment = comment; localStorage.setItem(_PSF_KEY, JSON.stringify(log)); }
        }
        window.triggerProjectSummaryPromptImprove('instant', comment);
    };

    // 💡 다운스트림 코드가 의존하는 필수 구조(JSON 4개 키) + 데이터 치환용 플레이스홀더가
    //    개선된 프롬프트에도 살아있는지 검사 (메일분석 validatePromptStructure와 동일한 목적)
    window.validateProjectSummaryPromptStructure = function(promptText) {
        const requiredJsonKeys = ['신호등', '총평', '리스크', '액션추천'];
        const requiredPlaceholders = ['${customer}', '${model}', '${pm}', '${totalTasks}', '${countDone}', '${countProgress}', '${countPending}', '${countDelay}', '${delayedList}', '${dueSoonList}', '${recentLogs}'];
        const missing = [];
        requiredJsonKeys.forEach(function(k) {
            if (promptText.indexOf('"' + k + '"') === -1) missing.push('JSON 키: "' + k + '"');
        });
        requiredPlaceholders.forEach(function(p) {
            if (promptText.indexOf(p) === -1) missing.push('플레이스홀더: ' + p);
        });
        return missing; // 빈 배열이면 이상 없음
    };

    window.triggerProjectSummaryPromptImprove = async function(mode, instantComment) {
        const currentPrompt = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        const apiKey = window.getActiveAiKey(); // 💡 선택된 provider(Gemini/Groq/Mistral)에 맞는 키를 정식 헬퍼로 조회
        let casesText = '';
        let targetUids = [];

        if (mode === 'instant') {
            // 즉시 모드: 방금 남긴 피드백 1건만
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const fb = window._lastPsFeedbackUid ? log.find(function(x) { return x.uid === window._lastPsFeedbackUid; }) : null;
            const rep = (fb && fb.report) || (window.projectMeta || {}).aiSummaryReport || {};
            targetUids = window._lastPsFeedbackUid ? [window._lastPsFeedbackUid] : [];
            // 💡 이 기능엔 "사용자 수정본"이 없으므로(읽기전용 리포트), AI가 만든 리포트 결과 + 사용자 코멘트만 케이스로 제공
            casesText = `[케이스 1]\n생성된 리포트:\n신호등: ${rep.신호등 || ''}\n총평: ${rep.총평 || ''}\n리스크: ${(rep.리스크 || []).join(' / ') || '(없음)'}\n액션추천: ${(rep.액션추천 || []).join(' / ') || '(없음)'}\n\n사용자 코멘트: ${instantComment || '(없음)'}`;
        } else {
            // 💡 [2026-08-24 신규] 배치 모드 — 지금까지 쌓인 👎 피드백(improved:false) 케이스를 모아
            //    한 번에 개선 요청 (메일분석 프롬프트의 "🤖 일괄개선"과 동일한 개념)
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const pending = log.filter(function(x) { return x.rating === 'bad' && !x.improved; }).slice(0, 10);
            targetUids = pending.map(function(x) { return x.uid; });
            if (!pending.length) {
                alert('⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 리포트 결과에서 👎 버튼을 눌러 케이스를 쌓아주세요.');
                return;
            }
            casesText = pending.map(function(fb, i) {
                const rep = fb.report || {};
                return `[케이스 ${i + 1}] (${fb.date ? fb.date.slice(0, 10) : ''})\n신호등: ${rep.신호등 || ''}\n총평: ${rep.총평 || ''}\n리스크: ${(rep.리스크 || []).join(' / ') || '(없음)'}\n액션추천: ${(rep.액션추천 || []).join(' / ') || '(없음)'}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
            }).join('\n\n---\n\n');
        }

        // 💡 JSON 대신 구분자 방식 — 프롬프트 원문의 줄바꿈/따옴표로 인한 이스케이프 깨짐 방지
        // 💡 이 구조(JSON 키/플레이스홀더)는 다른 코드가 직접 파싱/치환하므로 AI가 절대 바꾸면 안 됨
        const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱/치환하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 최종 JSON 응답의 키 이름은 정확히 이 4개만 사용: "신호등","총평","리스크","액션추천" (키 이름 변경/추가/삭제 금지)\n2. "신호등" 값은 반드시 🟢 또는 🟡 또는 🔴 중 하나\n3. 아래 플레이스홀더는 정확히 이 이름 그대로 유지해야 합니다 (삭제/이름변경 금지): \${customer} \${model} \${pm} \${totalTasks} \${countDone} \${countProgress} \${countPending} \${countDelay} \${delayedList} \${dueSoonList} \${recentLogs}\n표현/지시문/설명 등 나머지는 자유롭게 개선해도 됩니다.`;

        const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 "AI 프로젝트 요약 리포트" 프롬프트와, 이 프롬프트로 생성했을 때 사용자가 "나쁨"으로 평가한 사례입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

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
            const isTruncated = !/===END===/.test(cleaned); // 💡 종료 마커 없으면 잘림 의심

            if (!improvedPrompt) {
                throw new Error('AI 응답 형식을 해석하지 못했습니다.');
            }
            // 💡 구조 손상 여부 검증 — 다운스트림 코드가 의존하는 필수 요소가 빠졌는지 확인
            const structIssues = window.validateProjectSummaryPromptStructure(improvedPrompt);
            window.showPsImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
        } catch(e) {
            alert('❌ AI 개선 요청 실패: ' + (e && e.message ? e.message : e));
        }
    };

    // ── 💡 개선 결과 미리보기 모달 (diff 유틸은 메일분석과 공유, 모달 자체는 별도) ──────────
    window.showPsImprovePreviewModal = function(analysis, improvedPrompt, targetUids, originalPrompt, isTruncated, structIssues) {
        let modal = document.getElementById('ps-improve-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ps-improve-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ps-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="ps-improve-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 프롬프트 개선 제안 (프로젝트 요약)</span>
                    <button onclick="document.getElementById('ps-improve-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                </div>
                <div id="ps-improve-truncate-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404;"></div>
                <div id="ps-improve-struct-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#ffe3e3; border:1px solid #e03131; border-radius:6px; font-size:12px; color:#c92a2a;"></div>
                <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔍 문제점 분석</div>
                        <div id="ps-improve-analysis-text" style="font-size:12px; color:#333; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; padding:10px; white-space:pre-wrap; line-height:1.6;"></div>
                    </div>
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔀 변경사항 (원본 대비)
                            <span style="font-weight:normal; color:#999;">(빨강=삭제, 초록=추가)</span>
                        </div>
                        <div id="ps-improve-diff-view" style="max-height:220px; overflow-y:auto; font-size:11.5px; font-family:'Malgun Gothic',monospace; border:1px solid #e6e9ef; border-radius:6px; line-height:1.5; background:#fff;"></div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column;">
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">✏️ 개선된 프롬프트 (수정 가능)</div>
                        <textarea id="ps-improve-prompt-textarea" style="flex:1; min-height:200px; font-size:12px; font-family:'Malgun Gothic',monospace; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:vertical; line-height:1.6;"></textarea>
                    </div>
                </div>
                <div style="padding:12px 16px; display:flex; gap:8px; border-top:1px solid #eee;">
                    <button onclick="window.applyImprovedPsPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 채택</button>
                    <button onclick="document.getElementById('ps-improve-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:10px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">❌ 무시</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ps-improve-box', 'ps-improve-drag');
            window._bindClickToFront('ps-improve-modal');
        }

        const warnBar = document.getElementById('ps-improve-truncate-warning');
        warnBar.textContent = '⚠️ AI 응답이 중간에 잘렸을 수 있습니다 (종료 마커 없음). 채택 전 아래 프롬프트 끝부분을 꼭 확인하세요.';
        warnBar.style.display = isTruncated ? 'block' : 'none';

        const structBar = document.getElementById('ps-improve-struct-warning');
        if (structIssues && structIssues.length) {
            structBar.innerHTML = '🚨 다른 코드가 의존하는 필수 요소가 빠진 것 같습니다: <b>' + structIssues.join(', ') + '</b>';
            structBar.style.display = 'block';
        } else {
            structBar.style.display = 'none';
        }

        document.getElementById('ps-improve-diff-view').innerHTML = window.renderPromptDiffHtml(originalPrompt || '', improvedPrompt);
        document.getElementById('ps-improve-analysis-text').textContent = analysis;
        document.getElementById('ps-improve-prompt-textarea').value = improvedPrompt;
        modal._targetUids = targetUids || [];
        modal.style.display = 'block';
        window.bringModalToFront('ps-improve-modal');
    };

    // ── 💡 개선 프롬프트 채택 ───────────────────────────────────────────────
    window.applyImprovedPsPrompt = async function() {
        const text = document.getElementById('ps-improve-prompt-textarea').value.trim();
        if (!text) { alert('프롬프트가 비어있습니다.'); return; }

        // 💡 [2026-08-24 안전장치 추가] 팀 공용 프롬프트를 덮어쓰는 파괴적 액션이라, 수동 편집(✏️ 프롬프트
        //    편집 모달의 "🔒 수정하기")과 동일하게 관리자 비밀번호 인증을 요구함.
        if (!window.verifyAdminPassword('🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert('❌ 비밀번호 인증 실패. 채택이 취소되었습니다.');
            return;
        }

        // 버전 증가
        const oldPrompt = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        window._projectSummaryPromptVersion = (window._projectSummaryPromptVersion || 1) + 1;
        localStorage.setItem('gantt_project_summary_prompt_version', String(window._projectSummaryPromptVersion));
        localStorage.setItem('gantt_project_summary_prompt', text);

        // ✅ 변경 이력 저장 (지금까지 AI 개선 채택 시 버전 번호만 올라가고 실제 이력/복원 기능은 빠져 있었음)
        let psLogs = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_logs') || '[]');
        psLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + ' (AI개선 채택 v' + window._projectSummaryPromptVersion + ')',
            oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
            newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        });
        if (psLogs.length > 20) psLogs = psLogs.slice(-20);
        localStorage.setItem('gantt_project_summary_prompt_logs', JSON.stringify(psLogs));
        window.savePsPromptVersionSnapshot(text, 'AI개선 채택 v' + window._projectSummaryPromptVersion);

        // improved: true 마킹
        const modal = document.getElementById('ps-improve-modal');
        const uids = (modal && modal._targetUids) || [];
        if (uids.length) {
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            uids.forEach(function(uid) {
                const it = log.find(function(x) { return x.uid === uid; });
                if (it) it.improved = true;
            });
            localStorage.setItem(_PSF_KEY, JSON.stringify(log));
        }

        // Drive 저장 (팀 공용 프롬프트 파일에 반영)
        // 💡 [2026-08-24 버그 수정] 드라이브 미연동 상태거나 업로드가 실패하면, 방금 채택한 내용이
        //    로컬에만 남는데 — 이후 드라이브가 연결되면 loadProjectSummaryPromptFromDrive()가 (옛)
        //    드라이브 버전을 그대로 받아와 이 로컬 변경을 조용히 덮어써버리는 문제가 있었음
        //    ("채택했는데 다시 들어오면 저장 안 되어 있음"). "아직 드라이브에 못 올린 변경이 있다"는
        //    표시를 남겨서, 다음 로드 시 덮어쓰는 대신 먼저 이 변경을 드라이브로 올리도록 함.
        if (window.isDriveConnected && window.saveProjectSummaryPromptToDrive) {
            const ok = await window.saveProjectSummaryPromptToDrive(text);
            if (ok) {
                localStorage.removeItem('gantt_project_summary_prompt_pending_push');
                alert('✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v' + window._projectSummaryPromptVersion + ')');
            } else {
                localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
                alert('⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.');
            }
        } else {
            localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
            alert('✅ 개선된 프롬프트가 채택되었습니다. (v' + window._projectSummaryPromptVersion + ')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)');
        }
        modal.style.display = 'none';
    };

    // 💡 [PDF] 리포트 카드만 별도 인쇄영역(#ai-summary-print-area)에 복제해서 window.print() —
    //    Gantt 표 전용 인쇄 규칙(zoom 0.7 등)과 안 섞이도록 별도 영역/모드 클래스 사용
    window.printAiProjectSummary = function() {
        const content = document.getElementById('ai-summary-report-content');
        if (!content) { alert('먼저 [🔄 다시 생성]으로 리포트를 만들어주세요.'); return; }
        let printArea = document.getElementById('ai-summary-print-area');
        if (!printArea) { printArea = document.createElement('div'); printArea.id = 'ai-summary-print-area'; document.body.appendChild(printArea); }
        const pm = window.projectMeta || {};
        const title = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';
        printArea.innerHTML = `<div style="padding:10px; font-family:'맑은 고딕',sans-serif; color:#333;">
            <h2 style="margin:0 0 4px; color:#2c5f8a;">🤖 AI 프로젝트 요약 — ${escapeHtml(title)}</h2>
            <div>${content.innerHTML}</div>
        </div>`;
        document.body.classList.add('ai-summary-printing-mode');
        window.print();
    };

    // 💡 [PPT] 신호등/총평/통계/리스크/액션추천을 2슬라이드짜리 PowerPoint로 — Weekly Report PPT 내보내기와
    //    동일 라이브러리(PptxGenJS, 이미 로드돼 있음) 재사용, 색상/여백은 이 리포트 전용으로 단순화
    window.exportAiProjectSummaryPPT = function() {
        if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로드에 실패했습니다. 새로고침 후 다시 시도해주세요.'); return; }
        const r = (window.projectMeta || {}).aiSummaryReport;
        if (!r) { alert('먼저 [🔄 다시 생성]으로 리포트를 만들어주세요.'); return; }
        const d = r.dataSnapshot || { counts: {}, project: {} };
        const pm = window.projectMeta || {};
        const title = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
        pptx.layout = 'WIDE';
        const SKY = '2C5F8A';

        const slide = pptx.addSlide();
        slide.addText(`🤖 AI 프로젝트 요약 — ${title}`, { x: 0.4, y: 0.3, w: 12.5, h: 0.6, fontSize: 22, bold: true, color: SKY });
        slide.addText(`${r.신호등 || ''}  ${r.총평 || ''}`, { x: 0.4, y: 1.0, w: 12.5, h: 0.6, fontSize: 16, bold: true, color: '333333' });

        const statLabels = ['완료', '진행', '대기', '지연'];
        const statColors = ['2F9E44', '1971C2', 'B85C00', 'E03131'];
        statLabels.forEach(function(label, i) {
            slide.addShape(pptx.ShapeType.roundRect, { x: 0.4 + i * 3.1, y: 1.8, w: 2.9, h: 1.0, fill: { color: 'F5F5F5' }, line: { color: 'DDDDDD', width: 0.5 } });
            slide.addText(String((d.counts && d.counts[label]) || 0), { x: 0.4 + i * 3.1, y: 1.85, w: 2.9, h: 0.55, align: 'center', fontSize: 24, bold: true, color: statColors[i] });
            slide.addText(label, { x: 0.4 + i * 3.1, y: 2.4, w: 2.9, h: 0.35, align: 'center', fontSize: 12, color: '666666' });
        });

        slide.addText('⚠️ 주요 리스크', { x: 0.4, y: 3.1, w: 6.0, h: 0.4, fontSize: 14, bold: true, color: SKY });
        slide.addText((r.리스크 && r.리스크.length ? r.리스크 : ['특별한 리스크 없음']).map(function(x) { return { text: x, options: { bullet: true, breakLine: true, fontSize: 11 } }; }),
            { x: 0.4, y: 3.5, w: 6.0, h: 3.3, valign: 'top' });

        slide.addText('✅ 담당자별 액션 추천', { x: 6.9, y: 3.1, w: 6.0, h: 0.4, fontSize: 14, bold: true, color: SKY });
        slide.addText((r.액션추천 && r.액션추천.length ? r.액션추천 : ['추천 액션 없음']).map(function(x) { return { text: x, options: { bullet: true, breakLine: true, fontSize: 11 } }; }),
            { x: 6.9, y: 3.5, w: 6.0, h: 3.3, valign: 'top' });

        const fileBase = 'AI프로젝트요약_' + title.replace(/[\\\/:*?"<>|]/g, '');
        pptx.writeFile({ fileName: `${fileBase}.pptx` });
    };

    // ═══════════════════════════════════════════════════════════
    // 💡 [2026-08-26 신규] 💬 Gantt AI 문답 — "AI 프로젝트 요약"이 지연/임박 업무만 정해진 형식으로
    //    보여주는 것과 달리, 여기서는 사용자가 이 프로젝트의 Gantt 데이터에 대해 자유로운 형식으로
    //    무엇이든 물어보고 AI가 실제 업무 목록 데이터를 근거로 답변한다. 대화는 채팅 형태로 이어지며,
    //    AI 프로젝트 요약과 동일한 백엔드 호출(window.callAiBackend/getActiveAiKey)을 그대로 재사용.
    //    GAS 백엔드가 단일 prompt 문자열만 받으므로, 매 턴마다 [업무 목록 + 지금까지의 대화 + 새 질문]을
    //    하나의 프롬프트로 합쳐서 보낸다(멀티턴을 흉내). 대화 내용은 저장하지 않는 휘발성 세션 상태.
    // ═══════════════════════════════════════════════════════════
    window._ganttQaHistory = [];

    // 💡 [2026-08-29 신규 — 버그 수정] "다른 프로젝트로 이동해서 물어보면 응답이 없다(⏳가 멈추지 않음).
    //    내용을 지우고 다시 물으면 답한다"는 제보 — 프로젝트를 전환한 직후엔 구글 드라이브 토큰이 막
    //    갱신 중이거나 네트워크가 일시적으로 불안정한 경우가 있는데, fetch 자체엔 타임아웃이 없어서
    //    (아래 Elec Parts 라이브러리 조회, callAiBackend의 GAS 호출 등) 요청이 "실패"도 "성공"도 아닌
    //    채로 영원히 멈춰버릴 수 있다 — try/catch로는 못 잡는다(예외가 안 나고 그냥 응답이 안 오는 것).
    //    그러면 "⏳ 답변 생성 중..." 표시가 영원히 안 바뀌어 사용자 눈엔 "응답 없음"으로 보인다.
    //    지정 시간 안에 안 끝나면 강제로 실패 처리(reject)하는 범용 타임아웃 래퍼를 만들어서, 오래 걸리는
    //    비동기 호출들을 감싸 "무한 대기"를 "명확한 오류 메시지"로 바꾼다(사용자가 재시도할 수 있게).
    window._withTimeout = function(promise, ms, timeoutMessage) {
        return new Promise(function(resolve, reject) {
            const timer = setTimeout(function() { reject(new Error(timeoutMessage || `요청이 ${Math.round(ms / 1000)}초 안에 끝나지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.`)); }, ms);
            promise.then(function(v) { clearTimeout(timer); resolve(v); }, function(e) { clearTimeout(timer); reject(e); });
        });
    };

    // 💡 Gantt 원본 전체를 보내면 너무 크므로, 업무 1건당 한 줄로 압축해서 최대 MAX_TASKS건까지만 포함
    window._buildGanttQaContext = async function() {
        // 🐛 [2026-08-30 버그 수정] 위 _buildProjectSummaryData와 동일한 원인 — Summary 탭 입력값은
        // collectTabData()를 거쳐야 window.projectMeta/window.tabData.summary에 반영되는데, AI 문답도
        // 이걸 안 부르고 있어서 "정보를 고쳤는데도 AI가 예전 정보로 답한다"는 문제가 있었다.
        if (window.collectTabData) window.collectTabData();
        const pm = window.projectMeta || {};
        // 💡 [2026-08-28 신규] "이 업무 알람 걸어줘" 같은 실행 요청을 처리하려면 AI가 각 업무를 어느
        //    globalData 인덱스로 다시 가리켜야 하는지 알아야 한다 — filter로 빠지는 행이 있어 slice
        //    순서만으론 원래 인덱스를 복원할 수 없으므로, filter 전에 원래 인덱스(idx)를 먼저 붙여둔다.
        const rows = (typeof globalData !== 'undefined' && globalData)
            ? globalData.map(function(r, i) { return { row: r, idx: i }; }).slice(1).filter(function(x) { return x.row && x.row._level !== undefined; })
            : [];
        const koMap = (typeof LANG !== 'undefined' && LANG.ko && LANG.ko.statusMap) ? LANG.ko.statusMap : {};

        const normStatus = function(raw) {
            const s = (raw || '').toString().trim();
            if (!s) return '(미지정)';
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

        // 💡 [버그 수정] "오늘 업무 정리해줘"/"이번주 마감" 같은 상대 날짜 질문에 AI가 답하려면 "오늘이
        //    몇 일인지"를 알아야 하는데, 지금까지 프롬프트 어디에도 실제 날짜를 문자로 넣어주지 않았음
        //    (지연/D-day 계산에 today 변수는 썼지만 AI에게 보여주진 않았음) — AI 입장에선 "오늘"이 뭔지
        //    알 방법이 없으니, "추측하지 말라"는 지시를 충실히 따라 매번 "데이터에서 확인되지 않습니다"로
        //    답한 것. 오늘 날짜/요일을 프롬프트에 명시해서 상대 날짜 추론이 가능하도록 함.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const _weekdayKo = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} (${_weekdayKo}요일)`;
        const MAX_TASKS = 300; // 프롬프트 크기 보호 — 이보다 많으면 뒤는 생략하고 건수만 알림
        const lines = [];
        rows.slice(0, MAX_TASKS).forEach(function(x) {
            const row = x.row;
            const label = taskLabel(row) || '(제목없음)';
            const status = normStatus(colIdx.status !== -1 ? row[colIdx.status] : '');
            const assignee = (colIdx.assignee !== -1 && row[colIdx.assignee]) ? row[colIdx.assignee] : '미지정';
            const start = (colIdx.start !== -1 && row[colIdx.start]) ? row[colIdx.start] : '';
            const plan = (colIdx.plan !== -1 && row[colIdx.plan]) ? row[colIdx.plan] : (row._calcPlanTs ? formatTsToYMD(row._calcPlanTs) : '');
            // 💡 [버그 수정] 120자로 너무 짧게 잘라서, "요약해줘" 질문에 AI가 실제 내용(무슨 이슈인지)을
            //    읽고 종합할 재료가 부족해 이름/날짜/상태만 재나열하는 결과로 이어졌음 — 특히 메일 자동
            //    등록 업무(＊AI📧)는 상세내용에 실제 이슈 내용이 들어있는데 이게 대부분 잘려나갔었음.
            //    고정값 대신 [🤖 AI 도구 > ⚙️ 설정]에서 사용자가 정한 길이(기본 500자)를 씀.
            const _qaMaxLen = window.getAiContentMaxLen ? window.getAiContentMaxLen() : 500;
            const content = (colIdx.content !== -1 && row[colIdx.content]) ? String(row[colIdx.content]).replace(/\s+/g, ' ').trim().slice(0, _qaMaxLen) : '';
            const answer = (colIdx.answer !== -1 && row[colIdx.answer]) ? String(row[colIdx.answer]).replace(/\s+/g, ' ').trim().slice(0, _qaMaxLen) : '';

            let dueTag = '';
            if (status !== '완료' && plan) {
                const pd = new Date(plan);
                if (!isNaN(pd)) {
                    pd.setHours(0, 0, 0, 0);
                    const diff = Math.round((pd - today) / 86400000);
                    if (diff < 0) dueTag = ` [지연 ${-diff}일]`;
                    else if (diff <= 7) dueTag = ` [D-${diff}]`;
                }
            }
            const alarmTag = row._알림 ? ' [알람ON]' : '';
            // 💡 [2026-08-28 신규] "원문 메일도 봐줘" 질문에 AI가 답하려면 이 업무에 원본 이메일이
            //    저장돼 있는지부터 알아야 한다 — 전문을 매번 다 넣으면(업무당 최대 수천 자) 프롬프트가
            //    폭발하므로, 목록에는 있음/없음 표시만 두고 실제 전문은 AI가 [[ACTION:VIEW_MAIL:번호]]
            //    태그로 "요청"할 때만 별도 조회해서 후속 프롬프트에 끼워넣는다(아래 _buildGanttQaPrompt/
            //    sendGanttQaMessage 참고, SET_ALARM 태그와 같은 패턴).
            const mailTag = row._mailRaw ? ' [원문有]' : '';
            // 💡 [2026-08-28 신규] "시작:2026-08-26 | 계획:2026-08-27"처럼 풀어쓰던 것을 "기간:8/26~8/27"
            //    형태로 압축(window._fmtDateRangeShort) — AI가 답변에 옮겨 적을 때도 이 짧은 표기를
            //    그대로 쓰도록 프롬프트 지시문에서 유도한다(아래 _buildGanttQaPrompt 참고).
            const dateRange = window._fmtDateRangeShort(start, plan) || '-';
            // 💡 [2026-08-28 신규] "담당자/발신인/수신인 기준으로 검색해줘"에 답 못하던 문제 수정 —
            //    window._extractMailSenderReceiver 참고.
            const mailPeople = window._extractMailSenderReceiver(colIdx.content !== -1 ? row[colIdx.content] : '');
            let line = `- #G${x.idx} Lv${row._level} "${label}" | 담당:${assignee} | 상태:${status}${dueTag}${alarmTag}${mailTag} | 기간:${dateRange}`;
            if (mailPeople.sender) line += ` | 발신:${mailPeople.sender}`;
            if (mailPeople.receiver) line += ` | 수신:${mailPeople.receiver}`;
            if (content) line += ` | 내용:${content}`;
            if (answer) line += ` | 대응:${answer}`;
            lines.push(line);
        });
        const omittedNote = rows.length > MAX_TASKS ? `\n...(그 외 ${rows.length - MAX_TASKS}건은 용량 제한으로 생략됨)` : '';

        const recentLogs = (window.changeLogs || []).slice(-20).reverse().map(function(l) {
            return `${l.time} ${l.userName} — ${l.rowName}/${l.colName}: ${l.oldVal} → ${l.newVal}`;
        });

        // 💡 [버그 수정] 처음엔 Gantt 업무 목록만 컨텍스트로 넣었는데, "Summary" 탭에 있는 프로젝트 개요/
        //    담당자/주요 자재 등을 물어보면 이 데이터가 아예 없어서 AI가 무조건 "데이터에서 확인되지
        //    않습니다"라고 답하는 문제가 있었음 — "프로젝트 JSON 파일 전체"를 보고 답하길 기대하는
        //    사용자 기대와 어긋남. Summary 탭 개요/멤버/주요자재도 함께 포함시킴.
        const td = window.tabData || {};
        const sd = td.summary || {};
        const overviewLines = [];
        if (sd.purpose) overviewLines.push(`적용 목적: ${sd.purpose}`);
        if (sd.volume) overviewLines.push(`연간 수요량: ${sd.volume}`);
        if (sd.mpDate) overviewLines.push(`목표 양산 일정: ${sd.mpDate}`);
        if (sd.background) overviewLines.push(`추진 배경 및 의의: ${sd.background}`);
        if (sd.devDays) overviewLines.push(`개발기간(일): ${sd.devDays}`);
        if (pm.프로젝트코드) overviewLines.push(`프로젝트 코드: ${pm.프로젝트코드}`);
        if (pm.프로젝트명) overviewLines.push(`프로젝트 명칭: ${pm.프로젝트명}`);
        if (pm.인치) overviewLines.push(`인치: ${pm.인치}`);

        const memberLabels = pm.memberLabels || {};
        const memberFieldDefs = [
            ['프로젝트담당자', 'PM'], ['기구담당자', '기구'], ['HW담당자', 'HW'], ['FW담당자', 'FW'],
            ['TSP담당자', 'TSP'], ['LCM담당자', 'LCM'], ['Slimming담당자', 'Slimming'],
            ['Cutting담당자', 'Cutting'], ['Module담당자', 'Module'], ['Tooling담당자', 'Tooling']
        ];
        const memberLines = memberFieldDefs
            .filter(function(f) { return pm[f[0]]; })
            .map(function(f) { return `${memberLabels[f[0]] || f[1]}: ${pm[f[0]]}`; });
        (td.projectMembers3 || []).forEach(function(m) {
            if (m && (m.name || m.role)) memberLines.push(`${m.role || '멤버'}: ${m.name || ''}`);
        });

        // 💡 [2026-08-30 신규] 주요자재도 #MT숫자로 인용 가능하게 — 화면(#sum-materials-rows-a/b)의
        // <tr>에는 위치기반 data-idx만 있고 고유 id가 없어서, CS/MC와 동일하게 category+ktkPn+description
        // 값 대조로 찾는다(_aiJumpToMtRow 참고).
        window._aiMtRefMap = [];
        const materialLines = (td.projectMaterials || [])
            .filter(function(m) { return m && (m.category || m.ktkPn || m.description); })
            .map(function(m, i) {
                window._aiMtRefMap[i] = { category: m.category || '', ktkPn: m.ktkPn || '', description: m.description || '' };
                return `- #MT${i} ${m.category || '(구분없음)'} | PN:${m.ktkPn || '-'} | ${m.description || '-'}` + (m.cost ? ` | Cost:${m.cost}` : '') + (m.useForAnalysis ? ' [분석용]' : '');
            });

        // 💡 [2026-08-27 추가] Brief SPEC / M.C Table / Elec Parts / Address 탭도 물어볼 수 있도록 포함
        //    (용량 보호를 위해 각각 최대 개수 제한 — 이 탭들은 보통 업무 목록보다 훨씬 적음)
        const MAX_TABLE_ROWS = 100;
        // 💡 [2026-08-30 신규 → 같은 날 재작성] Gantt 업무의 "#G숫자" 인용과 같은 방식으로, Customer
        // SPEC/M.C Table 행도 클릭하면 해당 탭으로 이동해 그 행을 찾아 하이라이트할 수 있도록
        // "#CS숫자"/"#MC숫자" 번호를 붙인다. 표별로 접두사를 다르게 둬서(#G/#CS/#MC) 같은 숫자가 서로
        // 다른 표를 가리켜 혼동되는 일이 없게 한다.
        // 🐛 [2026-08-30 버그 수정] 처음엔 이 번호를 tabData 원본 배열을 별도 기준으로 필터링해서
        // 0부터 새로 매겼는데, 그 필터 기준이 화면의 "No." 열 번호를 매기는 기준(빈 행 자동 숨김,
        // bmSetupAllRows)과 정확히 같지 않아서 "AI가 말한 번호가 실제 표에서 보이는 번호와 다르다"는
        // 문제가 있었다. 이제는 화면에 실제 렌더링된 <tr>을 그대로 순회해서 "No." 칸(.bm-no)에 찍힌
        // 값을 번호로 그대로 쓰므로, 사용자가 표에서 보는 번호와 AI가 인용하는 번호가 항상 똑같다
        // (숨겨진 행은 "No."가 안 매겨지므로 그대로 건너뜀 — _aiJumpToCsRow/_aiJumpToMcRow도 이제
        // 내용 대조 대신 이 "No." 값으로 직접 찾는다).
        window._aiCsRefMap = [];
        const briefSpecLines = [];
        let briefSpecOmittedCount = 0;
        document.querySelectorAll('#briefspec-body tr').forEach(function(tr) {
            if (tr.style.display === 'none') return;
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return;
            if (briefSpecLines.length >= MAX_TABLE_ROWS) { briefSpecOmittedCount++; return; }
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const type = g('type'), sub = g('sub'), modelA = g('modelA'), modelB = g('modelB'), modelC = g('modelC'), note = g('note');
            window._aiCsRefMap[no] = true;
            briefSpecLines.push(`- #CS${no} [${type || '-'}${sub ? '/' + sub : ''}] A:${modelA || '-'} | B:${modelB || '-'} | C:${modelC || '-'}` + (note ? ` | 비고:${note}` : ''));
        });
        const briefSpecOmitted = briefSpecOmittedCount ? `\n...(그 외 ${briefSpecOmittedCount}건 생략됨)` : '';

        window._aiMcRefMap = [];
        const mcCurRev = td.mcActiveRevision || 'R1';
        const mcCurUnit = window.mcActiveUnit || '';
        const mcLines = [];
        let mcOmittedCount = 0;
        document.querySelectorAll('#mctable-body tr').forEach(function(tr) {
            if (tr.style.display === 'none') return;
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return; // TYPE 소계/합계 등 요약행은 .bm-no가 없어서 자동으로 제외됨
            if (mcLines.length >= MAX_TABLE_ROWS) { mcOmittedCount++; return; }
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const type = g('type'), item = g('item'), group = g('group'), pn = g('pn'), spec = g('spec'), note = g('note');
            window._aiMcRefMap[no] = { unit: mcCurUnit, rev: mcCurRev };
            mcLines.push(`- #MC${no} [${type || '-'}] ${item || '-'} (${group || '-'}) PN:${pn || '-'} SPEC:${spec || '-'}`
                + ` | Proto:${g('protoCost') || '-'}/${g('protoNre') || '-'} ProtoB:${g('protoBCost') || '-'}/${g('protoBNre') || '-'} MP:${g('mpCost') || '-'}/${g('mpNre') || '-'}`
                + (note ? ` | 비고:${note}` : ''));
        });
        const mcOmitted = mcOmittedCount ? `\n...(그 외 ${mcOmittedCount}건 생략됨, 현재 리비전:${mcCurRev})` : '';

        // 💡 [2026-08-29 신규] "AI 문답에서 SPEC 물어보면 Elec Parts에서 찾아서 답해야 하는데, Brief SPEC
        //    (고객 제안용 모델 비교, 지금은 Customer SPEC으로 개명)만 참조해서 헷갈린다"는 지적 — 원인은
        //    지금까지 여기서 선택된 모델 "이름"과 메모만 넣어주고, 실제 부품 스펙(전압/전류/커넥터/브랜드
        //    등 key-value)은 하나도 안 넣어주고 있었던 것. 공용 라이브러리(_epLibCache, 없으면
        //    loadElecPartLibrary로 로드)에서 선택된 모델의 실제 스펙 필드를 찾아 같이 넣어준다.
        //    [Customer SPEC](고객에게 제안하는 완제품 모델 비교)과 [Elec Parts SPEC](실제 쓰는 전자부품/
        //    원자재의 상세 스펙)을 프롬프트에서 확실히 분리해서, AI가 "SPEC 질문"을 받았을 때 어느 쪽을
        //    찾아야 하는지 헷갈리지 않게 한다(아래 프롬프트 본문의 안내 문구 참고).
        const elecCompare = td.elecCompare || {};
        const elecTypeLabels = { convbd: 'CONVERTER', adbd: 'AD BOARD' };
        const elecLinesArr = [];
        // 💡 [2026-08-30 신규] Elec Parts도 #EP숫자로 인용 가능하게 — 단, 이 표는 모델이 "행"이 아니라
        // "열"이라(스펙 항목이 행, 비교 모델이 열) Gantt/CS/MC처럼 tr 하나를 통째로 찾는 게 아니라
        // type+model로 해당 열(column)의 <th>와 그 아래 칸들을 찾아 반짝여준다(_aiJumpToEpRow 참고).
        window._aiEpRefMap = [];
        for (const type of Object.keys(elecTypeLabels)) {
            const ec = elecCompare[type];
            if (!ec || !ec.selectedModels || !ec.selectedModels.length) continue;
            const models = ec.selectedModels;
            const notes = ec.notes || {};
            let lib = window._epLibCache && window._epLibCache[type];
            if (!lib && window.loadElecPartLibrary) {
                // 💡 위 _withTimeout 참고 — 라이브러리 조회가 안 끝나도 8초면 포기하고 "스펙 없음"으로
                //    넘어간다(전체 AI 문답 자체가 이거 하나 때문에 무한정 멈추면 안 됨).
                try { lib = await window._withTimeout(window.loadElecPartLibrary(type), 8000, '전기부품 라이브러리 조회 시간 초과'); window._epLibCache[type] = lib; } catch (e) { lib = null; }
            }
            const items = (lib && lib.items) || [];
            models.forEach(function(m) {
                const entry = items.find(function(it) { return it.model === m; });
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const fields = window._epFlatFields ? window._epFlatFields(type) : [];
                    const kv = fields.map(function(f) {
                        const v = specs[f[0]];
                        return (v && v !== '-') ? `${f[0]}:${v}` : null;
                    }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                const noteText = notes[m] ? ` | 메모:${notes[m]}` : '';
                const epIdx = window._aiEpRefMap.length;
                window._aiEpRefMap[epIdx] = { type: type, model: m };
                elecLinesArr.push(`- #EP${epIdx} [${elecTypeLabels[type]}] ${partName} (모델:${m})\n  ${specLine}${noteText}`);
            });
        }
        // 🐛 [2026-08-31 버그 수정] "elec parts 패널 해상도 물어보니 데이터에서 확인 안 된다"는 지적의
        // 실제 원인 — 위 루프가 CONVERTER/AD BOARD(elecCompare)만 돌고 PANEL은 처음부터 아예 빠져
        // 있었다. PANEL은 데이터 구조 자체가 달라서(tabData.panelCompare, loadPanelLibrary/
        // findPanelInLibrary, PANEL_SPEC_SCHEMA — CONVERTER/AD BOARD의 elecCompare/loadElecPartLibrary/
        // ELEC_PART_TYPES와 별개) 같은 루프에 못 끼워서, 이 부분을 만들 때 실수로 빠뜨린 것으로 보인다.
        // 실제로 Dot Resolution 등 패널 스펙 데이터는 등록돼 있는데 AI 컨텍스트에 아예 전달이 안 됐던
        // 것 — #EP 번호 체계·클릭 이동(_aiJumpToEpRow)도 그대로 이어서 쓸 수 있게 같은 방식으로 추가.
        const pc = td.panelCompare || {};
        if (pc.selectedModels && pc.selectedModels.length && window.loadPanelLibrary && window.findPanelInLibrary) {
            const models = pc.selectedModels;
            const notes = pc.notes || {};
            let panelLib = window._epLibCache && window._epLibCache.panel;
            if (!panelLib) {
                try { panelLib = await window._withTimeout(window.loadPanelLibrary(), 8000, '패널 라이브러리 조회 시간 초과'); window._epLibCache = window._epLibCache || {}; window._epLibCache.panel = panelLib; } catch (e) { panelLib = null; }
            }
            const panelFields = [];
            (window.PANEL_SPEC_SCHEMA || []).forEach(function(sec) { sec.fields.forEach(function(f) { panelFields.push(f); }); });
            models.forEach(function(m) {
                const entry = panelLib ? window.findPanelInLibrary(panelLib, m) : null;
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const kv = panelFields.map(function(f) {
                        const v = specs[f[0]];
                        return (v && v !== '-') ? `${f[0]}:${v}` : null;
                    }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                const noteText = notes[m] ? ` | 메모:${notes[m]}` : '';
                const epIdx = window._aiEpRefMap.length;
                window._aiEpRefMap[epIdx] = { type: 'panel', model: m };
                elecLinesArr.push(`- #EP${epIdx} [PANEL] ${partName} (모델:${m})\n  ${specLine}${noteText}`);
            });
        }
        const elecLines = elecLinesArr;

        // 💡 개인정보 최소 수집 원칙 — 주소록은 이름/부서/직함까지만 포함하고 이메일·휴대폰 등
        //    연락처는 외부 AI 백엔드로 매 질문마다 전송하지 않도록 제외함
        // 💡 [2026-08-28 버그 수정] 한글 이름으로 물으면 한글로 적힌 업무만, 영문 이름(예: Jun Kim)으로
        //    물으면 영문으로 적힌 업무(발신:/수신: 등은 메일 원문 그대로 영문으로 남는 경우가 흔함)만
        //    찾아지던 문제 — 주소록에 영문 이름(nameEn)이 같이 등록돼 있는데도 여기서는 한글 이름(name)만
        //    컨텍스트에 넣고 있어서, AI가 "김준식 = Jun Kim"이라는 매핑 자체를 알 방법이 없었다.
        //    nameEn도 같이 보여줘서 AI가 두 표기를 같은 사람으로 연결할 수 있게 한다.
        // 💡 [2026-08-30 신규 → 같은 날 재작성] 주소록도 #AD숫자로 인용 가능하게 — CS/MC와 동일하게
        // 화면의 "No." 열(.bm-no)을 그대로 번호로 쓴다. 단, 주소록의 display:none은 CS/MC처럼 "빈 행
        // 자동 숨김"이 아니라 검색창에 입력된 검색어로 인한 일시적 필터링일 뿐이고, bmSetupAllRows가
        // 매길 때는 검색 필터 적용 "전"에 전체 행 기준으로 번호를 매겨두므로(renderAddressTable 참고),
        // 검색 중이어도 "No." 값 자체는 전체 목록 기준으로 안정적이다 — 그래서 여기선 display:none
        // 여부를 보지 않고 항상 전체 행을 대상으로 한다(검색어가 남아있다고 AI가 못 보는 사람이
        // 생기면 안 되므로). 이동 시(_aiJumpToAdRow)에는 검색어를 초기화해서 화면에서도 바로 보이게 한다.
        window._aiAdRefMap = [];
        const addressLines = [];
        let addressOmittedCount = 0;
        document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return;
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const name = g('name'), nameEn = g('nameEn');
            if (!name && !nameEn) return; // 완전히 빈 최소 1행(신규 프로젝트 기본행) 등은 제외
            if (addressLines.length >= MAX_TABLE_ROWS) { addressOmittedCount++; return; }
            window._aiAdRefMap[no] = true;
            const nameStr = name && nameEn ? `${name} (${nameEn})` : (name || nameEn || '');
            addressLines.push(`- #AD${no} ${nameStr}${g('dept') ? ' / ' + g('dept') : ''}${g('title') ? ' / ' + g('title') : ''}`);
        });
        const addressOmitted = addressOmittedCount ? `\n...(그 외 ${addressOmittedCount}명 생략됨)` : '';

        return {
            todayStr: todayStr,
            projectLine: `[프로젝트] 고객사:${pm.고객사 || '-'} / 모델:${pm.고객모델명 || '-'} / PM:${pm.프로젝트담당자 || '-'}`,
            overviewText: overviewLines.length ? overviewLines.join('\n') : '(없음)',
            memberText: memberLines.length ? memberLines.join('\n') : '(없음)',
            materialText: materialLines.length ? materialLines.join('\n') : '(없음)',
            customerSpecText: (briefSpecLines.length ? briefSpecLines.join('\n') : '(없음)') + briefSpecOmitted,
            mcTableText: (mcLines.length ? mcLines.join('\n') : '(없음)') + mcOmitted,
            elecPartsText: elecLines.length ? elecLines.join('\n') : '(없음)',
            addressText: (addressLines.length ? addressLines.join('\n') : '(없음)') + addressOmitted,
            totalTasks: rows.length,
            taskListText: (lines.length ? lines.join('\n') : '(등록된 업무 없음)') + omittedNote,
            recentLogsText: recentLogs.length ? recentLogs.join('\n') : '(없음)'
        };
    };

    // 💡 [프로젝트 개요/멤버/자재 + 업무 목록 + 최근 이력 + 지금까지의 대화 + 새 질문]을 하나의 프롬프트로 합침
    // 💡 [2026-08-28 신규] mailTexts — AI가 직전 턴에서 [[ACTION:VIEW_MAIL:번호]]로 "요청"한 업무의
    //    원본 메일 전문(_aiAssistGetMailRaw 결과)들. 있으면 [요청하신 원문 메일 전문] 섹션으로 끼워 넣어
    //    같은 질문을 다시 물어본다(sendGanttQaMessage의 후속 호출에서만 채워짐).
    // 💡 [2026-08-31 신규] 프롬프트 본문(지시문)을 별도 함수로 분리 — ctx/question/historyText/mailSection을
    //    "인자"로 받아 템플릿 리터럴로 조립한다. 아래 window._defaultGanttQaPromptTemplate이 이 함수를
    //    실데이터 대신 "${토큰}" 문자열 그 자체로 호출해서 "편집 가능한 기본 프롬프트 텍스트"를 만드는 데
    //    재사용한다(AI 업무분석/AI 프로젝트 요약의 _defaultPromptTemplate 트릭과 동일 — 수동으로 다시
    //    타이핑하다 토큰을 빠뜨리거나 오타 낼 위험이 없음).
    window._buildGanttQaPromptTemplateRaw = function(ctx, question, historyText, mailSection) {
        return `당신은 아래 프로젝트(Gantt 일정 + Summary/Customer SPEC/M.C Table/Elec Parts/Address 등 프로젝트 파일 전체 데이터)를 잘 아는 보조 AI입니다.
기본적으로 아래 데이터에 있는 내용에 근거해서 답하고, 데이터에 없는 구체적인 수치·값을 있는 사실처럼 지어내지 마세요 — 그런 경우 "데이터에서 확인되지 않습니다"라고 답하세요.
🔎 추론 허용 규칙: 다만 사용자가 "추론해줘/추정해줘/네 생각은/일반적으로 어때/충족할 수 있어?"처럼 판단이나 추론을 명시적으로 요청하면, 데이터에 없는 내용이라도 당신이 아는 일반적인 전자/디스플레이/기구 엔지니어링 지식을 근거로 답변하세요 — 절대 "데이터에서 확인되지 않습니다"로 끝내지 마세요. 이때는 답변 앞에 "🔎 AI 추론(데이터 아님, 일반 지식 기반 추정)"이라고 표시를 붙여서 위 [데이터] 기반 사실과 명확히 구분하고, 추론에 사용한 전제·근거와 불확실성(예: 정확한 수치는 부품 데이터시트 확인 필요)도 함께 설명하세요. 지어낸 수치를 확정된 데이터처럼 단정하지 말고 "약 ~로 알려져 있음/일반적으로 ~하는 경향" 식으로 추정임을 드러내세요. 간결하고 실무적인 한국어로 답변하세요.

🔧 "SPEC(스펙)" 질문 구분 규칙 — 이 프로젝트엔 성격이 다른 두 SPEC 데이터가 있으니 헷갈리지 마세요:
- [Customer SPEC] = 고객사에 "제안"하는 완제품 모델 비교(Model A/B/C 등, TYPE별 비교표). "고객 스펙/제안 스펙/Model A랑 B 차이" 같은 질문은 여기서 찾으세요.
- [Elec Parts SPEC] = 실제로 이 제품에 "사용"하는 부품/원자재(패널·컨버터 보드·AD 보드 등)의 상세 스펙(해상도/전압/전류/커넥터/브랜드 등). "이 부품 SPEC이 뭐야/패널 해상도/컨버터 보드 사양/원자재 스펙" 같은 질문은 여기서 찾으세요 — [PANEL] 표시가 붙은 항목이 실사용 패널 부품 자체의 스펙입니다(고객 제안용 완제품 비교인 [Customer SPEC]의 패널 항목과 헷갈리지 마세요).
- 질문에 어느 쪽인지 애매하면(예: 그냥 "SPEC 알려줘"), 두 섹션 모두에서 관련 내용을 찾아보고 어느 항목을 말하는 것인지 되물어보거나, 둘 다 있으면 구분해서 각각 답하세요.
"오늘/이번 주/이번 달/내일" 등 상대적인 날짜 표현이 나오면, 반드시 아래 [오늘 날짜]를 기준으로 [업무 목록]의 "기간:" 값(시작일~계획일)과 비교해서 판단하세요 (예: 오늘 업무 = 기간 구간에 오늘 날짜가 포함되거나 오늘이 마감인 업무).
⚠️ 연도 확인 필수: "기간:"은 올해(=[오늘 날짜]의 연도)와 같은 해면 연도 없이 "M/D"로만 적혀 있지만, 올해와 다른 해(작년/내년 등)이면 "YYYY.M/D"처럼 연도가 붙어서 나옵니다(예: 오늘이 2026년이면 "8/26"은 2026년, "2025.8/26"은 2025년, "2027.8/26"은 2027년 — 전혀 다른 시점입니다). "이번 주/이번 달/오늘" 같은 질문에는 반드시 연도까지 [오늘 날짜]와 일치하는 업무만 포함하세요 — 연도 표시가 없다고 무조건 올해로 단정하지 말고, 연도가 붙어 있으면 그 연도를 그대로 따르세요. 월/일만 보고 "이번 주"라고 잘못 판단해 다른 해의 업무를 섞어 넣으면 안 됩니다.
📅 날짜 표시 규칙: 특정 업무의 일정을 답변에 언급할 때는 [업무 목록]에 있는 "기간:" 표시(예: 8/26~8/27, 올해가 아니면 "2025.8/26"처럼 연도가 붙음)를 그대로 옮겨 쓰세요. YYYY-MM-DD처럼 풀어쓰지 말고, 연도가 붙어 있는 경우 그 연도 표시도 생략하지 말고 그대로 옮기세요. 시작일과 계획일이 같으면 "기간:"에도 날짜 하나만 적혀 있으니 그대로 하나만 쓰면 됩니다.
🔍 조건 검색 규칙: "담당자/발신인/수신인이 누구인 업무 찾아줘/검색해줘"처럼 특정 조건으로 업무를 찾아달라는 요청에는, [업무 목록]의 "담당:"(담당자) / "발신:"(메일을 보낸 사람) / "수신:"(메일을 받은 사람) 값을 조건과 비교해서 일치하는 업무만 골라 목록으로 답하세요.
- 같은 사람으로 봐도 되는 경우: (1) 완전히 같은 이름, (2) [주소록]에 "한글이름 (영문이름)"으로 같이 등록된 경우의 그 두 표기(예: 주소록에 "김준식 (Jun Kim)"이 있으면 질문의 "김준식"과 업무 목록의 "Jun Kim"은 같은 사람), (3) 성/이름 표기 순서만 다르거나(Kim Jun ↔ Jun Kim) 대소문자·공백 차이만 있는 경우.
- ⚠️ 절대 같은 사람으로 보면 안 되는 경우: 이름의 일부(성만, 이름만, 한 단어만)만 우연히 같다고 같은 사람으로 묶지 마세요. 예를 들어 질문이 "Jun Kim"인데 업무 목록에 "Jun Park"이 있다고 그 업무까지 결과에 포함시키면 안 됩니다 — "Jun"이라는 이름만으로는 두 사람을 구별할 수 없으므로 "Jun Kim"과 "Jun Park"은 서로 다른 사람입니다. 성(姓)까지 포함해서 정확히(또는 위 (2)(3)의 정당한 표기 차이로) 일치할 때만 같은 사람으로 판단하세요.
- 발신:/수신: 값은 메일로 자동 등록된 업무에만 있고, 수동으로 입력한 업무에는 없을 수 있습니다 — 그 경우엔 "이 업무는 발신/수신 정보가 없습니다"라고 답하세요.

🔒 "요약/정리/분석해줘" 유형 질문에 대한 필수 규칙:
사용자는 이미 Gantt 화면에서 업무명·날짜·상태를 보고 있습니다. "요약해줘/정리해줘"라고 물었는데 그 목록을 이름/날짜/상태만 그대로 다시 나열하면, 사용자 입장에서 Gantt 표를 보는 것과 다를 게 없어 AI에게 물어본 의미가 없습니다. 아래처럼 답하세요:
1. 각 업무의 [내용:...] / [대응:...]을 읽고, 실제로 무슨 이슈·작업인지 파악해서 설명하세요 (업무명만 복사하지 말 것).
2. 성격이 비슷하거나 관련된 업무는 묶어서 "~건은 ~와 관련된 작업" 식으로 그룹핑하세요.
3. 그 중 특히 챙겨야 할 것(지연/오늘 마감/내용상 리스크가 있는 것)이 있으면 짚어주세요.
4. 근거로 인용할 때만 업무명을 언급하고, 목록 나열이 답변의 전부가 되지 않게 하세요.
5. ⚠️ 서술형으로 풀어 쓰거나 여러 업무를 하나의 문단/그룹으로 묶어 설명하더라도, 그 안에서 구체적으로
   언급한 업무마다 "#G숫자"와 "기간:" 값은 절대 생략하지 마세요 — 예를 들어 그룹핑된 문단이라면 각 문장이나
   소제목 옆에 "(#G46, 기간:8/26~8/27)"처럼 괄호로 붙이세요. 이 두 정보는 목록 형식(글머리 기호 나열)일 때만
   붙이는 게 아니라, 요약을 "narrative(서술형)"로 풀어 쓸 때도 인용하는 모든 업무에 반드시 동반되어야 하는
   근거 표시입니다(사용자가 그 번호를 클릭해 실제 업무로 이동하거나 알람을 걸 수 있으므로 빠지면 안 됨).
반대로 "지연된 업무 목록 보여줘"처럼 명시적으로 "목록/리스트"를 요청한 경우엔 목록으로 답해도 됩니다.

🔗 표별 인용 번호 규칙 — [업무 목록]/[Customer SPEC]/[M.C Table (원가/공수)]/[Elec Parts SPEC]/[주요 자재]/
[주소록] 각 줄 맨 앞에는 "#G숫자"(Gantt 업무) / "#CS숫자"(Customer SPEC 행) / "#MC숫자"(M.C Table 행) /
"#EP숫자"(Elec Parts SPEC 항목) / "#MT숫자"(주요 자재 행) / "#AD숫자"(주소록 행)처럼 표마다 다른 접두사가
붙은 고유 번호가 있습니다. Gantt 업무뿐 아니라 이 여섯 가지 표 중 어느 내용을 근거로 답하든, 위 5번 규칙과
동일하게 언급하는 항목마다 그 항목의 번호를 그대로 옮겨 적으세요(클릭하면 해당 탭의 그 항목으로 바로
이동합니다). 접두사(G/CS/MC/EP/MT/AD)를 절대 서로 바꿔 쓰거나 생략하지 마세요 — 표가 다르면 같은 숫자라도
완전히 다른 항목입니다.
🔢 연속 번호 압축 규칙: 같은 접두사의 번호가 3개 이상 "끊김 없이 연속"될 때(예: #G1, #G2, #G3, #G4, #G5,
#G6)는 하나하나 나열하지 말고 "#G1~G6"처럼 양 끝 번호만 남기고 압축해서 적으세요(두 번째 번호에는
접두사를 다시 붙이지 마세요 — "#G1~G6"이 맞고 "#G1~#G6"·"#G1~G6"의 G 생략은 틀립니다). 번호가 중간에
하나라도 끊기면(예: #G1, #G2, #G4처럼 #G3이 빠짐) 압축하지 말고 있는 그대로 각각 나열하세요. 번호가
2개뿐이면(예: #G1, #G2) 굳이 압축하지 말고 그대로 두 개 다 적어도 됩니다(압축은 3개 이상부터).

🔔 "알람 걸어줘/알림 설정해줘/알람 켜줘" 또는 "알람 해제해줘/꺼줘/취소해줘" 유형 요청에 대한 필수 규칙 (실제로 앱 데이터를 바꾸는 기능):
[업무 목록]의 각 줄 맨 앞 "#G숫자"에서 G 뒤의 숫자가 그 업무의 고유 번호입니다(알람/원문 조회는 Gantt
업무에만 있는 기능이라 항상 #G만 대상). 사용자가 특정 업무의 알람을 켜거나 끄고 싶다고 요청하면:
1. [업무 목록]에서 요청과 가장 일치하는 업무를 정확히 하나만 찾으세요 (업무명·담당자·내용 등을 종합 판단).
2. 일치하는 업무가 명확히 하나면, 평소처럼 자연스러운 한국어로 답변한 뒤 답변의 맨 마지막 줄에 아무 다른 글자 없이 정확히 이 형식만 추가하세요(태그 안에는 "G"를 빼고 숫자만 넣으세요):
   - "켜줘/걸어줘/설정해줘" 계열 요청 → [[ACTION:SET_ALARM:그업무의숫자]]  (예: #G12라면 [[ACTION:SET_ALARM:12]])
   - "꺼줘/해제해줘/취소해줘" 계열 요청 → [[ACTION:CLEAR_ALARM:그업무의숫자]]  (예: #G12라면 [[ACTION:CLEAR_ALARM:12]])
3. 일치하는 업무가 여러 개거나 하나도 없으면 절대 저 태그를 쓰지 말고, 어떤 업무인지 되물어보거나 "해당 업무를 찾지 못했습니다"라고 답하세요.
4. 이미 [알람ON]이 붙은 업무에 "켜줘"라고 하거나, [알람ON]이 없는(꺼져 있는) 업무에 "꺼줘"라고 하는 경우처럼 이미 원하는 상태인 경우엔 그 사실을 답변에 알려주고, 그래도 해당 태그는 그대로 붙이세요(중복 실행해도 안전하게 무시됨).
5. 알람과 무관한 질문에는 두 태그 모두 절대 붙이지 마세요. 방향(켜기/끄기)을 헷갈리지 마세요 — "해제"를 "설정"으로, "설정"을 "해제"로 착각해 반대 태그를 붙이면 안 됩니다.

📧 "원문/원본 메일 보여줘·읽어줘·확인해줘" 유형 요청에 대한 필수 규칙 (실제 메일 원문을 조회하는 기능):
[업무 목록]에서 " [원문有]" 표시가 붙은 업무는 등록 당시의 원본 이메일 전문이 시스템에 별도로 저장되어 있습니다 — 다만 이 목록에는 "있다/없다" 표시만 있고 원문 내용 자체는 아직 포함되어 있지 않으니, 표시만 보고 원문 내용을 안다고 착각하거나 지어내지 마세요.
1. 아래 [요청하신 원문 메일 전문] 섹션이 이미 포함되어 있다면, 그 내용을 근거로 바로 답변하세요(2~4번 절차를 다시 밟지 말고, 태그도 다시 붙이지 마세요).
2. 그 섹션이 없는데 사용자가 특정 업무의 원문/원본 메일을 보여달라/읽어달라고 요청하면, [업무 목록]에서 그 업무를 정확히 하나만 찾으세요.
3. 그 업무에 [원문有] 표시가 있으면, 다른 말이나 설명 없이 답변으로 정확히 이 한 줄만 출력하세요: [[ACTION:VIEW_MAIL:그업무의숫자]]  (원문 조회도 Gantt 업무 전용 기능이라 항상 #G의 숫자만 대상이며, 태그 안에는 "G"를 빼고 숫자만 넣습니다. 예: #G12라면 [[ACTION:VIEW_MAIL:12]]) — 시스템이 원문을 찾아 자동으로 다시 물어봅니다.
4. [원문有] 표시가 없는 업무면 태그를 쓰지 말고 "이 업무는 저장된 원본 메일이 없습니다"라고 답하세요. 일치하는 업무가 여러 개거나 하나도 없어도 태그를 쓰지 말고 되물어보세요.

[오늘 날짜]
${ctx.todayStr}

${ctx.projectLine}

[프로젝트 개요]
${ctx.overviewText}

[담당자/프로젝트 멤버]
${ctx.memberText}

[주요 자재]
${ctx.materialText}

[Customer SPEC — 고객 제안용 완제품 모델 비교]
${ctx.customerSpecText}

[M.C Table (원가/공수)]
${ctx.mcTableText}

[Elec Parts SPEC — 실사용 전자부품(원자재)의 상세 스펙]
${ctx.elecPartsText}

[주소록 — 이름/부서/직함만 포함, 연락처는 미포함]
${ctx.addressText}

전체 업무 수: ${ctx.totalTasks}건

[업무 목록]
${ctx.taskListText}
${mailSection}
[최근 변경 이력]
${ctx.recentLogsText}

[지금까지의 대화]
${historyText}

[사용자의 새 질문]
${question}

위 질문에 대한 답변만 작성하세요. 데이터 값을 담는 JSON 응답은 쓰지 마세요(단, 위 "🔔 알람"/"📧 원문 메일" 규칙에 따른 [[ACTION:SET_ALARM:번호]] / [[ACTION:CLEAR_ALARM:번호]] / [[ACTION:VIEW_MAIL:번호]] 태그는 예외입니다). 가독성을 위한 마크다운은 적극 사용하세요: 굵게(**제목**)로 소제목을 달고, "- " 글머리 기호로 항목을 나열하고, 필요하면 그 아래 두 칸 들여쓴 "  - "로 하위 항목(내용/조치 사항 등)을 붙이세요. 여러 이슈를 정리할 때는 이슈별로 소제목(굵게) 하나 + 하위 글머리 기호 여러 개 구조를 기본으로 쓰세요.`;
    };

    // 💡 위 원본 함수를 실데이터 대신 "${토큰}" 문자열 그 자체로 호출해서, 사용자가 편집할 수 있는
    //    "기본 프롬프트 텍스트"를 자동 생성한다. 아래 목록의 각 ${...}가 [🤖 AI 문답 → 📝 프롬프트]
    //    편집창에서 그대로 유지해야 하는 데이터 삽입 자리다(값 자체는 코드가 매번 새로 채워 넣음).
    window._defaultGanttQaPromptTemplate = window._buildGanttQaPromptTemplateRaw({
        todayStr: '${todayStr}', projectLine: '${projectLine}', overviewText: '${overviewText}',
        memberText: '${memberText}', materialText: '${materialText}', customerSpecText: '${customerSpecText}',
        mcTableText: '${mcTableText}', elecPartsText: '${elecPartsText}', addressText: '${addressText}',
        totalTasks: '${totalTasks}', taskListText: '${taskListText}', recentLogsText: '${recentLogsText}'
    }, '${question}', '${historyText}', '${mailSection}');

    // 💡 [2026-08-31 신규] AI 문답 프롬프트도 AI 업무분석/AI 프로젝트 요약과 동일하게 "팀 공용(Drive)
    //    프롬프트 텍스트 + 데이터 토큰 치환" 구조로 전환 — 문구 수정이 이제 코드 변경 없이
    //    [💬 AI 문답 → 📝 프롬프트]에서 가능하다. ctx(표/목록 데이터) 자체는 여전히 코드가 매번 새로
    //    만든다(사용자가 직접 타이핑할 수 없는 부분이므로) — 편집 가능한 건 지시문/설명 텍스트뿐이다.
    window._buildGanttQaPrompt = async function(question, priorHistory, mailTexts) {
        const ctx = await window._buildGanttQaContext();
        const historyText = (priorHistory && priorHistory.length)
            ? priorHistory.map(function(h) { return (h.role === 'user' ? '사용자' : 'AI') + ': ' + h.text; }).join('\n')
            : '(없음)';
        const mailSection = (mailTexts && mailTexts.length)
            ? `\n[요청하신 원문 메일 전문]\n${mailTexts.join('\n\n---\n\n')}\n`
            : '';

        const savedTemplate = localStorage.getItem('gantt_qa_prompt');
        const template = savedTemplate || window._defaultGanttQaPromptTemplate;
        // 💡 String.replace(문자열, ...)는 첫 매치만 치환한다 — 같은 토큰이 편집된 프롬프트에 두 번 이상
        //    쓰이면 나머지가 안 바뀌는, AI 프로젝트 요약에서 발견됐던 것과 같은 버그를 피하려고 처음부터
        //    split/join 기반 rep()으로 전체 치환한다.
        const rep = function(str, token, value) { return str.split(token).join(String(value)); };
        let result = template;
        result = rep(result, '${todayStr}', ctx.todayStr);
        result = rep(result, '${projectLine}', ctx.projectLine);
        result = rep(result, '${overviewText}', ctx.overviewText);
        result = rep(result, '${memberText}', ctx.memberText);
        result = rep(result, '${materialText}', ctx.materialText);
        result = rep(result, '${customerSpecText}', ctx.customerSpecText);
        result = rep(result, '${mcTableText}', ctx.mcTableText);
        result = rep(result, '${elecPartsText}', ctx.elecPartsText);
        result = rep(result, '${addressText}', ctx.addressText);
        result = rep(result, '${totalTasks}', ctx.totalTasks);
        result = rep(result, '${taskListText}', ctx.taskListText);
        result = rep(result, '${mailSection}', mailSection);
        result = rep(result, '${recentLogsText}', ctx.recentLogsText);
        result = rep(result, '${historyText}', historyText);
        result = rep(result, '${question}', question);
        return result;
    };

    // 💡 [2026-08-28 신규] AI 요약/AI 문답 답변에 나오는 "#98" 같은 업무 번호(컨텍스트의 taskListText가
    //    항상 "#숫자" 형태로 붙여주는 그 번호, [[ACTION:...]] 태그가 가리키는 번호와 동일)를 클릭하면
    //    그 업무로 실제 이동(스크롤+하이라이트)할 수 있게 링크로 바꿔준다 — "분석 내용이 원본과 맞는지
    //    확인하고 싶다"는 요청 대응. escapeHtml()을 거친 텍스트 위에서만 동작하고 \d+만 캡처하므로
    //    삽입 위험 없이 안전하게 재사용 가능(_mdToHtml/AI 요약 리포트 양쪽에서 공용으로 씀).
    // 💡 [2026-08-28 추가 → 같은 날 수정] "#98" 옆에 바로 알람을 켤 수 있는 아이콘도 같이 붙인다 —
    //    사용자가 매번 "이 업무 알람 걸어줘"라고 말로 다시 요청하지 않아도, 이미 구현된 알람 설정
    //    기능(아래 window._aiAssistSetAlarm)을 클릭 한 번으로 바로 실행할 수 있게 한다. 처음엔 🔔(종)을
    //    썼는데, 이 앱은 "No." 칸의 행별 알람 토글(window.wrToggleAlarm, 10824줄)부터 캘린더/텔레그램
    //    알람 알림까지 이미 전부 📌(압정)로 알람을 표시하고 있어서, 그 관례에 맞춰 📌으로 통일한다.
    // 💡 [2026-08-30 신규] "#98" 인용 옆에 원문 메일 링크와 발신인 이름도 같이 보여달라는 요청 —
    // AI가 자기 답변 텍스트에 직접 "발신:이름"을 적게 하면(다른 프롬프트 필드들처럼) 옮겨 적는 과정에서
    // 틀리거나 빠뜨릴 위험이 있으므로, #98처럼 실제 globalData[rowIndex]에서 프로그램적으로 정확한 값을
    // 읽어와 붙인다(📌 알람 아이콘과 동일한 이유). 원문이 없거나 발신인을 못 찾으면 그 부분만 조용히 생략.
    // 💡 [2026-08-30 신규] 인용 하나("#G105" 등)를 HTML로 만드는 로직을 함수로 분리 — 원래
    // _linkifyTaskRefs 안에서 정규식 콜백 하나로만 쓰던 걸, "#G1~G6" 압축 표시(아래
    // _linkifyTaskRefs의 range 분기)에서도 "양 끝 번호 두 개"를 똑같이 그리는 데 재사용하기 위해 뺐다.
    const _simpleRefJump = { CS: ['window._aiJumpToCsRow', 'Click to jump to this Customer SPEC row', '클릭하면 이 Customer SPEC 행으로 이동합니다'],
        MC: ['window._aiJumpToMcRow', 'Click to jump to this M.C Table row', '클릭하면 이 M.C Table 행으로 이동합니다'],
        EP: ['window._aiJumpToEpRow', 'Click to jump to this Elec Parts spec column', '클릭하면 이 Elec Parts 스펙 열로 이동합니다'],
        MT: ['window._aiJumpToMtRow', 'Click to jump to this material row', '클릭하면 이 주요 자재 행으로 이동합니다'],
        AD: ['window._aiJumpToAdRow', 'Click to jump to this address book row', '클릭하면 이 주소록 행으로 이동합니다'] };
    window._renderOneAiRef = function(p, n) {
        const _en = window._currentLang === 'en';
        const idx = parseInt(n, 10);
        if (_simpleRefJump[p]) {
            const def = _simpleRefJump[p];
            return `<span class="ai-task-ref" onclick="${def[0]}(${idx}); event.stopPropagation();" title="${_en ? def[1] : def[2]}" style="color:#0056b3; font-weight:bold; cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">#${p}${n}</span>`;
        }
        const rowIndex = idx;
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        // 💡 [2026-08-30 재작성] 요약/문답 답변에 "#G105, #G106, #G108"처럼 인용이 여러 개 연달아
        // 나오면, 매번 붙던 📌(알람)/📧(원문)/발신인 이름까지 다 펼쳐져 한 줄이 너무 길어져 보기
        // 불편하다는 지적 — M.C Table 제품구분자 패널과 같은 방식으로, 평소엔 작은 화살표(▶)만
        // 보이고 눌러야 그 안의 내용이 옆으로 슬라이드 펼쳐지게(◀ 누르면 다시 접힘) 바꿨다.
        let extra = `<span class="ai-alarm-ref" onclick="window._aiSetAlarmFromRef(${n}, event);" title="${_en ? 'Click to toggle this task\'s alarm on/off' : '클릭하면 이 업무의 알람을 켜고 끕니다(토글)'}" style="cursor:pointer; font-size:11px; vertical-align:middle;">📌</span>`;
        if (row) {
            if (row._mailRaw) {
                // 💡 [2026-08-30 축소] "📧원문"이었던 걸 아이콘만(📧)으로 — 글자 최소화 요청
                extra += `<span class="ai-mail-ref" onclick="window._showAiTaskMailModal(${rowIndex}); event.stopPropagation();" title="${_en ? 'View the original mail for this task' : '이 업무의 원본 메일 보기'}" style="cursor:pointer; margin-left:4px; font-size:11px;">📧</span>`;
            }
            const contentStr = (typeof colIdx !== 'undefined' && colIdx.content !== -1) ? (row[colIdx.content] || '').toString() : '';
            const mailPeople = window._extractMailSenderReceiver ? window._extractMailSenderReceiver(contentStr) : { sender: '' };
            if (mailPeople.sender) {
                // 💡 [2026-08-30 축소] "발신:김철수"였던 걸 "김철수"로 — 글자 최소화 요청("발신" 라벨 생략)
                extra += `<span style="color:#888; font-size:11px; margin-left:4px;">${escapeHtml(mailPeople.sender)}</span>`;
            }
        }
        return `<span class="ai-task-ref" onclick="window._aiJumpToRow(${n}); event.stopPropagation();" title="${_en ? 'Click to jump to this task' : '클릭하면 이 업무로 이동합니다'}" style="color:#0056b3; font-weight:bold; cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">#G${n}</span><span class="ai-ref-toggle" onclick="window._aiToggleRefExtra(this); event.stopPropagation();" title="${_en ? 'Show/hide alarm · mail · sender' : '펼치기/접기(알람·원문·발신인)'}">▶</span><span class="ai-ref-extra">${extra}</span>`;
    };
    window._linkifyTaskRefs = function(escapedText) {
        // 💡 [2026-08-30 확장] 표별 접두사(#G=Gantt, #CS=Customer SPEC, #MC=M.C Table, #EP=Elec Parts SPEC,
        //    #MT=주요 자재, #AD=주소록) 지원. 접두사 없는 bare "#숫자"는 더 이상 생성하지 않지만
        //    (과거 AI 응답/히스토리 호환 목적으로) #G와 동일하게 처리한다.
        // 💡 [2026-08-30 신규] "#G1~G6"(연속된 업무 6개를 AI가 범위로 압축해 적은 것 — 아래 프롬프트
        // 규칙 참고) 표시 지원. range 분기를 single 분기보다 정규식 앞쪽 대안(먼저 시도되는 alternation)
        // 에 둬서, "#G1~G6"이 "#G1"(단일)로 잘못 먼저 매칭되고 "~G6"만 텍스트로 남는 일이 없게 한다.
        // 양 끝(G1/G6)만 실제 클릭 가능한 번호+화살표로 그리고, 그 사이(G2~G5)는 숫자 자체를 아예
        // 만들지 않는다(사용자가 필요하면 G1이나 G6으로 가서 확인).
        return String(escapedText || '').replace(/#(G|CS|MC|EP|MT|AD)(\d+)~#?(?:G|CS|MC|EP|MT|AD)?(\d+)\b|#(G|CS|MC|EP|MT|AD)?(\d+)\b/g,
            function(m, rPrefix, rStart, rEnd, sPrefix, sNum) {
                if (rPrefix !== undefined) {
                    return window._renderOneAiRef(rPrefix, rStart) + '~' + window._renderOneAiRef(rPrefix, rEnd);
                }
                return window._renderOneAiRef(sPrefix || 'G', sNum);
            });
    };
    // 💡 위 "#G숫자 ▶" 화살표 클릭 시, 바로 옆 .ai-ref-extra(📌/📧/발신인)를 슬라이드로 펼치거나 접는다
    // (M.C Table의 mcToggleUnitActions와 동일한 max-width 트랜지션 패턴).
    window._aiToggleRefExtra = function(toggleEl) {
        const extra = toggleEl.nextElementSibling;
        if (!extra || !extra.classList.contains('ai-ref-extra')) return;
        const open = extra.classList.toggle('ai-ref-extra-open');
        toggleEl.textContent = open ? '◀' : '▶';
    };
    // 💡 위 "원문" 링크 클릭 시 뜨는 가벼운 읽기전용 모달 — Elec Parts 라이트박스(ep-lightbox-modal)와
    // 동일한 드래그 가능 팝업 패턴 재사용. Mail Analyzer 전체 작업공간을 여는 mailShowRightDetail은
    // 여기엔 과함(삽입/편집 기능까지 딸려 있음)이라 별도로 만듦.
    window._showAiTaskMailModal = function(rowIndex) {
        const _en = window._currentLang === 'en';
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        const mr = row && row._mailRaw;
        if (!mr) { if (window.showToast) window.showToast(_en ? '⚠️ No original mail saved for this task.' : '⚠️ 이 업무에는 저장된 원본 메일이 없습니다.', 'warning'); return; }
        let modal = document.getElementById('ai-mail-view-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-mail-view-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-mail-view-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:280px;">
                <div id="ai-mail-view-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                    <span id="ai-mail-view-title">📧 ${_en ? 'Original mail' : '원본 메일'}</span>
                    <button onclick="document.getElementById('ai-mail-view-modal').style.display='none'" onmouseover="this.style.background='#ffe9b8'; this.style.borderColor='#e6c070';" onmouseout="this.style.background='#fff8e6'; this.style.borderColor='#ffe08a';" style="background:#fff8e6; border:1px solid #ffe08a; border-radius:6px; color:#7a5210; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
                </div>
                <div id="ai-mail-view-body" style="padding:14px 18px; flex:1; overflow-y:auto; font-size:12.5px; white-space:pre-wrap; line-height:1.6; color:#333;"></div>
            </div>`;
            document.body.appendChild(modal);
            if (window._makeDraggable) window._makeDraggable('ai-mail-view-box', 'ai-mail-view-drag');
            if (window._bindClickToFront) window._bindClickToFront('ai-mail-view-modal');
            modal.onclick = function() { modal.style.display = 'none'; };
        }
        const bodyEl = document.getElementById('ai-mail-view-body');
        bodyEl.textContent = (_en ? 'Subject: ' : '제목: ') + (mr.subject || '-') + '\n'
            + (_en ? 'Sender: ' : '발신: ') + (mr.sender || '-') + '\n'
            + (_en ? 'Date: ' : '날짜: ') + (mr.date || '-') + '\n\n'
            + (mr.body2000 || (_en ? '(No body)' : '(본문 없음)'));
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('ai-mail-view-modal');
    };

    // 💡 [버그 수정] AI에게 마크다운(굵게/글머리 기호)으로 답하라고 프롬프트에 지시해도, 채팅창이
    //    escapeHtml()로 그대로 이스케이프해 white-space:pre-wrap으로만 찍고 있어서 "**제목**", "- 항목"
    //    같은 마크다운 기호가 글자 그대로 화면에 보였음 — Gemini 앱에서 보던 것처럼 소제목/글머리
    //    기호가 실제로 정리되어 보이려면 여기서 최소한의 마크다운을 HTML로 변환해줘야 함.
    //    보안: escapeHtml을 먼저 거친 뒤 그 결과 위에서만 **...**/글머리 기호 패턴을 치환하므로,
    //    AI 응답에 <script> 등이 섞여 있어도 이미 이스케이프된 텍스트라 안전함.
    window._mdToHtml = function(raw) {
        let escaped = escapeHtml(raw || '');
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // **굵게**
        escaped = window._linkifyTaskRefs(escaped); // #98 → 클릭 이동 링크
        const lines = escaped.split('\n');
        return lines.map(function(line) {
            const heading = line.match(/^(#{1,4})\s+(.*)$/);
            if (heading) return `<div style="font-weight:bold; margin:8px 0 3px;">${heading[2]}</div>`;
            const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
            if (bullet) {
                const depth = Math.floor(bullet[1].length / 2);
                const mark = depth > 0 ? '◦' : '•';
                const pad = 14 + depth * 16;
                return `<div style="padding-left:${pad}px; text-indent:-14px; margin-bottom:2px;">${mark}&nbsp;${bullet[2]}</div>`;
            }
            if (line.trim() === '') return '<div style="height:6px;"></div>';
            return `<div style="margin-bottom:2px;">${line}</div>`;
        }).join('');
    };

    window._renderGanttQaMessages = function() {
        const box = document.getElementById('gantt-qa-messages');
        if (!box) return;
        if (!window._ganttQaHistory.length) {
            box.innerHTML = '<div style="padding:30px 10px; text-align:center; color:#999; font-size:12px; line-height:1.6;">이 프로젝트의 Gantt 업무 · 개요 · 멤버 · 주요 자재에 대해 자유롭게 질문해보세요.<br>예) "김철수님 담당 업무 중 지연된 게 있어?"<br>예) "이 프로젝트 연간 수요량이 얼마야?"<br>예) "기구 담당자가 누구야?"</div>';
            return;
        }
        box.innerHTML = window._ganttQaHistory.map(function(m) {
            const isUser = m.role === 'user';
            // 💡 [2026-08-29 버그 수정] 원색 파랑(#0056b3) 배경 + 흰 글자 조합이었는데, 대부분의 브라우저
            //    기본 텍스트 선택(드래그) 하이라이트도 비슷한 파란 계열이라 이미 파란 배경 위에서는
            //    "지금 어디까지 선택됐는지"가 거의 안 보였다 — 그래서 복사하려고 드래그해도 선택 범위를
            //    확인할 수 없었음. 배경을 흐린 파랑으로, 글자는 진한 파랑으로 바꿔서 선택 하이라이트가
            //    배경과 뚜렷이 구분되게 한다(선택 안 된 상태에서도 읽기 편함은 그대로 유지).
            const bg = isUser ? '#e7f3ff' : (m.error ? '#fff0f0' : '#f1f3f5');
            const fg = isUser ? '#0056b3' : (m.error ? '#c92a2a' : '#333');
            const body = isUser
                ? `<div style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.text)}</div>`
                : `<div style="word-break:break-word;">${window._mdToHtml(m.text)}</div>`;
            // 💡 [2026-08-31 신규] AI 요약의 👍/👎 피드백 + 일괄개선과 동일한 개념을 AI 문답에도 적용 —
            //    답변 하나하나(m.uid, sendGanttQaMessage에서 부여)에 평가를 남기면, 쌓인 👎 케이스를
            //    [📝 프롬프트 → 🤖 일괄개선]에서 한 번에 모아 프롬프트 개선을 요청할 수 있다.
            const feedbackHtml = (!isUser && !m.pending && !m.error && m.uid) ? (function() {
                const fb = window._qaFeedbackFor(m.uid);
                const goodActive = fb && fb.rating === 'good';
                const badActive = fb && fb.rating === 'bad';
                return `<div style="display:flex; justify-content:flex-end; gap:4px; margin-top:4px; align-items:center;">
                    <span style="font-size:10px; color:#aaa; margin-right:2px;">도움이 되었나요?</span>
                    <button onclick="window.saveGanttQaFeedback('${m.uid}','good')" style="font-size:11px; padding:2px 8px; border:1px solid #a8dab8; background:${goodActive ? '#c9ecd3' : '#e6f6ea'}; color:#1f7a3d; border-radius:5px; font-weight:bold; cursor:pointer;">👍</button>
                    <button onclick="window.saveGanttQaFeedback('${m.uid}','bad')" style="font-size:11px; padding:2px 8px; border:1px solid #eeb0ac; background:${badActive ? '#f5c2bd' : '#fbe4e2'}; color:#b1432f; border-radius:5px; font-weight:bold; cursor:pointer;">👎</button>
                    ${badActive ? `<button onclick="window.openQaImproveCommentModal('${m.uid}')" style="font-size:10.5px; padding:2px 8px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; cursor:pointer; white-space:nowrap;">💡 의견</button>` : ''}
                </div>`;
            })() : '';
            return `<div style="display:flex; flex-direction:column; align-items:${isUser ? 'flex-end' : 'flex-start'}; margin-bottom:10px;">
                <div style="max-width:82%; padding:9px 12px; border-radius:10px; background:${bg}; color:${fg}; font-size:12.5px; line-height:1.55;">${body}</div>
                ${feedbackHtml ? `<div style="max-width:82%; width:100%;">${feedbackHtml}</div>` : ''}
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    };

    // 💡 [2026-08-28 신규] AI 문답이 실제로 앱 데이터를 바꿀 수 있는 유일한 통로 — AI 답변 끝에 붙는
    //    [[ACTION:SET_ALARM:번호]] 태그를 찾아 그 행의 알람(_알림)을 실제로 켠다. wrToggleAlarm()과
    //    달리 "토글"이 아니라 "설정"이라서 이미 켜져 있으면 아무 것도 건드리지 않고 그 사실만 알려준다
    //    (안전한 재실행). rowIndex가 잘못됐거나(응답 이후 행이 삭제됨 등) 유효하지 않으면 실패로 반환.
    window._aiAssistSetAlarm = function(rowIndex) {
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        const alreadyOn = !!row._알림;
        if (!alreadyOn) {
            row._알림 = true;
            logChange(rowIndex, -1, '알림 설정', '알림 켜짐', 'AI 문답으로 설정');
            renderTable(globalData);
            applyFilters();
            if (window.paintRowSelection) window.paintRowSelection();
            const alarmPanel = document.getElementById('tab-alarm');
            if (alarmPanel && alarmPanel.classList.contains('active') && window.renderAlarmTab) window.renderAlarmTab();
        }
        return { ok: true, alreadyOn: alreadyOn, taskName: label };
    };

    // 💡 [2026-08-28 신규] 위 window._aiAssistSetAlarm의 "끄기" 짝 — "알람 해제해줘/꺼줘/취소해줘" 요청에
    //    대응한다. 이미 꺼져 있으면(원래부터 알람이 없던 업무 포함) 아무 것도 건드리지 않고 그 사실만
    //    알려준다(안전한 재실행 — SET_ALARM과 대칭되는 설계).
    window._aiAssistClearAlarm = function(rowIndex) {
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        const alreadyOff = !row._알림;
        if (!alreadyOff) {
            row._알림 = false;
            logChange(rowIndex, -1, '알림 설정', '알림 꺼짐', 'AI 문답으로 설정');
            renderTable(globalData);
            applyFilters();
            if (window.paintRowSelection) window.paintRowSelection();
            const alarmPanel = document.getElementById('tab-alarm');
            if (alarmPanel && alarmPanel.classList.contains('active') && window.renderAlarmTab) window.renderAlarmTab();
        }
        return { ok: true, alreadyOff: alreadyOff, taskName: label };
    };

    // 💡 [2026-08-28 신규 → 같은 날 수정] 위 window._linkifyTaskRefs가 "#98" 옆에 붙여주는 📌 아이콘의
    //    클릭 핸들러 — 처음엔 window._aiAssistSetAlarm(항상 "켜기"만 하고 이미 켜져 있으면 그 사실만
    //    알려줌)을 그대로 썼는데, "한 번 클릭하면 켜고 한 번 더 클릭하면 꺼지게(토글) 해달라"는 피드백으로
    //    "No." 칸의 행별 알람 핀(window.wrToggleAlarm, 5649줄)과 동일한 진짜 토글 방식으로 바꿨다.
    //    (AI가 "알람 걸어줘" 같은 말로 요청했을 때 처리하는 [[ACTION:SET_ALARM]] 쪽은 "걸어줘"라는 표현
    //    자체가 켜기를 의미하므로 그대로 "켜기 전용" 동작을 유지 — window._aiAssistSetAlarm은 안 건드림.)
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

    // AI 답변 텍스트에서 [[ACTION:SET_ALARM:번호]] 또는 [[ACTION:CLEAR_ALARM:번호]] 태그를 찾아 제거하고,
    // 실행 결과 안내문을 답변에 덧붙인다. 태그가 없으면 원문을 그대로 반환.
    // 💡 [2026-08-28 신규] "알람 해제해줘" 요청 대응 — CLEAR_ALARM 태그 처리를 추가(SET_ALARM과 대칭).
    //    한 답변에 두 태그가 동시에 나올 일은 없지만(프롬프트가 방향당 하나만 붙이도록 지시), 방어적으로
    //    SET_ALARM을 먼저 찾고 없으면 CLEAR_ALARM을 찾는다.
    window._applyGanttQaActions = function(text) {
        const mSet = text.match(/\[\[ACTION:SET_ALARM:(\d+)\]\]/);
        if (mSet) {
            const cleaned = text.replace(mSet[0], '').trim();
            const res = window._aiAssistSetAlarm(parseInt(mSet[1], 10));
            if (!res.ok) return cleaned + '\n\n⚠️ 지정한 업무를 찾지 못해 알람을 설정하지 못했습니다.';
            return cleaned + (res.alreadyOn
                ? `\n\n📌 "${res.taskName}" 업무는 이미 알람이 켜져 있었습니다.`
                : `\n\n✅ "${res.taskName}" 업무에 알람을 설정했습니다.`);
        }
        const mClear = text.match(/\[\[ACTION:CLEAR_ALARM:(\d+)\]\]/);
        if (mClear) {
            const cleaned = text.replace(mClear[0], '').trim();
            const res = window._aiAssistClearAlarm(parseInt(mClear[1], 10));
            if (!res.ok) return cleaned + '\n\n⚠️ 지정한 업무를 찾지 못해 알람을 해제하지 못했습니다.';
            return cleaned + (res.alreadyOff
                ? `\n\n📌 "${res.taskName}" 업무는 이미 알람이 꺼져 있었습니다.`
                : `\n\n✅ "${res.taskName}" 업무의 알람을 해제했습니다.`);
        }
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

            text = window._applyGanttQaActions(text.trim());
            window._ganttQaHistory.pop(); // "⏳ 답변 생성 중..." placeholder 제거
            // 💡 uid/question을 함께 저장 — 아래 👍/👎 피드백(window.saveGanttQaFeedback)이 이 답변을
            //    질문과 묶어서 기록하고, 나중에 [🤖 일괄개선]이 "무슨 질문에 어떻게 잘못 답했는지"를
            //    AI에게 다시 보여줄 수 있게 한다.
            window._ganttQaHistory.push({ role: 'ai', text: text.trim(), uid: 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), question: question });
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
            <div id="gantt-qa-improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
                <div id="gantt-qa-improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ 어떤 부분이 문제였나요?</span>
                    <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-improve-comment-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
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
            <div id="gantt-qa-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="gantt-qa-improve-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 프롬프트 개선 제안 (AI 문답)</span>
                    <button onclick="document.getElementById('gantt-qa-improve-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
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
        window._renderGanttQaMessages();
    };

    window.openGanttQaModal = function() {
        let modal = document.getElementById('gantt-qa-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'gantt-qa-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9150; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="gantt-qa-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:380px;">
                <div id="gantt-qa-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>💬 Gantt AI 문답</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.openGanttQaPromptModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="AI 문답 프롬프트 편집" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">📝 프롬프트</button>
                        <button onclick="document.getElementById('gantt-qa-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                    </div>
                </div>
                <div style="padding:8px 18px 0; font-size:10.5px; color:#999;">현재 열려있는 프로젝트의 Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · 주소록(이름/부서/직함) 데이터를 근거로 답변합니다. (대화는 저장되지 않습니다)</div>
                <div id="gantt-qa-messages" style="overflow-y:auto; flex:1; padding:12px 16px;"></div>
                <div style="padding:10px 14px; border-top:1px solid #eee; display:flex; gap:8px;">
                    <textarea id="gantt-qa-input" rows="1" placeholder="이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)" style="flex:1; resize:none; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:12.5px; font-family:inherit; line-height:1.4; max-height:80px;" onkeydown="if(event.key==='Enter' &amp;&amp; !event.shiftKey){ event.preventDefault(); window.sendGanttQaMessage(); }"></textarea>
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
            <div id="gantt-qa-prompt-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="gantt-qa-prompt-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>📝 AI 문답 — 프롬프트 편집</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.showQaPromptLogs()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">🕒 이력</button>
                        <button onclick="document.getElementById('gantt-qa-prompt-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
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
                    <button id="gantt-qa-prompt-save-btn" onclick="window.saveGanttQaPromptFromModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">💾 저장</button>
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
                <div id="gantt-qa-prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:600px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                    <div id="gantt-qa-prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                        <span>🕒 AI 문답 — 프롬프트 변경 이력</span>
                        <button onclick="event.stopPropagation(); document.getElementById('gantt-qa-prompt-log-modal').style.display='none'"
                            style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px;
                                   color:#1a4f7a; font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';"
                            onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                            title="닫기">✕</button>
                    </div>
                    <div id="gantt-qa-prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                    <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                        <button onclick="window.clearQaPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                        <button onclick="document.getElementById('gantt-qa-prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">✖ 닫기</button>
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
    window.setAiMailMaxLen = function(v) {
        localStorage.setItem('gantt_ai_mail_maxlen', String(v));
    };

    // 💡 [2026-08-28 개편] "AI 도구 → 설정"에서 흩어져 있던 AI 관련 설정을 한 곳으로 모음 —
    //    ① AI 모델 선택(원래 AI 업무분석 팝업에 있던 AI 선택/모델/API 키를 이리로 이동)
    //    ② AI 글자 수 설정(기존 메일 분석/요약·문답 최대 글자 수)
    //    "메일 자동배치 설정"과 동일한 펼치기/접기 아코디언 구조(window._toggleAlarmSection 재사용)로
    //    만들어서, 나중에 설정 항목이 늘어나도 그룹만 추가하면 되게 함.
    window.openAiToolsSettingsModal = function() {
        let modal = document.getElementById('ai-tools-settings-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-tools-settings-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9160; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-tools-settings-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:640px; max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
                <div id="ai-tools-settings-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2; flex-shrink:0;">
                    <span>⚙️ AI 분석 설정</span>
                    <button onclick="document.getElementById('ai-tools-settings-modal').style.display='none'" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';">✕</button>
                </div>
                <div style="overflow-y:auto; flex:1; padding:14px 18px; display:flex; flex-direction:column; gap:10px;">

                    <!-- ══ 그룹1: AI 모델 선택 (기본 접힘) — 원래 AI 업무분석 팝업에 있던 것을 이동 ══ -->
                    <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                        <div onclick="window._toggleAlarmSection('ai-set-sec-model')"
                             style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                            <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🤖 AI 모델 선택</span>
                            <span id="ai-set-sec-model-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                        </div>
                        <div id="ai-set-sec-model" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <span id="mail-ai-section-label" style="white-space:nowrap; width:70px; flex-shrink:0; display:inline-block;">🤖 AI 선택</span>
                                <select id="mail-ai-provider" onchange="window.onAiProviderChange()"
                                        style="flex:1; min-width:0; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                    <option value="gemini">Gemini (Google)</option>
                                    <option value="groq">Groq — 오픈모델 무료 호스팅</option>
                                    <option value="mistral">Mistral (프랑스 AI, 무료)</option>
                                    <option value="openai">OpenAI (GPT, 유료·카드등록 필요)</option>
                                </select>
                            </div>
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <span id="mail-ai-model-label" style="white-space:nowrap; width:70px; flex-shrink:0; display:inline-block;">🔧 모델 선택</span>
                                <select id="mail-ai-model" onchange="window.onAiModelChange()"
                                        style="flex:1; min-width:0; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                </select>
                            </div>
                            <div id="mail-model-guide" style="display:none; font-size:10px; color:#555; background:#fffbe6; border:1px solid #ffe066; border-radius:4px; padding:5px 8px; margin-bottom:4px; line-height:1.5;"></div>
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <span id="mail-key-label">🔑 Gemini API</span>
                                <div style="display:flex; gap:4px;">
                                    <button id="mail-cache-clear-btn" onclick="window.clearGeminiCache()"
                                            onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';"
                                            title="같은 메일을 다시 분석해도 캐시된 예전 결과가 아니라 새로 계산하게 함"
                                            style="height:26px; padding:0 8px; font-size:11px; font-weight:bold; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                        🗑️ 캐시 초기화
                                    </button>
                                    <button id="mail-key-link-btn" onclick="window.open('https://aistudio.google.com/apikey', '_blank')"
                                            onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                                            title=""
                                            style="height:26px; padding:0 8px; font-size:11px; font-weight:bold; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                        🔗 발급받기
                                    </button>
                                </div>
                            </div>
                            <div id="mail-key-guide" style="display:none;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mail-gemini-key" type="password" placeholder="AIza..."
                                    style="flex:1; min-width:0; box-sizing:border-box; height:26px; padding:0 8px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                <button id="mail-key-save-btn" onclick="window.saveGeminiKey()"
                                        onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                                        title="API 키 저장"
                                        style="height:26px; padding:0 10px; font-size:11px; font-weight:bold; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                    💾 저장
                                </button>
                                <button onclick="window.clearGeminiKey()"
                                        onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                                        title="API 키 삭제"
                                        style="height:26px; padding:0 8px; font-size:11px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:4px; cursor:pointer; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                    🗑️
                                </button>
                            </div>
                            <div id="mail-key-status" style="font-size:11px; margin-top:3px; color:#28a745;"></div>
                        </div>
                    </div>

                    <!-- ══ 그룹2: AI 글자 수 설정 (기본 접힘) — 기존 메일분석/요약·문답 최대 글자 수 통합 ══ -->
                    <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                        <div onclick="window._toggleAlarmSection('ai-set-sec-maxlen')"
                             style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                            <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🔢 AI 글자 수 설정</span>
                            <span id="ai-set-sec-maxlen-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                        </div>
                        <div id="ai-set-sec-maxlen" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">AI 업무 분석(메일) 최대 글자 수</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🤖 AI 업무 분석이 메일 본문을 AI(Gemini)에게 보낼 때 최대 몇 자까지 보낼지 정합니다. 너무 짧으면 본문 뒷부분 내용이 잘려서 분석이 부실해지고, 너무 길면 토큰 사용량이 늘고 분석 시간이 느려지거나 실패할 수 있습니다.</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-mail-maxlen-input" type="number" min="500" max="5000" step="100" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-mail-maxlen-input').value=window._AI_MAIL_MAXLEN_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 2000자 (기본값)</div>
                            <div style="border-top:1px solid #eee; margin:16px 0;"></div>
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">AI 요약·문답 최대 글자 수 (업무 상세내용/답변)</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🤖 AI 요약 · 💬 AI 문답이 각 업무의 "상세내용"/"답변" 필드를 읽을 때 최대 몇 자까지 참고할지 정합니다. 너무 짧으면 세부 내용(수치·번호 등)이 잘려서 답변이 부실해지고, 너무 길면 업무가 많을 때 응답이 느려지거나 실패할 수 있습니다.</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-content-maxlen-input" type="number" min="100" max="3000" step="50" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-content-maxlen-input').value=window._AI_CONTENT_MAXLEN_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 500자 (기본값)</div>
                        </div>
                    </div>

                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px; flex-shrink:0;">
                    <button onclick="window.saveAiToolsSettings()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; transition:background .15s, border-color .15s;">💾 저장</button>
                    <button onclick="document.getElementById('ai-tools-settings-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; border:1px solid #ccc; background:#f8f9fa; border-radius:4px; cursor:pointer; font-size:12.5px; transition:background .15s;">✖ 닫기</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ai-tools-settings-box', 'ai-tools-settings-drag');
            window._bindClickToFront('ai-tools-settings-modal');
        }
        document.getElementById('ai-mail-maxlen-input').value = window.getAiMailMaxLen();
        document.getElementById('ai-content-maxlen-input').value = window.getAiContentMaxLen();
        // 💡 이 모달로 옮겨온 mail-ai-provider/mail-ai-model/mail-gemini-key 등은 원래 AI 업무분석
        //    팝업이 열릴 때만 채워지던 값들이라, 여기서도 열릴 때마다 새로 채워줘야 함.
        if (window.refreshAiKeyPanel) window.refreshAiKeyPanel();
        if (window.refreshAiModelDropdown) window.refreshAiModelDropdown();
        modal.style.display = 'block';
        window.bringModalToFront('ai-tools-settings-modal');
    };

    window.saveAiToolsSettings = function() {
        const mailInput = document.getElementById('ai-mail-maxlen-input');
        let mv = parseInt(mailInput.value, 10);
        if (!mv || mv < 500) mv = 500;
        if (mv > 5000) mv = 5000;
        mailInput.value = mv;
        window.setAiMailMaxLen(mv);

        const input = document.getElementById('ai-content-maxlen-input');
        let v = parseInt(input.value, 10);
        if (!v || v < 100) v = 100;
        if (v > 3000) v = 3000;
        input.value = v;
        window.setAiContentMaxLen(v);
        if (window.showToast) window.showToast('✅ 설정을 저장했습니다. (메일 분석 최대 ' + mv + '자 · 업무 상세내용 최대 ' + v + '자)', 'info');
    };

    // 🤖 [2026-08-27] "AI 요약"/"AI 문답"/"AI 분석 설정"은 상단 메뉴 "🤖 AI 도구"(및 "⚙️ 설정")로
    //    이동 배치됨 — window.openAiProjectSummaryModal() / window.openGanttQaModal() /
    //    window.openAiToolsSettingsModal()을 각 버튼이 직접 호출.

    function logChange(rowIndex, colIndex, oldVal, newVal, reason) {
        if (!globalData || globalData.length === 0) return;
        let colName = colIndex === -1 ? "행 조작" : (globalData[0][colIndex] || `Col ${colIndex}`);
        let rowName = rowIndex; 
        let tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
        if (tr) {
            let noTd = tr.querySelector('.no-td');
            if (noTd) {
                let span = noTd.querySelector('.row-num-span');
                if (span && span.textContent) rowName = span.textContent.trim();
                else if (noTd.textContent) rowName = noTd.textContent.replace(/➕|➖|◀|▶/g, '').trim() || rowIndex;
            }
        } else if (globalData[rowIndex]) { rowName = globalData[rowIndex][colIdx.no] || rowIndex; }
        
        window.changeLogs.push({ 
            time: new Date().toLocaleString('ko-KR'), userName: window.currentUserName || "비로그인 (로컬)", rowName: rowName, colName: colName, oldVal: oldVal, newVal: newVal, reason: reason || ''
        });
    }

    // ✅ [공용] 선택적 사유 입력 — 비워두면 "사유 미기재"로 자동 기록.
    //    Gantt(changeLogs)뿐 아니라 M.C Table 등 다른 이력 페이지에서도 동일하게 재사용.
    //    취소(Cancel) 시 null 반환 → 호출부는 작업 자체를 중단하도록 처리할 것.
    window.promptOptionalReason = function(actionLabel) {
        const input = prompt(`📝 ${actionLabel} 사유를 입력해주세요.\n(선택 입력 — 비워두고 확인을 누르면 "사유 미기재"로 기록됩니다)`, '');
        if (input === null) return null;
        const trimmed = input.trim();
        return trimmed ? trimmed : '사유 미기재';
    };


    // 💡 Gantt 변경 이력 — M.C Table과 동일하게 표 하단 펼침 박스 형태로 표시
    window.ganttToggleHistoryBox = function() {
        const body = document.getElementById('gantt-history-body');
        const icon = document.getElementById('gantt-history-toggle-icon');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (icon) icon.textContent = isOpen ? '▶' : '▼';
        if (!isOpen && window.showHistoryModal) {
            // 💡 기존 showHistoryModal()의 렌더링 로직을 그대로 재사용하되, 모달을 띄우지 않고 박스 안의 #history-content만 채움
            window.showHistoryModal();
        }
    };


    // 💡 수정이력 — 비밀번호 확인 후 날짜 구간 내 기록 삭제 (Gantt changeLogs + M.C Table mcChangeLog 둘 다 정리)
window.deleteHistoryByDateRange = function() {
    const pwEl = document.getElementById('history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) {
        if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    const fromStr = (document.getElementById('history-del-from') || {}).value;
    const toStr = (document.getElementById('history-del-to') || {}).value;
    if (!fromStr || !toStr) {
        if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) {
        if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }

    // 💡 "2026. 6. 28. 오후 3:24:00" 형식(toLocaleString('ko-KR'))의 시각 문자열을 직접 파싱
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) {
        const ts = parseKoDateTime(log.time);
        return ts !== null && ts >= fromTs && ts <= toTs;
    };

    const doDelete = function() {
        let removedCount = 0;
        if (window.changeLogs && window.changeLogs.length) {
            const before = window.changeLogs.length;
            window.changeLogs = window.changeLogs.filter(function(log) { return !inRange(log); });
            removedCount += before - window.changeLogs.length;
        }
        if (window.tabData && window.tabData.mcChangeLog && window.tabData.mcChangeLog.length) {
            const before2 = window.tabData.mcChangeLog.length;
            window.tabData.mcChangeLog = window.tabData.mcChangeLog.filter(function(log) { return !inRange(log); });
            removedCount += before2 - window.tabData.mcChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        window.showHistoryModal();
        const msg = removedCount + '건의 기록을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };

    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

    window.showHistoryModal = function() {
        let content = document.getElementById('history-content');
        if (!window.changeLogs || window.changeLogs.length === 0) {
            content.innerHTML = '<div style="padding:10px; color:#999;">' + window._t('수정 이력이 없습니다.', 'No change history.') + '</div>';
        } else {
            // 🐛 [2026-08-30 버그 수정] 원래 이 선언이 아래 템플릿 문자열 "안"에 들어가 있었다
            // (`<tr>` 다음 줄). 문자열 안이라 실제로 실행되지 않으므로 _hisEn은 선언된 적이 없고,
            // 바로 다음 줄의 ${_hisEn ? ...}에서 ReferenceError가 나서 — 변경 이력이 1건이라도
            // 있으면 Gantt "변경 이력 확인" 내용이 통째로 안 그려졌다(빈 이력일 때만 정상 동작).
            const _hisEn = window._currentLang === 'en';
            let html = `
                <table class="history-table">
                    <thead>
                        <tr>
                            <th style="width:13%;">${_hisEn ? 'Date/Time' : '변경 일시'}</th>
                            <th style="width:10%;">${_hisEn ? 'Editor' : '수정자'}</th>
                            <th style="width:8%;">${_hisEn ? 'No (Row)' : 'No (행)'}</th>
                            <th style="width:11%;">${_hisEn ? 'Changed Field' : '변경 항목'}</th>
                            <th style="width:21%;">${_hisEn ? 'Before (Old)' : '변경 전 (Old)'}</th>
                            <th style="width:21%;">${_hisEn ? 'After (New)' : '변경 후 (New)'}</th>
                            <th style="width:16%;">${_hisEn ? 'Reason' : '사유'}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            let reversedLogs = [...window.changeLogs].reverse();
            reversedLogs.forEach(log => {
                html += `
                    <tr>
                        <td style="color:#6c757d; font-size:11px;">${log.time}</td>
                        <td style="font-weight:bold; color:#0056b3;">${escapeHtml(log.userName || (_hisEn ? "Unknown" : "알 수 없음"))}</td>
                        <td style="font-weight:bold;">${escapeHtml(log.rowName)}</td>
                        <td><span class="badge" style="background:#e7f1ff; color:#0056b3;">${escapeHtml(log.colName)}</span></td>
                        <td class="val-old">${escapeHtml(log.oldVal || "-")}</td>
                        <td class="val-new">${escapeHtml(log.newVal || "-")}</td>
                        <td style="color:#6c757d; font-size:11px;">${escapeHtml(log.reason || "-")}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            content.innerHTML = html;
        }
    };

    window.closeHistoryModal = function(e) {
        if (e && e.target !== document.getElementById('history-overlay')) return;
        document.getElementById('history-overlay').style.display = 'none';
    };

    window.toggleRowActions = function(td, rowIndex) {
    let popup = document.getElementById('row-action-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'row-action-popup';
        popup.className = 'row-action-popup';
        popup.innerHTML = `
           <div style="display:grid; grid-template-columns:repeat(3,33px); grid-template-rows:repeat(2,33px); gap:4px; align-items:center; justify-items:center; user-select:none; -webkit-user-select:none;">
    
            <span id="rap-up"    class="rap-btn" title="위로 이동"><i class="ti ti-chevron-up"></i></span>
            <span id="rap-left"  class="rap-btn" title="WBS 레벨 올리기"><i class="ti ti-chevron-left"></i></span>
            <span id="rap-right" class="rap-btn" title="WBS 레벨 내리기"><i class="ti ti-chevron-right"></i></span>
            <span id="rap-dn"    class="rap-btn" title="아래로 이동"><i class="ti ti-chevron-down"></i></span>
            <span id="rap-add"   class="rap-btn rap-btn-add" title="행 추가"><i class="ti ti-plus"></i></span>
            <span id="rap-del"   class="rap-btn rap-btn-danger" title="행 삭제"><i class="ti ti-minus"></i></span>

        </div>`;
        document.body.appendChild(popup);
        _makeFloatingPopupDraggable(popup);

        // 외부 클릭 시 닫기
        document.addEventListener('click', function(e) {
        if (!popup.contains(e.target) && !e.target.closest('.no-td')
            && !e.target.closest('#confirm-delete-modal')
            && !e.target.closest('#confirm-level0-modal')) {
            popup.style.display = 'none';
            window.clearRowHighlight();
        }
    });
    }

    // 현재 팝업이 같은 행이면 닫기
    if (popup.style.display === 'block' && popup.dataset.rowIndex === String(rowIndex)) {
        popup.style.display = 'none';
        window.clearRowHighlight();
        return;
    }

    popup.dataset.rowIndex = rowIndex;
    window.highlightRow(rowIndex);

    // 버튼 이벤트 재등록
    let actions = {
        'rap-up':    () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { const ni = window.moveSelectedRows(-1); if (ni != null) rowIndex = ni; }
            else { const ni = window.moveRow(rowIndex, -1); if (ni != null) rowIndex = ni; window._selectedRows = new Set(); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-dn':    () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { const ni = window.moveSelectedRows(+1); if (ni != null) rowIndex = ni; }
            else { const ni = window.moveRow(rowIndex, +1); if (ni != null) rowIndex = ni; window._selectedRows = new Set(); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-del':   () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { window.deleteSelectedRows(); popup.style.display='none'; window.clearRowHighlight(); return; }
            window._selectedRows = new Set();
            window.deleteRow(rowIndex); setTimeout(() => { if(document.querySelector(`tr[data-row-index="${rowIndex}"]`)) { popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); } else { popup.style.display='none'; window.clearRowHighlight(); } }, 20);
        },
        'rap-left':  () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.changeSelectedRowsLevel(-1); }
            else { window.changeRowLevel(rowIndex, -1); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-right': () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.changeSelectedRowsLevel(+1); }
            else { window.changeRowLevel(rowIndex, +1); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-add':   () => { window.addRow(rowIndex); rowIndex++; popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); },
        'rap-del':   () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.deleteSelectedRows(); popup.style.display='none'; window.clearRowHighlight(); return; }
            window.deleteRow(rowIndex); setTimeout(() => { if(document.querySelector(`tr[data-row-index="${rowIndex}"]`)) { popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); } else { popup.style.display='none'; window.clearRowHighlight(); } }, 20);
        },
    };
    Object.entries(actions).forEach(([id, fn]) => {
        let btn = document.getElementById(id);
        let newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        document.getElementById(id).addEventListener('click', fn);
    });

    // 📌 상하좌우+- 는 WBS(레벨/순서) 관련 기능이므로, No 셀이 아니라 같은 행의 WBS 셀 옆에 뜨도록 앵커
    const wbsCellForPopup = td.closest('tr') ? td.closest('tr').querySelector('.wbs-cell') : null;
    let rect = (wbsCellForPopup || td).getBoundingClientRect();
    popup.style.display = 'block';
    let popupW = popup.offsetWidth;
    let popupH = popup.offsetHeight;
    let top = rect.top + window.scrollY;
    // 💡 업무명 텍스트에 더 가깝게 — 버튼 크기(33px)의 2배만큼 기존 위치보다 왼쪽(안쪽)으로 당김
    const RAP_BTN_SIZE = 33;
    let left = rect.right + window.scrollX + 5 - (RAP_BTN_SIZE * 2);

    // 화면 밖으로 나가면 왼쪽에 표시
    if (left + popupW > window.innerWidth) left = rect.left + window.scrollX - popupW - 5;
    // 아래로 넘치면 위로 올림
    if (top + popupH > window.innerHeight + window.scrollY) top = rect.bottom + window.scrollY - popupH;

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
};

    window.addRow = function(index) {
        if (index <= 0) { alert("최상단 행에는 추가할 수 없습니다."); return; }
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        
        let parentRow = globalData[index]; let newRow = new Array(globalData[0].length).fill("");
        newRow._level = parentRow._level; if (colIdx.status !== -1) newRow[colIdx.status] = parentRow[colIdx.status] || "진행";
        
        for(let i=0; i<globalData[0].length; i++) {
            if ([colIdx.no, colIdx.bogo, colIdx.start, colIdx.plan, colIdx.period, colIdx.dur1, colIdx.dur2, colIdx.dur3, colIdx.dur4, colIdx.chart, colIdx.content, colIdx.answer, colIdx.devStage, colIdx.taskType1, colIdx.taskType2, colIdx.taskType3, colIdx.taskType4].includes(i)) continue;
            newRow[i] = parentRow[i] || "";
        }

        newRow._origDev = ""; newRow._origT1 = ""; newRow._origT2 = ""; newRow._origT3 = ""; newRow._origT4 = "";
        let newTaskName = "새로운 업무";

        if (newRow._level === 0) newRow._origDev = newTaskName; else if (newRow._level === 1) newRow._origT1 = newTaskName; else if (newRow._level === 2) newRow._origT2 = newTaskName; else if (newRow._level === 3) newRow._origT3 = newTaskName; else if (newRow._level === 4) newRow._origT4 = newTaskName;
        
        newRow._explicitStartTs = null; newRow._explicitPlanTs = null; newRow._finalDuration = 1;
        if (colIdx.period !== -1) newRow[colIdx.period] = "1";
        if (newRow._level === 1 && colIdx.dur1 !== -1) newRow[colIdx.dur1] = "1";
        if (newRow._level === 2 && colIdx.dur2 !== -1) newRow[colIdx.dur2] = "1";
        if (newRow._level === 3 && colIdx.dur3 !== -1) newRow[colIdx.dur3] = "1";
        if (newRow._level === 4 && colIdx.dur4 !== -1) newRow[colIdx.dur4] = "1";

        globalData.splice(index + 1, 0, newRow); 
        logChange(index + 1, -1, "없음", "행 추가됨");
        window.recalculateSchedules();
    };

    window.changeRowLevel = function(index, direction) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        let row = globalData[index]; if (!row) return;

        let oldLevel = row._level;
        let newLevel = Math.max(0, Math.min(4, oldLevel + direction));
        if (newLevel === oldLevel) return;

        let taskTxt = "";
        if (oldLevel === 0) taskTxt = row._origDev; else if (oldLevel === 1) taskTxt = row._origT1; else if (oldLevel === 2) taskTxt = row._origT2; else if (oldLevel === 3) taskTxt = row._origT3; else if (oldLevel === 4) taskTxt = row._origT4;
        taskTxt = (taskTxt || "").toString().trim() || "새로운 업무";

        let processChange = function() {
            row._level = newLevel;
            row._origDev = ""; row._origT1 = ""; row._origT2 = ""; row._origT3 = ""; row._origT4 = "";
            if (newLevel === 0) row._origDev = taskTxt; else if (newLevel === 1) row._origT1 = taskTxt; else if (newLevel === 2) row._origT2 = taskTxt; else if (newLevel === 3) row._origT3 = taskTxt; else if (newLevel === 4) row._origT4 = taskTxt;
            
            let currentDur = row._finalDuration || 1;
            if (colIdx.dur1 !== -1) row[colIdx.dur1] = (newLevel === 1) ? currentDur.toString() : "";
            if (colIdx.dur2 !== -1) row[colIdx.dur2] = (newLevel === 2) ? currentDur.toString() : "";
            if (colIdx.dur3 !== -1) row[colIdx.dur3] = (newLevel === 3) ? currentDur.toString() : "";
            if (colIdx.dur4 !== -1) row[colIdx.dur4] = (newLevel === 4) ? currentDur.toString() : "";

            let levelLabels = ["대분류(0)", "소요1(1)", "소요2(2)", "소요3(3)", "소요4(4)"];
            logChange(index, -1, `계층 변경`, `${levelLabels[oldLevel]} → ${levelLabels[newLevel]}`);
            window.recalculateSchedules();
        };

        if (newLevel === 0 && oldLevel > 0) {
            let modal = document.getElementById('confirm-level0-modal');
            if (!modal) {
                modal = document.createElement('div'); modal.id = 'confirm-level0-modal';
                modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
                modal.innerHTML = `
                    <div style="background:#fff;border-radius:10px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">
                        <div style="font-size:20px;margin-bottom:8px;">⚠️ 최상위 레벨 이동</div>
                        <div style="font-size:14px;color:#495057;margin-bottom:20px;">해당 업무를 대분류(개발단계)로 이동하시겠습니까?<br><span style="color:#e03131;font-size:12px;">이동 시 기존 필터 기준이 변경될 수 있습니다.</span></div>
                        <div style="display:flex;gap:12px;justify-content:center;">
                            <button id="confirm-level0-ok" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:9px 28px;background:#e8f4fd;color:#1a4f7a;border:1px solid #a5c8f0;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s, border-color .15s;">이동</button>
                            <button id="confirm-level0-cancel" onmouseover="this.style.background='#ced4da';" onmouseout="this.style.background='#dee2e6';" style="padding:9px 28px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:14px;cursor:pointer;transition:background .15s;">취소</button>
                        </div></div>`;
                document.body.appendChild(modal);
            }
            modal.style.display = 'flex';
            let okBtn = document.getElementById('confirm-level0-ok'); let cancelBtn = document.getElementById('confirm-level0-cancel');
            let newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
            let newCancel = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            document.getElementById('confirm-level0-ok').addEventListener('click', function() { modal.style.display = 'none'; processChange(); });
            document.getElementById('confirm-level0-cancel').addEventListener('click', function() { modal.style.display = 'none'; });
        } else { processChange(); }
    };

    window.deleteRow = function(index) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        let tr = document.querySelector(`tr[data-row-index="${index}"]`); let rowName = index;
        if (tr) {
            let noTd = tr.querySelector('.no-td');
            if (noTd) {
                let span = noTd.querySelector('.row-num-span');
                rowName = span && span.textContent ? span.textContent.trim() : noTd.textContent.replace(/➕|➖|◀|▶/g, '').trim();
            }
        }

        let modal = document.getElementById('confirm-delete-modal');
        if (!modal) {
            modal = document.createElement('div'); modal.id = 'confirm-delete-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:10px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">
                    <div style="font-size:20px;margin-bottom:8px;">🗑️ 행 삭제</div>
                    <div id="confirm-delete-msg" style="font-size:14px;color:#495057;margin-bottom:20px;"></div>
                    <div style="display:flex;gap:12px;justify-content:center;">
                        <button id="confirm-delete-ok" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="padding:9px 28px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s, border-color .15s;">삭제</button>
                        <button id="confirm-delete-cancel" onmouseover="this.style.background='#ced4da';" onmouseout="this.style.background='#dee2e6';" style="padding:9px 28px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:14px;cursor:pointer;transition:background .15s;">취소</button>
                    </div></div>`;
            document.body.appendChild(modal);
        }
        document.getElementById('confirm-delete-msg').textContent = `${rowName}번 행(업무)을 삭제하시겠습니까?`;
        modal.style.display = 'flex';

        let okBtn = document.getElementById('confirm-delete-ok'); let cancelBtn = document.getElementById('confirm-delete-cancel');
        let newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
        let newCancel = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        document.getElementById('confirm-delete-ok').addEventListener('click', function() {
            modal.style.display = 'none'; let deleted = globalData.splice(index, 1); let taskName = "알 수 없는 업무";
            if (deleted[0]) {
                let l = deleted[0]._level; taskName = (l===0?deleted[0]._origDev:(l===1?deleted[0]._origT1:(l===2?deleted[0]._origT2:(l===3?deleted[0]._origT3:deleted[0]._origT4)))) || "빈 업무";
            }
            window.changeLogs.push({ time: new Date().toLocaleString('ko-KR'), userName: window.currentUserName || "비로그인", rowName: rowName, colName: "행 조작", oldVal: taskName, newVal: "삭제됨" });
            window.recalculateSchedules();
        });
        document.getElementById('confirm-delete-cancel').addEventListener('click', function() { modal.style.display = 'none'; });
    };

   window.moveRow = function(index, direction) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        window.getSelection().removeAllRanges();
        const rows = globalData;
        const cur = rows[index];
        if (!cur) return;
        const lvOf = (r) => (r && typeof r._level === 'number') ? r._level : 4;
        const L = lvOf(cur);
        let e = index;
        for (let j = index + 1; j < rows.length; j++) { if (lvOf(rows[j]) > L) e = j; else break; }
        let newStart;
        if (direction < 0) {
            if (index <= 1) return;
            let h = -1;
            for (let j = index - 1; j >= 1; j--) { const lv = lvOf(rows[j]); if (lv > L) continue; h = j; break; }
            if (h === -1) h = 1;
            const b = rows.splice(index, e - index + 1);
            rows.splice(h, 0, ...b);
            newStart = h;
        } else {
            if (e >= rows.length - 1) return;
            const nextStart = e + 1;
            const nl = lvOf(rows[nextStart]);
            let ne = nextStart;
            for (let j = nextStart + 1; j < rows.length; j++) { if (lvOf(rows[j]) > nl) ne = j; else break; }
            const nextLen = ne - nextStart + 1;
            const b = rows.splice(index, e - index + 1);
            rows.splice(index + nextLen, 0, ...b);
            newStart = index + nextLen;
        }
        logChange(index, -1, '행 이동', `${direction > 0 ? '아래' : '위'}로 이동 (하위 포함)`);
        window.recalculateSchedules();
        return newStart;
    };

    // ─── 시작일 기준 정렬 (WBS 계층 유지) ──────────────────────────
    window.sortRowsByStartDate = function() {
        if (!globalData || globalData.length <= 2) { alert('정렬할 데이터가 없습니다.'); return; }

        const header = globalData[0];
        const rows   = globalData.slice(1);

        // 정렬 키: 계산된 시작일(_calcStartTs). 날짜 없는 행은 맨 뒤로.
        const startTs = (row) => (row && typeof row._calcStartTs === 'number') ? row._calcStartTs : Infinity;

        // 1) _level 기반 트리 구성 (부모 = 바로 위의 더 낮은 레벨 행)
        const roots = [];
        const stack = [];
        for (const row of rows) {
            const node = { row, children: [] };
            const lv = (typeof row._level === 'number') ? row._level : 4;
            while (stack.length && stack[stack.length - 1].level >= lv) stack.pop();
            if (stack.length === 0) roots.push(node);
            else stack[stack.length - 1].node.children.push(node);
            stack.push({ node, level: lv });
        }

        // 2) 형제끼리 시작일 오름차순 정렬 (재귀)
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => startTs(a.row) - startTs(b.row));
            for (const n of nodes) sortNodes(n.children);
        };
        sortNodes(roots);

        // 3) 평탄화하여 globalData 재구성
        const out = [];
        const flatten = (nodes) => { for (const n of nodes) { out.push(n.row); flatten(n.children); } };
        flatten(roots);

        globalData = [header, ...out];
        logChange(0, -1, '날짜 정렬', '시작일 기준 정렬');
        window.recalculateSchedules();
    };

    // ─── 🔀 [부분 정렬] 지정한 인덱스 구간(fromIdx~toIdx)만 시작일 기준으로 재정렬 ───
    //     "선택 구간 재계산" 직후, 영향받은 구간만 순서를 정리할 때 사용. 구간 밖은 절대 건드리지 않음.
    window._sortSubRangeByStartDate = function(fromIdx, toIdx) {
        if (!globalData || fromIdx == null || toIdx == null || fromIdx > toIdx) return;
        fromIdx = Math.max(1, fromIdx); toIdx = Math.min(globalData.length - 1, toIdx);
        if (fromIdx > toIdx) return;

        const slice = globalData.slice(fromIdx, toIdx + 1);
        const startTs = (row) => (row && typeof row._calcStartTs === 'number') ? row._calcStartTs : Infinity;

        const roots = [];
        const stack = [];
        for (const row of slice) {
            const node = { row, children: [] };
            const lv = (typeof row._level === 'number') ? row._level : 4;
            while (stack.length && stack[stack.length - 1].level >= lv) stack.pop();
            if (stack.length === 0) roots.push(node);
            else stack[stack.length - 1].node.children.push(node);
            stack.push({ node, level: lv });
        }
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => startTs(a.row) - startTs(b.row));
            for (const n of nodes) sortNodes(n.children);
        };
        sortNodes(roots);

        const out = [];
        const flatten = (nodes) => { for (const n of nodes) { out.push(n.row); flatten(n.children); } };
        flatten(roots);

        for (let i = 0; i < out.length; i++) globalData[fromIdx + i] = out[i];
    };

    window.currentCalendarTarget = null; window.currentCalendarTs = null; window.currentViewYear = null; window.currentViewMonth = null; window.currentCalendarRow = null; window.currentCalendarCol = null;

    window.showCalendar = function(btn, ts, rowIndex, colIndex) {
        window.currentCalendarTarget = btn; window.currentCalendarTs = Number(ts); window.currentCalendarRow = rowIndex; window.currentCalendarCol = colIndex;
        // 💡 통합 캘린더 — 이전에 열려있던 다른 모드(메일분석/범용 input)의 잔여 플래그를 항상 초기화
        window.currentCalendarMailField = null;
        window.currentCalendarGenericInput = null;
        let d = new Date(window.currentCalendarTs);
        window.currentViewYear = d.getFullYear(); window.currentViewMonth = d.getMonth();
        window.calendarFixedPos = null; renderCalendar(false);
    };

    // 💡 업무 추가(직접입력/파일첨부/메일서버) AI분석 결과의 시작일·완료일 달력 진입점
    //    selectDateFromCalendar()의 currentCalendarMailField 분기와 짝을 이루는 함수
    window.showMailCalendar = function(el, ts, fieldKey) {
        window.showCalendar(el, ts, null, null);
        window.currentCalendarMailField = fieldKey; // showCalendar가 초기화한 뒤 다시 지정
    };

    // 💡 [통합 캘린더] 앱 전체의 <input type="date"> 필드를 이 하나의 팝업으로 통일
    //    input에 readonly를 걸고(네이티브 달력 차단) 클릭 시 이 함수를 호출하도록 연결하면
    //    선택한 날짜가 자동으로 그 input의 value에 채워지고 change/input 이벤트도 함께 발생함
    window.showGenericCalendar = function(inputEl) {
        if (!inputEl) return;
        let ts = inputEl.value ? new Date(inputEl.value).getTime() : Date.now();
        if (isNaN(ts)) ts = Date.now();
        window.showCalendar(inputEl, ts, null, null);
        window.currentCalendarGenericInput = inputEl; // showCalendar가 초기화한 뒤 다시 지정
    };

    // 💡 [2026-08-30 신규] Summary 마일스톤 날짜칸을 기본 readonly(한 번 클릭 = 달력 팝업)로 바꾸면서,
    // "직접 타이핑도 하고 싶을 때"를 위해 더블클릭하면 잠깐 readonly를 풀고 포커스를 준다 — 입력을
    // 끝내고 포커스를 벗어나면(blur) 다시 readonly로 돌아가 항상 "클릭=달력"이 기본 동작이 되게 한다.
    window._msEnableDirectEdit = function(el) {
        if (!el) return;
        el.removeAttribute('readonly');
        el.focus();
        el.select();
        const reReadonly = function() {
            el.setAttribute('readonly', 'readonly');
            el.removeEventListener('blur', reReadonly);
        };
        el.addEventListener('blur', reReadonly);
    };

    // 💡 [2026-08-30 신규] 개발기간(일) 자동 계산 — 계획/실적 각각 "기획Start ~ PRA" 사이 날짜 차이를
    // 계산해서 표 오른쪽 열에 보여준다. 이전엔 사용자가 숫자를 직접 타이핑했는데, 이미 표에 있는
    // 날짜로부터 계산 가능한 값을 또 손으로 넣게 하면 표와 어긋날 위험(오차/깜빡함)이 있어 자동 계산으로 전환.
    window._sumDevDaysBetween = function(startStr, endStr) {
        if (!startStr || !endStr) return null;
        const s = new Date(startStr), e = new Date(endStr);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
        const days = Math.round((e.getTime() - s.getTime()) / 86400000);
        return days >= 0 ? days : null;
    };
    window._sumDevDaysUnitLabels = {
        day:   { ko: '소요(일)',   en: 'Days' },
        week:  { ko: '소요(주)',   en: 'Weeks' },
        month: { ko: '소요(개월)', en: 'Months' }
    };
    window._sumDevDaysUnit = (function() {
        try { return localStorage.getItem('gantt_sum_devdays_unit') || 'day'; } catch (e) { return 'day'; }
    })();
    // 💡 개월은 달력상 "몇 월 며칠"까지 정확히 세지 않고, 이해하기 쉬운 근사치(1개월=30일)로 단순 환산한다
    //    — 대략적인 개발기간 감을 잡는 용도라 정밀한 캘린더 개월 계산까지는 필요 없다고 판단.
    window._sumFormatDevDays = function(days) {
        if (days === null || days === undefined) return '-';
        const _en = window._currentLang === 'en';
        const unit = window._sumDevDaysUnit;
        if (unit === 'week') return Math.round(days / 7) + (_en ? 'w' : '주');
        if (unit === 'month') return Math.round(days / 30) + (_en ? 'mo' : '개월');
        return days + (_en ? 'd' : '일');
    };
    window.sumToggleDevDaysUnit = function(ev) {
        if (ev) ev.stopPropagation();
        const order = ['day', 'week', 'month'];
        const idx = order.indexOf(window._sumDevDaysUnit);
        window._sumDevDaysUnit = order[(idx + 1) % order.length];
        try { localStorage.setItem('gantt_sum_devdays_unit', window._sumDevDaysUnit); } catch (e) {}
        window.sumRecalcDevDays();
    };
    window.sumRecalcDevDays = function() {
        const labelEl = document.getElementById('sum-devdays-unit-label');
        if (labelEl) {
            const _en = window._currentLang === 'en';
            const lbl = window._sumDevDaysUnitLabels[window._sumDevDaysUnit] || window._sumDevDaysUnitLabels.day;
            labelEl.textContent = (_en ? lbl.en : lbl.ko) + ' 🔄';
        }
        const planStart = document.querySelector('#sum-milestone-body [data-stage="기획Start"][data-field="date"]');
        const planEnd = document.querySelector('#sum-milestone-body [data-stage="PRA"][data-field="date"]');
        const actualStart = document.querySelector('#sum-milestone-body-actual [data-stage="기획Start"][data-field="actualDate"]');
        const actualEnd = document.querySelector('#sum-milestone-body-actual [data-stage="PRA"][data-field="actualDate"]');
        const planDays = window._sumDevDaysBetween(planStart && planStart.value, planEnd && planEnd.value);
        const actualDays = window._sumDevDaysBetween(actualStart && actualStart.value, actualEnd && actualEnd.value);
        const planTd = document.getElementById('sum-devdays-plan');
        const actualTd = document.getElementById('sum-devdays-actual');
        if (planTd) planTd.textContent = window._sumFormatDevDays(planDays);
        if (actualTd) actualTd.textContent = window._sumFormatDevDays(actualDays);
    };
    // 💡 계획/실적 날짜칸 18개 중 어느 것을 고치든(달력 선택 = input 이벤트 발생, 더블클릭 직접입력 모두
    // 포함) 한 곳에서 감시해서 다시 계산 — 18곳에 각각 이벤트를 붙이는 대신 이벤트 위임으로 한 번에 처리.
    document.addEventListener('input', function(e) {
        if (e.target && e.target.closest && e.target.closest('#sum-milestone-body, #sum-milestone-body-actual')) {
            window.sumRecalcDevDays();
        }
    });

    window.changeCalendarMonth = function(e, deltaMonth, deltaYear) {
        if (e) e.stopPropagation();
        let d = new Date(window.currentViewYear + deltaYear, window.currentViewMonth + deltaMonth, 1);
        window.currentViewYear = d.getFullYear(); window.currentViewMonth = d.getMonth();
        renderCalendar(true);
    };

   window.selectDateFromCalendar = function(y, m, d) {
        let str = y + "-" + String(m+1).padStart(2, '0') + "-" + String(d).padStart(2, '0');

        // ✅ [통합 캘린더] 범용 input 모드인 경우 — 그 input에 값만 채우고 change/input 이벤트 발생
        if (window.currentCalendarGenericInput) {
            const el = window.currentCalendarGenericInput;
            window.currentCalendarGenericInput = null;
            el.value = str;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvlG = document.getElementById('calendar-bg-overlay'); if (_calOvlG) _calOvlG.remove();
            return;
        }

        // ✅ 메일 분석 팝업창용 달력인 경우 (중요 수정)
        if (window.currentCalendarMailField) {
            const fieldKey = window.currentCalendarMailField;
            window._mailAnalyzedResult[fieldKey] = str;
            window.currentCalendarMailField = null;

            const spanEl = document.getElementById(`mail-date-${fieldKey}`);
            if (spanEl) spanEl.innerHTML = `<span style="color:#0056b3; font-weight:bold;">${str}</span>`;

            const warnEl = spanEl ? spanEl.closest('td') : null;
            if (warnEl) {
                const warnDiv = warnEl.querySelector('div[style*="e67e22"]');
                if (warnDiv) warnDiv.remove();
            }

            // 시작일 선택 시 완료일 자동 설정 (시작일 + 3일)
            if (fieldKey === '시작일') {
                const planDate = new Date(new Date(str).getTime() + 1 * 24 * 60 * 60 * 1000);
                const planStr = planDate.getFullYear() + '-' + String(planDate.getMonth()+1).padStart(2,'0') + '-' + String(planDate.getDate()).padStart(2,'0');
                window._mailAnalyzedResult['완료일'] = planStr;
                const planSpan = document.getElementById('mail-date-완료일');
                if (planSpan) planSpan.innerHTML = `<span style="color:#0056b3; font-weight:bold;">${planStr}</span>`;
            }

            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvl = document.getElementById('calendar-bg-overlay'); if (_calOvl) _calOvl.remove();
            window.autoSetInsertPosition(str);
            return;
        }
    
        if (window.currentCalendarRow !== undefined && window.currentCalendarCol !== undefined && window.currentCalendarRow !== null) {
            let r = window.currentCalendarRow; let c = window.currentCalendarCol;
            let selectedTs = new Date(y, m, d).setHours(0,0,0,0);

            let oldVal = globalData[r][c] || "";
            logChange(r, c, oldVal, str);
            globalData[r][c] = str;
            if (c === colIdx.start) {
                globalData[r]._startForced = true; globalData[r]._planForced = false;
                if (colIdx.plan !== -1) {
                    // 💡 완료일을 무조건 비우면 기간 정보가 없는 행은 완료일=시작일로 붕괴됨.
                    //    변경 전 소요일(근무일 기준)을 구해서 새 시작일에 그대로 이어붙여 완료일도 같이 밀리게 함.
                    const oldStartTs = globalData[r]._calcStartTs; const oldPlanTs = globalData[r]._calcPlanTs;
                    const oldDur = (oldStartTs && oldPlanTs) ? countWorkingDays(oldStartTs, oldPlanTs) : 0;
                    if (oldDur > 0) {
                        const newPlanTs = addWorkingDays(selectedTs, oldDur - 1);
                        const pd = new Date(newPlanTs);
                        globalData[r][colIdx.plan] = pd.getFullYear() + '-' + String(pd.getMonth()+1).padStart(2,'0') + '-' + String(pd.getDate()).padStart(2,'0');
                    } else {
                        globalData[r][colIdx.plan] = ""; // 💡 소요일 정보가 아예 없던 행(신규 행 등)은 기존처럼 자동계산에 맡김
                    }
                }
            }
            if (c === colIdx.plan)  { globalData[r]._planForced = true; globalData[r]._startForced = false; if (colIdx.dur1 !== -1) globalData[r][colIdx.dur1] = ""; if (colIdx.dur2 !== -1) globalData[r][colIdx.dur2] = ""; if (colIdx.dur3 !== -1) globalData[r][colIdx.dur3] = ""; if (colIdx.dur4 !== -1) globalData[r][colIdx.dur4] = ""; if (colIdx.period !== -1) globalData[r][colIdx.period] = ""; }

            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvl = document.getElementById('calendar-bg-overlay'); if (_calOvl) _calOvl.remove();
            window.recalculateSchedules();
        }
    };

    window.renderCalendar = function(keepPos) {
        let popup = document.getElementById('calendar-popup');
        if (!popup) { popup = document.createElement('div'); popup.id = 'calendar-popup'; popup.className = 'calendar-popup'; document.body.appendChild(popup); }

        let year = window.currentViewYear; let month = window.currentViewMonth;
        let targetDate = new Date(window.currentCalendarTs);
        let targetY = targetDate.getFullYear(); let targetM = targetDate.getMonth(); let targetD = targetDate.getDate();

        let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let prevDays = new Date(year, month, 0).getDate();

        let html = `
            <div class="cal-header">
                <div><span class="cal-nav" onclick="changeCalendarMonth(event, 0, -1)" title="이전 년도">⏪</span><span class="cal-nav" onclick="changeCalendarMonth(event, -1, 0)" title="이전 달">◀</span></div>
                <span style="margin: 0 10px;">${year}년 ${month + 1}월</span>
                <div style="display:flex; align-items:center;"><span class="cal-nav" onclick="changeCalendarMonth(event, 1, 0)" title="다음 달">▶</span><span class="cal-nav" onclick="changeCalendarMonth(event, 0, 1)" title="다음 년도">⏩</span><span class="cal-close" onclick="event.stopPropagation(); document.getElementById('calendar-popup').style.display='none'; var o=document.getElementById('calendar-bg-overlay'); if(o) o.remove();" title="닫기">✖</span></div>
            </div>
            <div class="cal-grid"><div class="cal-day" style="color:#e03131;">일</div><div class="cal-day">월</div><div class="cal-day">화</div><div class="cal-day">수</div><div class="cal-day">목</div><div class="cal-day">금</div><div class="cal-day" style="color:#0056b3;">토</div>
        `;

        let cellCount = 0;
        for (let i = firstDay - 1; i >= 0; i--) { html += `<div class="cal-date dim">${prevDays - i}</div>`; cellCount++; }
        for (let i = 1; i <= daysInMonth; i++) {
            let isTarget = (year === targetY && month === targetM && i === targetD) ? 'active' : '';
            let isSunday = (cellCount % 7 === 0) ? 'color:#e03131;' : ''; let isSaturday = (cellCount % 7 === 6) ? 'color:#0056b3;' : '';
            // 💡 [통합 캘린더] 공휴일 표시 — 평일이어도 공휴일이면 일요일과 같은 빨간색 + 아래 점(●) 표시
            let dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
            let isHol = (window.isHoliday && window.isHoliday(dateStr));
            let holStyle = isHol ? 'color:#e03131;' : '';
            let holDot = isHol ? '<span style="display:block; font-size:8px; line-height:1; margin-top:1px;">●</span>' : '';
            html += `<div class="cal-date ${isTarget}" style="${isTarget ? '' : (holStyle || isSunday + isSaturday)}" onclick="selectDateFromCalendar(${year}, ${month}, ${i})" title="${isHol ? '공휴일' : ''}">${i}${holDot}</div>`;
            cellCount++;
        }
        let nextDay = 1; while (cellCount % 7 !== 0) { html += `<div class="cal-date dim">${nextDay++}</div>`; cellCount++; } html += `</div>`;

        popup.innerHTML = html; popup.style.display = 'block';

        // 배경 클릭 시 달력 닫기 — 오버레이 방식
        let calOvl = document.getElementById('calendar-bg-overlay');
        if (!calOvl) {
            calOvl = document.createElement('div');
            calOvl.id = 'calendar-bg-overlay';
            calOvl.style.cssText = 'position:fixed; inset:0; z-index:999999; background:transparent; cursor:default;';
            calOvl.addEventListener('click', function() {
                popup.style.display = 'none';
                calOvl.remove();
            });
            document.body.appendChild(calOvl);
        }
        // popup은 오버레이 위에 떠야 함
        popup.style.zIndex = '1000000';

        if (!keepPos && window.currentCalendarTarget) {
            let rect = window.currentCalendarTarget.getBoundingClientRect();
            popup.style.top = '0px'; popup.style.left = '0px'; 
            let popupH = popup.offsetHeight; let topPos = rect.bottom + window.scrollY + 5;
            if (rect.bottom + popupH + 15 > window.innerHeight) topPos = Math.max(window.scrollY + 5, rect.top + window.scrollY - popupH - 5);
            let leftPos = Math.min(rect.left + window.scrollX, window.innerWidth - popup.offsetWidth - 20);
            window.calendarFixedPos = { top: topPos, left: leftPos };
        }
        if (window.calendarFixedPos) { popup.style.top  = window.calendarFixedPos.top  + 'px'; popup.style.left = window.calendarFixedPos.left + 'px'; }
    };

    // 💡 [버그 수정] 달력을 "여는" click과 "바깥 클릭이라 닫는" 이 리스너가 같은 이벤트 버블링 한 번에
    //    같이 실행됐다. showGenericCalendar(input)로 여는 경우(input의 onclick → 통합 캘린더 오픈)
    //    이 click 이벤트가 그대로 document까지 버블링되는데, 그 트리거였던 input 자신은 .date-clickable
    //    클래스가 없어(그건 메인 Gantt 표 셀 전용) "바깥 클릭"으로 오인되어 열리자마자 곧바로 닫혔다 —
    //    즉 팝업이 화면에 그려지기도 전에 block→none으로 바뀌어 "달력이 아예 안 뜨는" 것처럼 보였다.
    //    (Summary 마일스톤 날짜칸뿐 아니라 히스토리 삭제범위·공휴일 등록 등 showGenericCalendar를 쓰는
    //    모든 기존 필드가 똑같이 영향받고 있었음 — 재현 테스트로 확인)
    //    지금 막 이 팝업을 연 그 input(currentCalendarGenericInput) 클릭은 "바깥 클릭"에서 제외한다.
    document.addEventListener('click', function(e) {
        const popup = document.getElementById('calendar-popup');
        if (popup && popup.style.display === 'block') {
            // 💡 트리거가 input 자신인 경우(showGenericCalendar(this))뿐 아니라, Summary 마일스톤 날짜칸의
            //    "📅 아이콘"처럼 별도 요소를 눌러 여는 경우도 있다 — 그 아이콘(.ms-cal-btn) 클릭도 함께 제외.
            const isCalendarTriggerInput = window.currentCalendarGenericInput && e.target === window.currentCalendarGenericInput;
            const isCalendarTriggerIcon = e.target.closest && e.target.closest('.ms-cal-btn');
            if (!popup.contains(e.target) && !e.target.closest('.date-clickable') && !isCalendarTriggerInput && !isCalendarTriggerIcon) popup.style.display = 'none';
        }
        if (!e.target.closest('.no-td')) document.querySelectorAll('.row-actions.show').forEach(el => el.classList.remove('show'));
    });

    function escapeHtml(unsafe) { if (!unsafe) return ""; return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    // 💡 [2026-08-27] boldBrackets 매개변수 추가 — "업무 상세내용"만 [대괄호] Bold 처리를 끄기 위함.
    //    기본값 true로 기존 호출부(답변/기타 텍스트/번역 결과 등)는 전부 그대로 동작함.
    function linkifyAndEscape(text, boldBrackets) {
        if (boldBrackets === undefined) boldBrackets = true;
        if (!text) return ""; let safeText = escapeHtml(text);
        const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gim; safeText = safeText.replace(emailPattern, '<a href="mailto:$1" style="color:#2c5f8a; text-decoration:underline;">$1</a>');
        const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim; safeText = safeText.replace(urlPattern, '<a href="$1" target="_blank" style="text-decoration: none; display: inline-block; margin-left: 2px; font-size:11px;" title="$1">⬇️</a>');
        const pseudoUrlPattern = /(^|[^\/a-zA-Z0-9])(www\.[\S]+(\b|$))/gim; safeText = safeText.replace(pseudoUrlPattern, '$1<a href="http://$2" target="_blank" style="text-decoration: none; display: inline-block; margin-left: 2px; font-size:11px;" title="$2">⬇️</a>');
        safeText = safeText.replace(/\r/g, '');
        safeText = safeText.replace(/(\n[ \t]*){2,}/g, '\n'); // 💡 줄바꿈 사이의 공백까지 포함하여 압축
        // ✅ [추가할 코드] 2칸 이상 연속된 공백(스페이스)을 1칸으로 압축
        safeText = safeText.replace(/ {2,}/g, ' ');
        // ✅ [대괄호 단어] Bold 처리 (boldBrackets=false면 건너뜀)
        if (boldBrackets) safeText = safeText.replace(/(\[[^\]]+\])/g, '<b>$1</b>');
        return safeText.replace(/\n/g, '<br>');
    }  // ← 이 닫는 괄호가 빠져있음

    function injectMailRawBtn(html, row, rowIndex) {
        // 💡 [2026-08-28 버그 수정] 예전엔 `if (!row._mailRaw) return html;`로 함수 맨 앞에서 막아서,
        //    _mailRaw가 안 남은(원문 백업 이전에 등록됐거나 어떤 이유로 유실된) 과거 메일분석 업무는
        //    "AI 분석 날짜로 복원" 버튼까지 통째로 안 보였다 — "항상 노출하기로 했다"던 지난 수정이 이
        //    가드 때문에 실제로는 과거 업무에 적용이 안 되고 있었음. "원문 보기"는 원문 자체가 없으면
        //    보여줄 게 없어 _mailRaw가 있을 때만 노출하되, "AI 분석 날짜로 복원"은 _mailRaw 없이도
        //    _aiOrigStart/_aiOrigPlan 백업이나 상세내용에서 추출한 날짜만으로 동작 가능하므로 그 중
        //    하나라도 있으면 노출한다.
        const hasMailRaw = !!row._mailRaw;
        const canRestoreDate = !!(row._aiOrigStart || row._aiOrigPlan || window._extractAiOrigStartFromContent(row));
        if (!hasMailRaw && !canRestoreDate) return html;

        const _en = window._currentLang === 'en';
        let btn = '';
        if (hasMailRaw) {
            btn += `<button class="detail-inline-action-btn" onclick="window.showGanttMailRaw(${rowIndex}); event.stopPropagation();" style="font-size:11px; padding:2px 8px; margin-left:6px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; vertical-align:middle;">📧 ${_en ? 'View Mail Source' : '원문 보기'}</button>`;
        }
        if (canRestoreDate) {
            // 💡 [2026-08-24 신규] 백업(_aiOrigStart/_aiOrigPlan)이 없으면 window.restoreAiTaskDate()가
            //    "상세내용" 첫 줄에 항상 같이 적히는 [업무유형][발신자→수신자] YYYY-MM-DD 형식에서
            //    시작일을 추출해 대신 복원한다(완료일은 이 형식에 없어 과거 업무는 복원 대상 제외).
            //    (Ctrl/Shift+클릭 시 다중 선택된 행 전부 일괄 복원 — window.restoreAiTaskDate 참고)
            btn += `<button class="detail-inline-action-btn" onclick="window.restoreAiTaskDate(${rowIndex}, event); event.stopPropagation();" title="${_en ? 'Restore to the start/end date AI originally extracted from the mail (falls back to the date embedded in the detail text for older tasks without a backup). Ctrl/Shift+click to apply to all currently selected rows.' : '시작일/완료일을 메일 분석 당시 AI가 뽑았던 원본 날짜로 되돌립니다 (백업이 없는 과거 업무는 상세내용에 적힌 날짜에서 시작일만 추출해 복원). Ctrl(⌘) 또는 Shift를 누른 채 클릭하면 지금 선택된 행 전부에 한 번에 적용됩니다.'}" style="font-size:11px; padding:2px 8px; margin-left:${hasMailRaw ? '4' : '6'}px; background:#fff3e0; color:#b85c00; border:1px solid #ffcc80; border-radius:5px; cursor:pointer; vertical-align:middle;">📅 ${_en ? 'Restore AI Date' : 'AI 분석 날짜로 복원'}</button>`;
        }
        if (!btn) return html;

        // 💡 [2026-08-27 버그 수정] "업무 상세내용"의 [대괄호] Bold 처리를 껐더니(linkifyAndEscape의
        //    boldBrackets=false) [출처]가 더 이상 <b>[출처]</b>로 안 나와서, <b> 태그를 필수로 찾던 이
        //    정규식이 매치를 못 해 버튼이 통째로 안 그려지고 있었다. <b> 요구조건은 제거했고, 그마저도
        //    [출처] 자체가 없는(더 옛날 형식) 콘텐츠는 정규식이 아예 매치 안 되어 조용히 무시됐었으므로,
        //    그 경우엔 그냥 맨 끝에 버튼을 붙인다(위치만 다를 뿐 항상 노출은 보장).
        if (/\[출처\]/.test(html)) {
            return html.replace(/(\[출처\](?:<\/b>)?[\s\S]*?)(<br>|$)/, function(m, p1, p2) { return p1 + btn + p2; });
        }
        return html + btn;
    }

    function parseDateValue(value) {
        if (value === "" || value === null || value === undefined) return null;
        let y, m, d;
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000); y = date.getUTCFullYear(); m = date.getUTCMonth(); d = date.getUTCDate();
        } else if (typeof value === 'string') {
            let str = value.trim(); let matchMMDD = str.match(/^(\d{1,2})[-/.](\d{1,2})$/);
            if (matchMMDD) { y = new Date().getFullYear(); m = parseInt(matchMMDD[1], 10) - 1; d = parseInt(matchMMDD[2], 10); } 
            else {
                let match = str.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (match) { y = parseInt(match[1], 10); if (y < 100) y += 2000; m = parseInt(match[2], 10) - 1; d = parseInt(match[3], 10); } else return null;
            }
        } else return null;
        if (y < 2010) y = new Date().getFullYear(); if (y < 2000 || y > 2100) return null; 
        let dt = new Date(y, m, d); dt.setHours(0,0,0,0); return { ts: dt.getTime() };
    }

    function formatTableDate(ts) {
        if (!ts) return ""; let d = new Date(ts); if (isNaN(d.getTime())) return "";
        const mmdd = String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
        // 💡 연도 표시가 없으면 연말~연초에 걸친 일정에서 어느 날짜가 더 빠른지 헷갈림 —
        //    작은 글씨(2자리 연도)로 옆에 붙여서 표는 여전히 빽빽하지 않게 유지
        const yy = String(d.getFullYear()).slice(-2);
        return mmdd + `<span style="font-size:9px; color:#999; margin-left:1px;">'${yy}</span>`;
    }

    function formatTsToYMD(ts) {
        if (!ts) return ""; let d = new Date(ts);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
    }

    function getDurationDays(val) {
        if (val === undefined || val === null || val.toString().trim() === '') return null;
        let match = val.toString().trim().match(/^(\d+)(일|days)?$/i);
        if (match) { let days = parseInt(match[1], 10); if (days < 10000) return days; } return null;
    }

    function checkStrikeThrough(worksheet, r, c) {
        try {
            if (c === -1 || c === undefined) return false;
            let cellAddress = XLSX.utils.encode_cell({r: r, c: c}); let cell = worksheet[cellAddress];
            if (!cell) return false;
            if (cell.s && cell.s.font && cell.s.font.strike) return true;
            if (cell.r && Array.isArray(cell.r) && cell.r.some(run => run.s && run.s.strike)) return true;
            if (cell.h && typeof cell.h === 'string' && (cell.h.includes('<s') || cell.h.includes('strike') || cell.h.includes('line-through'))) return true;
        } catch (e) { } return false;
    }

    // 💡 [버그 수정] 헤더로 "전체 펼치기"를 켜둔 상태인지 재렌더링을 넘나들며 기억하는 플래그.
    //    renderTable()이 매번 여기 값을 보고 펼침 class를 다시 적용한다(위 renderTable 참고).
    window._allDetailExpanded = false;

    // 💡 [2026-08-24 재도입] 개별 셀 클릭 = 그 셀만 접기/펼치기, 헤더 클릭 = 전체 접기/펼치기(기준 재정립).
    //    예전 버전(제거 전)의 진짜 문제는 "개별 클릭 자체"가 아니라 두 가지였다:
    //    ① 셀을 하나 클릭하면 이전에 펼쳐져 있던 "다른" 셀들이 전부 자동으로 접혔음(한 번에 하나만
    //       펼침 유지) — 여러 행을 나란히 펼쳐두고 비교하고 싶을 때 불편했다.
    //    ② 개별 클릭이 window._allDetailExpanded(전체 펼치기 플래그)를 무조건 false로 되돌려서,
    //       "전체 펼치기"를 켜둔 상태에서 셀 하나만 눌러도 다른 모든 행이 통째로 접혀버렸다.
    //    이번엔 개별 토글이 "그 셀 하나만" 건드리고 다른 셀·전체 플래그는 전혀 손대지 않는다 —
    //    헤더와 개별 셀은 완전히 독립된 두 개의 스위치. 추가로, 텍스트를 드래그해서 선택하려던
    //    클릭(=드래그 후 선택 영역이 남아있는 클릭)은 토글에서 제외해 "읽으려고 클릭했는데 접힌다"는
    //    구버전의 원래 불편함도 같이 없앤다.
    window.toggleDetailExpand = function(td, event, rowIndex, cellIndex) {
        if (event) event.stopPropagation();
        // 💡 [2026-08-24 버그 수정] 위 stopPropagation 때문에 document의 "바깥 클릭 시 팝업 닫기"
        //    리스너(toggleRowActions 안)가 이 클릭을 못 보게 됨 — 그래서 WBS 상하좌우+- 팝업을 열어둔
        //    채로 상세내용 셀을 클릭하면 팝업이 안 닫히는 사고가 있었다(재도입 때 이 처리가 누락됨).
        //    여기서 직접 닫아줘서 다른 곳 클릭했을 때와 동일하게 동작하도록 한다.
        const wbsPopup = document.getElementById('row-action-popup');
        if (wbsPopup && wbsPopup.style.display !== 'none') { wbsPopup.style.display = 'none'; window.clearRowHighlight(); }
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0 && td.contains(sel.anchorNode)) return; // 텍스트 선택 중이면 펼치기/접기 토글은 생략
        const nowExpanded = td.classList.toggle('detail-td-expanded');
        // 💡 [2026-08-25 버그 수정] 개별 셀 펼침은 DOM class에만 있어서, WBS 상하좌우+-(행 이동/레벨
        //    변경/추가/삭제)가 recalculateSchedules()→renderTable()로 tbody를 통째로 새로 그릴 때마다
        //    사라졌다("전체 펼치기"만 window._allDetailExpanded로 재렌더링에도 살아남았음). 행 객체
        //    (globalData[rowIndex])에도 같이 저장해서, 재렌더링 후에도 이 셀은 계속 펼쳐진 채로 나오게 한다.
        if (typeof globalData !== 'undefined' && globalData[rowIndex]) {
            const row = globalData[rowIndex];
            row._expandedDetailCols = row._expandedDetailCols || {};
            if (nowExpanded) row._expandedDetailCols[cellIndex] = true; else delete row._expandedDetailCols[cellIndex];
        }
    };
    // 상세내용 헤더 클릭 — 전체 펼치기/접기 토글 (개별 셀 상태와 무관하게 항상 "전부"를 한 방향으로 맞춤)
    window.toggleAllDetailExpand = function(th, event) {
        if (event) event.stopPropagation();
        const allDetail = document.querySelectorAll('td.detail-td');
        const arrow = document.getElementById('detail-th-arrow');
        if (window._allDetailExpanded) {
            allDetail.forEach(el => el.classList.remove('detail-td-expanded'));
            if (arrow) arrow.textContent = '▼';
            window._allDetailExpanded = false;
            // 💡 "전체 접기"는 개별로 펼쳐뒀던 셀의 기억(row._expandedDetailCols)도 같이 지운다 —
            //    안 지우면 다른 행을 이동시키는 등 다음 재렌더링 때 그 셀들만 도로 펼쳐져서 혼란스러움.
            if (typeof globalData !== 'undefined') globalData.forEach(function(r) { if (r) r._expandedDetailCols = {}; });
        } else {
            allDetail.forEach(el => el.classList.add('detail-td-expanded'));
            if (arrow) arrow.textContent = '▲';
            window._allDetailExpanded = true;
        }
    };

    window.makeEditable = function(td) {
        if(td.getAttribute('contenteditable') === 'true') return;
        // 💡 [2026-08-24] 편집 시작 전 "개별 클릭으로 이미 펼쳐둔 상태였는지"를 기억해둔다 — 안 그러면
        //    편집 끝나고 blurCell에서 무조건 접어버려서, 일부러 펼쳐놓고 고치던 칸이 편집 후 도로 접혀버림.
        td.dataset._wasExpanded = td.classList.contains('detail-td-expanded') ? '1' : '0';
        td.classList.add('detail-td-expanded'); // 💡 편집 중엔 접혀서 잘리지 않도록 자동으로 펼침
        td.dataset.displayHtml = td.innerHTML; td.setAttribute('contenteditable', 'true');
        let raw = td.getAttribute('data-raw'); if (raw) td.innerText = decodeURIComponent(raw); else td.innerText = "";
        td.focus(); let range = document.createRange(); let sel = window.getSelection(); range.selectNodeContents(td); sel.removeAllRanges(); sel.addRange(range);

        // ⌨️ Enter = 편집 완료(저장), Shift+Enter = 줄바꿈 삽입
        td.onkeydown = function(ev) {
            if (ev.key === 'Enter') {
                if (ev.shiftKey) {
                    ev.preventDefault();
                    document.execCommand('insertText', false, '\n');
                } else {
                    ev.preventDefault();
                    td.blur();
                }
            }
        };
    };

    window.blurCell = function(td, rowIndex, colIndex) {
        td.removeAttribute('contenteditable');
        // 💡 편집 종료 시 기본 높이로 복귀 — 단, "전체 펼치기" 모드 중이었거나(_allDetailExpanded),
        //    편집 시작 전에 이미 개별 클릭으로 펼쳐둔 칸이었다면(_wasExpanded) 접지 않고 그대로 유지.
        if (!window._allDetailExpanded && td.dataset._wasExpanded !== '1') td.classList.remove('detail-td-expanded');
        delete td.dataset._wasExpanded;
        let newText = td.innerText.trim(); let rawAttr = td.getAttribute('data-raw'); let oldText = rawAttr ? decodeURIComponent(rawAttr).trim() : "";
        
        if (newText !== oldText) {
            logChange(rowIndex, colIndex, oldText, newText); globalData[rowIndex][colIndex] = newText; let row = globalData[rowIndex];
            
            if (colIndex === colIdx.devStage) row._origDev = newText;
            if (colIndex === colIdx.taskType1) row._origT1 = newText;
            if (colIndex === colIdx.taskType2) row._origT2 = newText;
            if (colIndex === colIdx.taskType3) row._origT3 = newText;
            if (colIndex === colIdx.taskType4) row._origT4 = newText;
            // 💡 단일 "개발업무(WBS)" 열 모드: 레벨로 어느 필드를 수정한 것인지 판단
            if (colIndex === colIdx.wbs && colIdx.devStage === -1) {
                if (row._level === 0) row._origDev = newText;
                else if (row._level === 1) row._origT1 = newText;
                else if (row._level === 2) row._origT2 = newText;
                else if (row._level === 3) row._origT3 = newText;
                else row._origT4 = newText;
            }
            
            if (colIndex === colIdx.plan) {
                if (colIdx.period !== -1) globalData[rowIndex][colIdx.period] = "";
                if (colIdx.dur1 !== -1) globalData[rowIndex][colIdx.dur1] = "";
                if (colIdx.dur2 !== -1) globalData[rowIndex][colIdx.dur2] = "";
                if (colIdx.dur3 !== -1) globalData[rowIndex][colIdx.dur3] = "";
                if (colIdx.dur4 !== -1) globalData[rowIndex][colIdx.dur4] = "";
                globalData[rowIndex]._planForced = true; globalData[rowIndex]._startForced = false; 
            }
            if (colIndex === colIdx.start) {
                globalData[rowIndex]._startForced = true; globalData[rowIndex]._planForced = false;
                if (colIdx.plan !== -1) globalData[rowIndex][colIdx.plan] = "";
            }
            if (colIndex === colIdx.period || colIndex === colIdx.dur1 || colIndex === colIdx.dur2 || colIndex === colIdx.dur3 || colIndex === colIdx.dur4) {
                globalData[rowIndex]._planForced = false; if (colIdx.plan !== -1) globalData[rowIndex][colIdx.plan] = "";
                // 💡 편집한 칸이 실제로 반영되도록, 같은 행의 다른 레벨별 숨겨진 소요일 칸(dur1~4)도 함께 비움
                //    (레벨별 dur 칸이 화면의 period 칸보다 우선순위가 높아 남아있으면 편집이 무시됨)
                if (colIdx.dur1 !== -1 && colIndex !== colIdx.dur1) globalData[rowIndex][colIdx.dur1] = "";
                if (colIdx.dur2 !== -1 && colIndex !== colIdx.dur2) globalData[rowIndex][colIdx.dur2] = "";
                if (colIdx.dur3 !== -1 && colIndex !== colIdx.dur3) globalData[rowIndex][colIdx.dur3] = "";
                if (colIdx.dur4 !== -1 && colIndex !== colIdx.dur4) globalData[rowIndex][colIdx.dur4] = "";
            }

            td.setAttribute('data-raw', encodeURIComponent(newText));
            
            if ([colIdx.start, colIdx.plan, colIdx.period, colIdx.dur1, colIdx.dur2, colIdx.dur3, colIdx.dur4, colIdx.devStage, colIdx.taskType1, colIdx.taskType2, colIdx.taskType3, colIdx.taskType4, colIdx.wbs].includes(colIndex)) {
                window.recalculateSchedules();
            } else { renderTable(globalData); applyFilters(); window.pushUndoSnapshot(); }
        } else { td.innerHTML = td.dataset.displayHtml || oldText; }
   };  // ← blurCell 끝

    window.updateStatus = function(select, rowIndex, colIndex) {
        const newVal = select.value;
        const oldVal = decodeURIComponent(select.closest('td').getAttribute('data-raw') || '');
        if (newVal !== oldVal) {
            // 하위 행도 함께 변경
            window.applyStatusToChildren(rowIndex, colIndex, newVal);
            renderTable(globalData); applyFilters();
            window.pushUndoSnapshot();
        }
    };

    window.applyStatusToChildren = function(rowIndex, colIndex, newVal) {
        const row = globalData[rowIndex];
        const oldVal = globalData[rowIndex][colIndex];
        logChange(rowIndex, colIndex, oldVal, newVal);
        globalData[rowIndex][colIndex] = newVal;
        // 하위 행 순회 (현재 행보다 레벨이 높은 연속된 행들)
        const parentLevel = row._level || 0;
        for (let i = rowIndex + 1; i < globalData.length; i++) {
            const childRow = globalData[i];
            if (!childRow) continue;
            if ((childRow._level || 0) <= parentLevel) break; // 같은 레벨이나 상위면 중단
            const childOld = childRow[colIndex];
            logChange(i, colIndex, childOld, newVal);
            globalData[i][colIndex] = newVal;
        }
    };

    window.setStatusDone = function(select, rowIndex, colIndex) {
        const oldVal = globalData[rowIndex][colIndex];
        if (oldVal === '완료') return;
        window.applyStatusToChildren(rowIndex, colIndex, '완료');
        renderTable(globalData); applyFilters();
    };

    const LANG = {
        ko: {
            header: { 'no':'No', '시작':'시작', '완료':'완료', '개발업무(wbs)':'개발업무 (WBS)', '기간':'기간', '소요일':'소요', '상태':'상태', '업무상세내용':'업무 상세내용', '현황':'현황' },
            status: ['진행','완료','대기','지연'],
            statusMap: { '진행':'진행','완료':'완료','대기':'대기','지연':'지연','보류':'지연',
                         'In Progress':'진행','Done':'완료','Pending':'대기','On Hold':'지연','On going':'진행','Delay':'지연' },
            btnText: '🌐 ENG',
            ui: {
                'file-menu-btn':     '📁 프로젝트',
                'settings-menu-btn': '⚙️ 설정',
                'alarm-toggle-btn':  '🟢 자동알람 ON',
                'alarm-settings-menu-btn': '⚙️ 자동알람 설정',
                'holiday-btn':       '🗓️ 휴일 등록',
                'alarm-send-all-btn':'📧 일괄 발송',
                'mail-btn':'🤖 AI 업무 분석',
                'project-select-btn': '🔃 프로젝트 선택',
                'schedule-tools-btn': '🛠️ 일정 도구',
                'ai-menu-btn':        '🤖 AI 도구',
                'ai-summary-menu-btn':'🤖 AI 요약',
                'ai-qa-menu-btn':     '💬 AI 문답',
                'ai-analysis-settings-btn': '🤖 AI 분석 설정',
                'admin-pw-change-btn': '🔑 비밀번호 변경',
                'add-user-btn':       '👤 사용자 추가',
                'file-input-label':'🟩 프로젝트 엑셀 열기',
                'auth_button':    '👤 {name} (드라이브 연동하기)',
                'history-btn':    '🕒 수정 이력 확인',
                'inbox-btn':'📦 AI 업무 보관함',
                'weekly-report-btn': '📅 주간 업무 보고',
                'drive_save_btn': '💾 프로젝트 저장',
                'drive_load_btn': '📂 프로젝트 열기',
                'chart-expand-btn':    '📊 차트 확장',
                'chart-expand-btn-on': '📊 기본 보기',
                
                'excel-btn':      '🟩 프로젝트 엑셀 저장',
                'print-btn':      '🖨️ 인쇄 (PDF)',
                'date-sort-btn':  '📅 날짜순 정렬',
                'file-status-default': '파일을 선택하거나 이 영역에 엑셀을 드래그 앤 드롭 하세요. (모든 항목 더블클릭 수정 가능)',
                'file-status-updated': '✅ 일정이 업데이트 되었습니다.',
                'undo-btn': '↩️ 실행취소',
                'redo-btn': '↪️ 다시실행',
                'recalc-range-btn': '🔓 선택 구간 재계산',
                'backup_restore_btn': '🔄 프로젝트 복원',
                'new-project-btn': '➕ 새 프로젝트 추가',
                'delete-project-btn': '🗑️ 프로젝트 삭제',
                'pc-add-btn': '➕ 추가',
                'pc-toggle-btn': '🔽 펼치기',
                'pc-export-btn': '🟩 엑셀로 내보내기',
                'pc-save-btn': '💾 저장',
                'ep-adbd-add-btn': '➕ 추가',
                'ep-adbd-toggle-btn': '🔽 펼치기',
                'ep-adbd-export-btn': '🟩 엑셀로 내보내기',
                'ep-convbd-add-btn': '➕ 추가',
                'ep-convbd-toggle-btn': '🔽 펼치기',
                'ep-convbd-export-btn': '🟩 엑셀로 내보내기',
                'ep-save-btn': '💾 저장',
            },
            filterLabel: {
                'LEVEL(WBS)': 'LEVEL(WBS)',
                '업무상태': '업무상태',
                '개발단계': '개발단계',
            },
            filterAll: '전체 (All)',
            i18n: {
                'h-alarm':            '🔔 알람 관리',
                'h-notice':           '📢 공지 관리',
                'notice-desc':        'D-day 알람과 별개로 운영되는 반복 공지 시스템',
                'btn-alarm-settings': '⚙️ 설정',
                'btn-notice-add':     '+ 공지 등록',
                'btn-notice-sendall': '📢 전체 즉시 발송',
                'btn-addr-load':      '📂 불러오기',
                'btn-sync-gantt':     '🔄 Gantt 실적 연동',
                'btn-print':          '🖨️ 인쇄 (PDF)',
                'btn-prev':           '◀ 이전',
                'btn-next':           '다음 ▶',
                'btn-today':          '오늘',
                'btn-prev-week':      '◀ 이전주',
                'btn-next-week':      '다음주 ▶',
                'btn-cal-export':     '📤 내보내기/동기화',
                'lbl-ppt-color':      '🎨 PPT 색상',
                'btn-ppt-export':     '📥 PPT 출력',
                'btn-mc-clear-price': '금액삭제',
                'h-history':          '🕒 변경 이력 확인',
                'h-session-history':  '🕒 변경 이력 (Session History)',
                'th-task-name':       '업무명',
                'th-status':          '업무상태',
                'th-sender':          '발신인',
                'th-sender-email':    '발신인 이메일',
                'th-receiver':        '수신인',
                'th-receiver-email':  '수신인 이메일',
                'th-due-date':        '완료 예정일',
                'th-send-status':     '발송 상태',
                'th-last-sent':       '마지막 발송',
                'th-schedule':        '일정',
                'th-notice-status':   '상태',
                'th-notice-title':    '제목',
                'th-notice-target':   '발송 채널',
                'th-notice-date':     '기준일',
                'th-notice-lastsent': '마지막 발송',
                'th-notice-action':   '액션',
                'th-addr-name':       '이름',
                'th-addr-name-en':    '영문 이름',
                'th-addr-dept':       '부서',
                'th-addr-title':      '직함',
                'th-addr-email':      '이메일',
                'th-addr-mobile':     '휴대폰',
                'th-addr-phone':      '근무처 전화',
                'th-addr-telegram':   '텔레그램 ID',
            },
        },

        en: {
            header: { 'no':'No', '시작':'Start', '완료':'End', '개발업무(wbs)':'Task (WBS)', '기간':'Dur.', '소요일':'work', '상태':'Status', '업무상세내용':'Details', '현황':'Chart' },
            status: ['On going','Done','Pending','Delay'],
            statusMap: { '진행':'On going','완료':'Done','대기':'Pending','보류':'Delay','지연':'Delay',
                         'Progress':'On going','On going':'On going','Done':'Done','Pending':'Pending','On Hold':'Delay','Delay':'Delay' },
            btnText: '🌐 한글',
            ui: {
                'file-menu-btn':     '📁 Project',
                'settings-menu-btn': '⚙️ Settings',
                'alarm-toggle-btn':  '🟢 Auto Alarm ON',
                'alarm-settings-menu-btn': '⚙️ Auto Alarm Settings',
                'holiday-btn':       '🗓️ Holiday Setup',
                'alarm-send-all-btn':'📧 Batch Send',
                'mail-btn':'🤖 AI Analysis',
                'project-select-btn': '🔃 Select Project',
                'schedule-tools-btn': '🛠️ Schedule Tools',
                'ai-menu-btn':        '🤖 AI Tools',
                'ai-summary-menu-btn':'🤖 AI Summary',
                'ai-qa-menu-btn':     '💬 AI Q&A',
                'ai-analysis-settings-btn': '🤖 AI Analysis Settings',
                'admin-pw-change-btn': '🔑 Change Password',
                'add-user-btn':       '👤 Add User',
                'file-input-label':'🟩 Open Project Excel',
                'auth_button':    '👤 {name} (Connect Drive)',
                'history-btn':    '🕒 Edit History',
                'inbox-btn':'📦 AI Task Inbox',
                'weekly-report-btn': '📋 Weekly Report',
                'drive_save_btn': '💾 Save Project',
                'drive_load_btn': '📂 Open Project',
                'chart-expand-btn':    '📊 Chart View',
                'chart-expand-btn-on': '📊 Basic View',
               
                'excel-btn':      '🟩 Save Project Excel',
                'print-btn':      '🖨️ Print (PDF)',
                'date-sort-btn':  '📅 Sort by Date',
                'file-status-default': 'Select a file or drag & drop an Excel file here. (Double-click any item to edit)',
                'file-status-updated': '✅ Schedule has been updated.',
                'undo-btn': '↩️ Undo',
                'redo-btn': '↪️ Redo',
                'recalc-range-btn': '🔓 Recalc Selected Range',
                'backup_restore_btn': '🔄 Restore Project',
                'new-project-btn': '➕ Add New Project',
                'delete-project-btn': '🗑️ Delete Project',
                'pc-add-btn': '➕ Add',
                'pc-toggle-btn': '🔽 Expand',
                'pc-export-btn': '🟩 Export to Excel',
                'pc-save-btn': '💾 Save',
                'ep-adbd-add-btn': '➕ Add',
                'ep-adbd-toggle-btn': '🔽 Expand',
                'ep-adbd-export-btn': '🟩 Export to Excel',
                'ep-convbd-add-btn': '➕ Add',
                'ep-convbd-toggle-btn': '🔽 Expand',
                'ep-convbd-export-btn': '🟩 Export to Excel',
                'ep-save-btn': '💾 Save',
            },
            filterLabel: {
                'LEVEL(WBS)': 'LEVEL(WBS)',
                '업무상태': 'Status',
                '개발단계': 'Dev Stage',
            },
            filterAll: 'All',
            i18n: {
                'h-alarm':            '🔔 Alarm',
                'h-notice':           '📢 Notice',
                'notice-desc':        'Recurring notice system separate from D-day alarms',
                'btn-alarm-settings': '⚙️ Settings',
                'btn-notice-add':     '+ Add Notice',
                'btn-notice-sendall': '📢 Send All Now',
                'btn-addr-load':      '📂 Load',
                'btn-sync-gantt':     '🔄 Sync from Gantt',
                'btn-print':          '🖨️ Print (PDF)',
                'btn-prev':           '◀ Prev',
                'btn-next':           'Next ▶',
                'btn-today':          'Today',
                'btn-prev-week':      '◀ Prev Week',
                'btn-next-week':      'Next Week ▶',
                'btn-cal-export':     '📤 Export/Sync',
                'lbl-ppt-color':      '🎨 PPT Color',
                'btn-ppt-export':     '📥 Export PPT',
                'btn-mc-clear-price': 'Clear Prices',
                'h-history':          '🕒 Change History',
                'h-session-history':  '🕒 Change History (Session)',
                'th-task-name':       'Task',
                'th-status':          'Status',
                'th-sender':          'Sender',
                'th-sender-email':    'Sender Email',
                'th-receiver':        'Receiver',
                'th-receiver-email':  'Receiver Email',
                'th-due-date':        'Due Date',
                'th-send-status':     'Send Status',
                'th-last-sent':       'Last Sent',
                'th-schedule':        'Sched.',
                'th-notice-status':   'Status',
                'th-notice-title':    'Title',
                'th-notice-target':   'Channel',
                'th-notice-date':     'Base Date',
                'th-notice-lastsent': 'Last Sent',
                'th-notice-action':   'Action',
                'th-addr-name':       'Name',
                'th-addr-name-en':    'English Name',
                'th-addr-dept':       'Dept.',
                'th-addr-title':      'Title',
                'th-addr-email':      'Email',
                'th-addr-mobile':     'Mobile',
                'th-addr-phone':      'Office Phone',
                'th-addr-telegram':   'Telegram ID',
            },
        },
    };
    window._currentLang = 'ko';

    // 💡 안전장치 팝업 메시지 번역 헬퍼
    window._t = function(ko, en) { return window._currentLang === 'en' ? en : ko; };

    window.toggleLang = function() {
        window._currentLang = window._currentLang === 'ko' ? 'en' : 'ko';
        const btn = document.getElementById('lang-toggle-btn');
        btn.textContent = LANG[window._currentLang].btnText;
        // 🐛 [2026-08-30 버그 수정 → 같은 날 재작성] "영문 선택됨" 표시가 옛 고정 파랑(#0056b3)이라
        // 테마가 안 먹혔음. 처음엔 여기서 현재 테마색을 계산해 btn.style에 직접 넣었는데, 그러면
        // "영문으로 바꾼 뒤 테마를 변경"하면 인라인 색이 그대로 굳어버려(다시 토글하기 전까지 갱신 안 됨)
        // 여전히 테마와 다른 색으로 남는 문제가 있었다 — 실제로 그 상태가 "파란색이 박혀 있다"로 보였다.
        // 색을 JS로 칠하지 않고 클래스만 토글해서, 색은 전적으로 CSS(.topbar-btn.lang-active)와
        // _cpApplyLive의 라이브 테마 규칙이 결정하도록 바꾼다 → 테마를 언제 바꾸든 항상 같이 따라간다.
        btn.classList.toggle('lang-active', window._currentLang === 'en');
        btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; // 옛 인라인 잔재 제거

        // UI 버튼 텍스트 일괄 업데이트
        const uiMap = LANG[window._currentLang].ui;
        const name = window.currentUserName || '';
        Object.entries(uiMap).forEach(([id, text]) => {
            const el = document.getElementById(id) || document.querySelector(`.${id}`);
            if (!el) return;
            const t = text.replace('{name}', name);
            el.textContent = t;
        });

        // alarm-toggle-btn 상태 언어 동기화
        const cfg  = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        const isOn = cfg.autoSend !== false;
        window.refreshAlarmAutoButtons(isOn);

        // mail-process-toggle-btn 상태 언어 동기화
        if (window.refreshMailProcessButton) window.refreshMailProcessButton();

        // data-i18n 속성 기반 번역
        const i18nMap = LANG[window._currentLang].i18n || {};
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (i18nMap[key] !== undefined) el.textContent = i18nMap[key];
        });

        // 필터 라벨 갱신
        document.querySelectorAll('.filter-label').forEach(el => {
            const colName = el.dataset.colName;
            if (colName) el.textContent = LANG[window._currentLang].filterLabel[colName] || colName;
        });
        document.querySelectorAll('.btn-all').forEach(el => {
            el.textContent = LANG[window._currentLang].filterAll;
        });

        // file-status 텍스트 갱신
        const fileStatus = document.getElementById('file-status');
        if (fileStatus) {
            const cur = fileStatus.textContent.trim();
            const isUpdated = cur === LANG[window._currentLang === 'ko' ? 'en' : 'ko'].ui['file-status-updated'];
            fileStatus.textContent = isUpdated 
                ? LANG[window._currentLang].ui['file-status-updated']
                : LANG[window._currentLang].ui['file-status-default'];
        }

        // ── 언어 전환 추가 갱신 ──────────────────────────────────
        const _tl = window._currentLang;
        const _en = _tl === 'en';

        // [알람설정 팝업] 섹션 헤더 라벨
        const _asLabels = {
            'sec-server':    { ko:'📡 서버 연결',    en:'📡 Server Connection' },
            'sec-email':     { ko:'📧 이메일 알람',  en:'📧 Email Alarm' },
            'sec-messenger': { ko:'💬 메신저 알람',  en:'💬 Messenger Alarm' },
        };
        Object.entries(_asLabels).forEach(([id, t]) => {
            const sec = document.getElementById(id);
            if (!sec) return;
            const header = sec.previousElementSibling;
            if (header) {
                const spanEl = header.querySelector('span:first-child');
                if (spanEl) spanEl.textContent = _en ? t.en : t.ko;
            }
            // 화살표 텍스트 갱신 (현재 펼침/접힘 상태 반영)
            const arrow = document.getElementById(id + '-arrow');
            if (arrow) {
                const isOpen = sec.style.display !== 'none';
                arrow.textContent = isOpen ? (_en ? '▼ Collapse' : '▼ 접기') : (_en ? '▶ Expand' : '▶ 펼치기');
            }
        });

        // [알람설정 팝업] 폼 라벨/버튼
        const _asModalTexts = {
            'as-lbl-host':    { ko:'서버 주소',  en:'SMTP Host' },
            'as-lbl-port':    { ko:'포트',        en:'Port' },
            'as-lbl-user':    { ko:'계정',        en:'Account' },
            'as-lbl-pass':    { ko:'비밀번호',    en:'Password' },
            'as-lbl-tgtoken': { ko:'Bot Token',   en:'Bot Token' },
            'as-lbl-chatid':  { ko:'내 Chat ID',  en:'My Chat ID' },
        };
        Object.entries(_asModalTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });

        // [알람설정 팝업] 섹션 서브라벨/버튼 텍스트 (id 기반)
        const _asIdTexts = {
            'as-modal-title':          { ko:'⚙️ 알람 설정',                       en:'⚙️ Alarm Settings' },
            'sec-server-label':        { ko:'📥 처음 사용자 — 설치 안내',          en:'📥 First-time Setup Guide' },
            'ig-tab-setup':            { ko:'⚙️ Backend 설치 (Step 1~4)', en:'⚙️ Install Backend (Step 1~4)' },
            'ig-tab-telegram':         { ko:'📱 Telegram (Step 5)',               en:'📱 Telegram (Step 5)' },
            'sec-email-label':         { ko:'🖥️ 이메일 서버 설정',                en:'🖥️ Email Server Settings' },
            'as-lbl-host':             { ko:'서버 주소',                          en:'Server' },
            'as-lbl-port':             { ko:'포트',                               en:'Port' },
            'as-lbl-user':             { ko:'계정',                               en:'Account' },
            'as-lbl-pass':             { ko:'비밀번호',                           en:'Password' },
            'as-smtp-privacy-note':    { ko:'🔒 이 PC 브라우저에 저장 · 공용 PC 사용 비권장', en:'🔒 Stored in this browser · Not recommended on shared PCs' },
            'as-smtp-save-btn':        { ko:'💾 저장',                            en:'💾 Save' },
            'sec-messenger-label':     { ko:'💬 메신저 서버 설정',                en:'💬 Messenger Server Settings' },
            'as-messenger-server-lbl': { ko:'🖥️ 메신저 서버 설정',               en:'🖥️ Messenger Server Settings' },
            'as-tg-sub':               { ko:'(현재: Telegram)',                   en:'(Current: Telegram)' },
            'as-lbl-tgtoken':          { ko:'Bot Token',                          en:'Bot Token' },
            'as-lbl-chatid':           { ko:'내 Chat ID',                         en:'My Chat ID' },
            'as-tg-save-btn':          { ko:'💾 저장',                            en:'💾 Save' },
            'as-tg-test-btn':          { ko:'📨 테스트',                          en:'📨 Test' },
            'as-drive-save-item':      { ko:'⬆️ 전체 설정 저장',                  en:'⬆️ Save all settings' },
            'as-drive-load-item':      { ko:'⬇️ 전체 설정 불러오기',              en:'⬇️ Load all settings' },
            'as-tg-recv-label':        { ko:'👥 메신저 수신자',                   en:'👥 Messenger Recipients' },
            'as-tg-recv-sub':          { ko:'(Summary 멤버 자동 반영)',           en:'(Auto from Summary members)' },
            'as-tg-addr-guide':        { ko:'📋 텔레그램 ID는 주소록 탭에서 관리합니다.', en:'📋 Telegram IDs are managed in the Address Book tab.' },
            'as-modal-save-btn':       { ko:'저장',                               en:'Save' },
            'as-modal-close-btn':      { ko:'닫기',                               en:'Close' },
        };
        Object.entries(_asIdTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });

        // [알람설정 섹션 접기/펼치기 화살표] 현재 열림 상태 유지하며 언어만 갱신
        ['sec-server','sec-email','sec-messenger'].forEach(sid => {
            const sec   = document.getElementById(sid);
            const arrow = document.getElementById(sid + '-arrow');
            if (!sec || !arrow) return;
            const open = sec.style.display !== 'none';
            arrow.textContent = open ? (_en ? '▼ Collapse' : '▼ 접기') : (_en ? '▶ Expand' : '▶ 펼치기');
        });

        // [TG Chat ID 안내] 번역
        const _tgGuideArrow = document.getElementById('tg-chatid-guide-arrow');
        if (_tgGuideArrow) {
            const _tgOpen = document.getElementById('tg-chatid-guide') && document.getElementById('tg-chatid-guide').style.display !== 'none';
            _tgGuideArrow.textContent = _tgOpen ? (_en ? '▲ Close' : '▲ 닫기') : (_en ? '▼ How to get Chat ID' : '▼ Chat ID 발급 방법');
        }
        const _tgGuideContent = document.getElementById('tg-chatid-guide-content');
        if (_tgGuideContent) _tgGuideContent.innerHTML = _en
            ? '<b>1.</b> Search <b>@userinfobot</b> in Telegram and start it<br>'
            + '<b>2.</b> Type /start → the bot will send your Chat ID (a number)<br>'
            + '<b>3.</b> Enter that number in the Chat ID field below and click Add<br>'
            + '<span style="color:#e67e22;">⚠️ Bot Token is created via @BotFather — after saving settings, share the bot link with team members and ask them to send /start</span>'
            : '<div style="background:#e8f4fd; border-left:3px solid #2c5f8a; padding:6px 10px; margin-bottom:8px; border-radius:0 4px 4px 0; font-size:11px; color:#1a3a5c;">💡 Telegram 알람을 받으려면 <b>Bot Token</b>과 <b>Chat ID</b> 2가지가 필요합니다.<br>　Bot Token = 알람을 보내는 봇 계정 · Chat ID = 알람을 받을 내 계정 번호</div>'
            + '<b>5-1. 텔레그램 앱 설치</b><br>'
            + '　　<a href="https://telegram.org" target="_blank" style="padding:2px 8px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px;">telegram.org →</a>　에서 PC · 모바일 설치<br><br>'
            + '<b>5-2. Bot Token 발급 (@BotFather)</b><br>'
            + '　　① 텔레그램에서 <b>@BotFather</b> 검색 후 시작<br>'
            + '　　② <b>/newbot</b> 입력 → 봇 이름 입력 (예: KORTEK Alarm)<br>'
            + '　　③ 봇 사용자명 입력 (영문, _bot으로 끝나야 함 · 예: kortek_alarm_bot)<br>'
            + '　　④ BotFather가 <b>Token</b> (긴 문자열)을 발급 → 복사해두기<br>'
            + '　　⑤ 발급된 봇 링크(t.me/봇이름)를 팀원에게 공유 → 각자 <b>/start</b> 전송 요청<br><br>'
            + '<b>5-3. Chat ID 확인 (@userinfobot)</b><br>'
            + '　　① 텔레그램에서 <b>@userinfobot</b> 검색 후 시작<br>'
            + '　　② <b>/start</b> 입력 → 봇이 나의 <b>Chat ID (숫자)</b> 를 알려줌<br>'
            + '　　③ 팀원도 동일하게 본인 Chat ID 확인 후 PM에게 전달<br><br>'
            + '<b>5-4. 앱에서 입력 및 저장</b><br>'
            + '　　① 이 화면 상단 → <b>Bot Token</b> 입력 후 💾 저장<br>'
            + '　　② <b>메신저 수신자</b> → Chat ID 입력 후 추가<br>'
            + '　　③ 📨 테스트 버튼으로 수신 확인 ✅';

        // [처음 사용자 설치 안내] 섹션 안 텔레그램 배지 번역
        // 💡 [2026-08-31] 이 안내가 별도 팝업(install-guide-modal)이 아니라 알람 설정 안의 섹션 하나로
        //    옮겨지면서, 제목/탭(sec-server-label, ig-tab-setup, ig-tab-telegram)은 위 _asIdTexts에
        //    통합됨 — 배지만 별도 forEach로 남아있음(ig-badge-* id는 그대로 재사용).
        ['ig-badge-pm-1','ig-badge-pm-2','ig-badge-pm-3'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? 'PM' : 'PM';
        });
        ['ig-badge-team-1'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? 'Team' : '팀원';
        });
        const _igSetup = document.getElementById('ig-content-setup');
        if (_igSetup) _igSetup.innerHTML = _en
            ? '<div style="background:#fff3cd; border-left:3px solid #e6a817; padding:6px 10px; margin-bottom:10px; border-radius:0 4px 4px 0; font-size:11px; color:#7a5210;">🌐 <b>Chrome browser is recommended.</b> Some features (e.g. mail import) may not work in IE · Edge.</div>'
            + '<b>Step 1.</b> Install Python <a href="https://www.python.org/downloads/" target="_blank" style="margin-left:6px; padding:2px 10px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px;">python.org →</a><br>'
            + '　　Check <b>"Add Python to PATH"</b> during install (required — server won\'t run without it)<br><br>'
            + '<b>Step 2.</b> Install KORTEK Backend files<br>'
            + '　　<a href="javascript:void(0)" onclick="window.downloadRawFile(\'https://raw.githubusercontent.com/yhparkkortek/ganttchart/main/kortek_backend.zip\',\'kortek_backend.zip\')" style="padding:2px 10px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px; white-space:nowrap;">⬇️ Download kortek_backend.zip</a><br>'
            + '　　→ Unzip → Confirm 2 files (kortek_backend.py / kortek_backend.bat)<br><br>'
            + '<b>Step 3.</b> Double-click <b>kortek_backend.bat</b><br>'
            + '　　→ First run installs packages automatically (1~2 min, instant afterward)<br>'
            + '　　→ Ready when the black window shows <b>http://127.0.0.1:5000</b> ✅<br>'
            + '　　→ Minimize the black window (closing it stops the server)<br><br>'
            + '<b>Step 4.</b> Keep the <b>black window (server) open</b> while using the app<br>'
            + '　　→ Closing it stops mail send/receive and Telegram alarms<br><br>'
            + '<div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:5px; padding:10px 12px;">'
            + '<b>💡 Auto-start server on PC boot (optional)</b><br>'
            + '　　① Right-click <b>kortek_backend.bat</b> → [Create shortcut]<br>'
            + '　　② Press <b>Win + R</b> → type <b>shell:startup</b> → Enter<br>'
            + '　　　 (Opens the Windows Startup folder)<br>'
            + '　　③ Paste the shortcut from ① into that folder<br>'
            + '　　→ The backend server will now start automatically every time you boot ✅'
            + '</div>'
            : '<div style="background:#fff3cd; border-left:3px solid #e6a817; padding:6px 10px; margin-bottom:10px; border-radius:0 4px 4px 0; font-size:11px; color:#7a5210;">🌐 <b>Chrome 브라우저 사용을 권장합니다.</b> IE · Edge에서는 메일 가져오기 등 일부 기능이 동작하지 않을 수 있습니다.</div>'
            + '<b>Step 1.</b> Python 설치 <a href="https://www.python.org/downloads/" target="_blank" style="margin-left:6px; padding:2px 10px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px;">python.org →</a><br>'
            + '　　설치 시 <b>"Add Python to PATH"</b> 체크 필수 (미체크 시 서버 실행 안 됨)<br><br>'
            + '<b>Step 2.</b> KORTEK Backend 파일 설치<br>'
            + '　　<a href="javascript:void(0)" onclick="window.downloadRawFile(\'https://raw.githubusercontent.com/yhparkkortek/ganttchart/main/kortek_backend.zip\',\'kortek_backend.zip\')" style="padding:2px 10px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px; white-space:nowrap;">⬇️ kortek_backend.zip 다운로드</a><br>'
            + '　　→ 압축 풀기 → 파일 2개 확인 (kortek_backend.py / kortek_backend.bat)<br><br>'
            + '<b>Step 3.</b> <b>kortek_backend.bat</b> 더블클릭<br>'
            + '　　→ 최초 실행 시 패키지 자동 설치 (1~2분 소요, 이후엔 바로 실행)<br>'
            + '　　→ 검은 창에 <b>http://127.0.0.1:5000</b> 이 보이면 준비 완료 ✅<br>'
            + '　　→ 검은 창은 <b>최소화</b>해두세요 (닫으면 서버 종료됨)<br><br>'
            + '<b>Step 4.</b> 앱 사용 중에는 <b>검은 창(서버)을 닫지 마세요</b><br>'
            + '　　→ 창을 닫으면 메일 발송·수신·Telegram 알람이 모두 중단됩니다.<br><br>'
            + '<div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:5px; padding:10px 12px;">'
            + '<b>💡 PC 켤 때마다 서버 자동 시작 설정 (선택)</b><br>'
            + '　　① <b>kortek_backend.bat</b> 파일 우클릭 → [바로가기 만들기]<br>'
            + '　　② 키보드 <b>Win + R</b> → 열기 창에 <b>shell:startup</b> 입력 → Enter<br>'
            + '　　　 (Windows 시작 프로그램 폴더가 열립니다)<br>'
            + '　　③ 열린 폴더에 ①의 바로가기 붙여넣기<br>'
            + '　　→ 이후 PC를 켤 때마다 백엔드 서버가 자동으로 시작됩니다 ✅'
            + '</div>';
        const _igTelegram = document.getElementById('ig-content-telegram');
        if (_igTelegram) _igTelegram.innerHTML = _en
            ? '<div style="background:#e8f4fd; border-left:3px solid #2c5f8a; padding:6px 10px; margin-bottom:10px; border-radius:0 4px 4px 0; font-size:11px; color:#1a3a5c;">💡 Two things are needed for Telegram alarms: <b>Bot Token</b> and <b>Chat ID</b>.<br>　Bot Token = the account that sends alarms · Chat ID = your account number to receive them</div>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-1. Install Telegram</b><br>'
            + '　　<a href="https://telegram.org" target="_blank" style="padding:2px 8px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px;">telegram.org →</a>　on PC or mobile<br><br>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-2. Get a Bot Token (@BotFather)</b><br>'
            + '　　① Search <b>@BotFather</b> in Telegram and start it<br>'
            + '　　② Type <b>/newbot</b> → enter a bot name (e.g. KORTEK Alarm)<br>'
            + '　　③ Enter a username (English, must end in _bot · e.g. kortek_alarm_bot)<br>'
            + '　　④ BotFather issues a <b>Token</b> (long string) → copy it<br>'
            + '　　⑤ Share the bot link (t.me/botname) with the team → ask each member to send <b>/start</b><br><br>'
            + '<span style="display:inline-block; background:#2f9e44; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">Team</span> <b>5-3. Check your Chat ID (@userinfobot)</b><br>'
            + '　　① Search <b>@userinfobot</b> in Telegram and start it<br>'
            + '　　② Type <b>/start</b> → the bot replies with your <b>Chat ID (a number)</b><br>'
            + '　　③ Send that number to the PM<br><br>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-4. Register in the Address Book and save</b><br>'
            + '　　① Alarm Settings → Telegram section → enter <b>Bot Token</b> → 💾 Save<br>'
            + '　　② <b>Address Book tab</b> → enter each member\'s Chat ID<br>'
            + '　　③ Confirm with the 📨 Test button ✅'
            : '<div style="background:#e8f4fd; border-left:3px solid #2c5f8a; padding:6px 10px; margin-bottom:10px; border-radius:0 4px 4px 0; font-size:11px; color:#1a3a5c;">💡 Telegram 알람을 받으려면 <b>Bot Token</b>과 <b>Chat ID</b> 2가지가 필요합니다.<br>　Bot Token = 알람을 보내는 봇 계정 · Chat ID = 알람을 받을 내 계정 번호</div>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-1. 텔레그램 앱 설치</b><br>'
            + '　　<a href="https://telegram.org" target="_blank" style="padding:2px 8px; background:#2c5f8a; color:#fff; border-radius:4px; text-decoration:none; font-size:11px;">telegram.org →</a>　에서 PC 또는 모바일에서 설치<br><br>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-2. Bot Token 발급 (@BotFather)</b><br>'
            + '　　① 텔레그램에서 <b>@BotFather</b> 검색 후 시작<br>'
            + '　　② <b>/newbot</b> 입력 → 봇 이름 입력 (예: KORTEK Alarm)<br>'
            + '　　③ 봇 사용자명 입력 (영문, _bot으로 끝나야 함 · 예: kortek_alarm_bot)<br>'
            + '　　④ BotFather가 <b>Token</b> (긴 문자열)을 발급 → 복사해두기<br>'
            + '　　⑤ 발급된 봇 링크(t.me/봇이름)를 팀원에게 공유 → 각자 <b>/start</b> 전송 요청<br><br>'
            + '<span style="display:inline-block; background:#2f9e44; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">팀원</span> <b>5-3. Chat ID 확인 (@userinfobot)</b><br>'
            + '　　① 텔레그램에서 <b>@userinfobot</b> 검색 후 시작<br>'
            + '　　② <b>/start</b> 입력 → 봇이 나의 <b>Chat ID (숫자)</b> 를 알려줌<br>'
            + '　　③ 팀원도 동일하게 본인 Chat ID 확인 후 PM에게 전달<br><br>'
            + '<span style="display:inline-block; background:#2c5f8a; color:#fff; font-size:9.5px; font-weight:bold; padding:1px 7px; border-radius:10px; margin-bottom:4px;">PM</span> <b>5-4. 주소록에 등록 및 저장</b><br>'
            + '　　① 알람 설정 → Telegram 섹션 → <b>Bot Token</b> 입력 후 💾 저장<br>'
            + '　　② <b>주소록 탭</b> → 팀원 행에 Chat ID 입력<br>'
            + '　　③ 📨 테스트 버튼으로 수신 확인 ✅';

        // [Notice] 발송 로그 제목
        const _nlTitle = document.getElementById('notice-log-title');
        if (_nlTitle) _nlTitle.textContent = _en ? '📋 Send Log' : '📋 발송 로그';

        // [Notice 등록 모달] 라벨/버튼 번역
        const _nmTexts = {
            'nm-lbl-title':         { ko:'제목 *',               en:'Title *' },
            'nm-lbl-body':          { ko:'내용 *',               en:'Content *' },
            'nm-lbl-deadline':      { ko:'기준일 (D-day 기준) *', en:'Base Date (D-day) *' },
            'nm-lbl-alarm':         { ko:'알람 시점',             en:'Alarm Timing' },
            'nm-lbl-direct':        { ko:'직접 입력:',            en:'Custom:' },
            'nm-lbl-days-before':   { ko:'일 전',                en:'days before' },
            'nm-lbl-add-btn':       { ko:'+ 추가',               en:'+ Add' },
            'nm-lbl-target':        { ko:'📬 수신 대상',          en:'📬 Recipients' },
            'nm-lbl-email':         { ko:'📧 이메일',             en:'📧 Email' },
            'nm-radio-email-all':   { ko:'프로젝트 전체',         en:'All Project' },
            'nm-radio-email-none':  { ko:'발송 안 함',            en:'Do Not Send' },
            'nm-radio-email-custom':{ ko:'직접 입력',             en:'Custom' },
            'nm-lbl-tg':            { ko:'💬 Telegram',           en:'💬 Telegram' },
            'nm-radio-tg-all':      { ko:'전체',                  en:'All' },
            'nm-radio-tg-none':     { ko:'발송 안 함',            en:'Do Not Send' },
            'nm-radio-tg-select':   { ko:'개별 선택',             en:'Select' },
            'nm-save-btn':          { ko:'저장',                  en:'Save' },
            'nm-cancel-btn':        { ko:'취소',                  en:'Cancel' },
        };
        Object.entries(_nmTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        // notice modal title 갱신 (모달 열려있을 때 즉시 반영)
        const _nmTitle = document.getElementById('notice-modal-title');
        if (_nmTitle) {
            const _cur = _nmTitle.textContent;
            if (_cur.includes('수정') || _cur.includes('Edit')) _nmTitle.textContent = _en ? '📢 Edit Notice' : '📢 공지 수정';
            else _nmTitle.textContent = _en ? '📢 Add Notice' : '📢 공지 등록';
        }

        // [Notice 탭] 빈 상태 메시지
        const _noticeEmpty = document.getElementById('notice-empty-msg');
        if (_noticeEmpty) _noticeEmpty.textContent = _en ? 'No notices registered. Click [+ Add Notice] to add one.' : '등록된 공지가 없습니다. [+ 공지 등록] 버튼을 눌러 추가하세요.';

        // [Summary 탭] 고정 라벨/헤더 번역
        const _sumTexts = {
            'sum-th-category':    { ko:'구분',              en:'Category' },
            'sum-td-plan':        { ko:'계획',              en:'Plan' },
            'sum-td-actual':      { ko:'실적',              en:'Actual' },
            'sum-lbl-devdays':    { ko:'개발기간',       en:'Dev Period' },
            'sum-h3-progress':    { ko:'개발 진척 현황',    en:'Development Progress' },
            'sum-h3-overview':    { ko:'프로젝트 개요',     en:'Project Overview' },
            'sum-lbl-purpose':    { ko:'적용 목적',         en:'Purpose' },
            'sum-lbl-volume':     { ko:'연간 수요량',       en:'Annual Volume' },
            'sum-lbl-mpdate':     { ko:'목표 양산 일정',    en:'Mass Prod. Schedule' },
            'sum-h3-info':        { ko:'프로젝트 정보',     en:'Project Info' },
            'sum-lbl-customer':   { ko:'고객사',            en:'Customer' },
            'sum-lbl-cmodel':     { ko:'고객 모델명',       en:'Customer Model' },
            'sum-lbl-pcode':      { ko:'프로젝트 코드',     en:'Project Code' },
            'sum-lbl-pname':      { ko:'프로젝트 명칭',     en:'Project Name' },
            'sum-lbl-ktkpn':      { ko:'KTK PN_모델명',     en:'KTK PN_Model' },
            'sum-lbl-mailkw':     { ko:'메일 키워드 🔖',    en:'Mail Keywords 🔖'},
            'sum-h3-background':  { ko:'추진 배경 및 의의', en:'Background & Significance' },
            'sum-h3-member1':     { ko:'프로젝트 멤버-1',   en:'Project Members-1' },
            'sum-h3-member2':     { ko:'프로젝트 멤버-2',   en:'Project Members-2' },
            'sum-h3-member3':     { ko:'프로젝트 멤버-3',   en:'Project Members-3' },
            'sum-h3-member3-sub': { ko:'(자유 추가)',        en:'(Custom)' },
            'sum-add-member3-btn':{ ko:'+ 인원 추가',       en:'+ Add Member' },
            'sum-h3-photo':       { ko:'제품 사진',         en:'Product Photos' },
            'sum-h3-materials':   { ko:'주요 자재',         en:'Key Materials' },
        };
        Object.entries(_sumTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        const _sumAddMatBtn = document.getElementById('sum-add-material-btn');
        if (_sumAddMatBtn) _sumAddMatBtn.textContent = _en ? '+ Add Material' : '+ 자재 추가';
        // [Summary 탭] "메일 키워드" 라벨 — title 툴팁(사람 이름 관련 경고 포함)
        const _sumMailKwLbl = document.getElementById('sum-lbl-mailkw');
        if (_sumMailKwLbl) _sumMailKwLbl.title = _en
            ? "Aliases/abbreviations to match new mail to this project during auto-collection & analysis. Comma-separated (e.g. S32, STELLAR)\n\n⚠️ Don't enter a person's name — every mail that person sends will auto-match this project regardless of content (their own name always appears in their signature). Names already in the address book are auto-excluded from matching, but it's safest not to add them in the first place."
            : "메일 자동수집·분석 시 이 프로젝트로 매칭할 별칭/약어. 쉼표로 구분 (예: S32, 에스삼투, STELLAR)\n\n⚠️ 사람 이름은 넣지 마세요 — 그 사람이 보내는 모든 메일이 내용과 무관하게 이 프로젝트로 자동 매칭됩니다(서명란에 항상 본인 이름이 들어가기 때문). 주소록에 등록된 이름은 매칭 시 자동으로 제외되지만, 안전하게 처음부터 넣지 않는 걸 권장합니다.";
        // [Summary 탭] "프로젝트 상태" select — title 툴팁 + 옵션(진행중/완료) 텍스트
        const _sumStatusSel = document.getElementById('sum-project-status');
        if (_sumStatusSel) {
            _sumStatusSel.title = _en
                ? 'Marking a project "Done" grays it out in the "Load Project" list, and — unless turned off in [Settings → Mail Auto-Assign Settings] — also excludes it from new mail auto-matching.'
                : "완료로 표시하면 '프로젝트 불러오기' 목록에서 흐리게 구분 표시되고, [설정 → 메일 자동배치 설정]에서 끄지 않는 한 새 메일 자동매칭 대상에서도 제외됩니다.";
            const _sumStatusOpts = _sumStatusSel.options;
            if (_sumStatusOpts[0]) _sumStatusOpts[0].textContent = _en ? '🔵 In Progress' : '🔵 진행중';
            if (_sumStatusOpts[1]) _sumStatusOpts[1].textContent = _en ? '✅ Done' : '✅ 완료';
        }
        // 💡 주요 자재 표의 칸 placeholder/버튼 title도 언어에 맞춰 다시 그림(값은 collectMaterialRows(true)로
        //    빈 자유추가 행까지 그대로 보존한 채 다시 렌더링해서, 언어만 바뀌고 입력 중이던 내용은 안 날아감)
        if (window.renderMaterialRows && window.collectMaterialRows) window.renderMaterialRows(window.collectMaterialRows(true));

        // [변경이력 박스] 시작일/종료일/삭제비밀번호/구간삭제 번역 (6개 탭 공통)
        document.querySelectorAll('label').forEach(lbl => {
            const txt = lbl.textContent.trim();
            if (txt.startsWith('시작일') || txt.startsWith('Start Date') || txt.startsWith('Start')) {
                const inp = lbl.querySelector('input[type="date"]');
                if (inp) lbl.childNodes[0].textContent = _en ? 'Start Date ' : '시작일 ';
            }
            if (txt.startsWith('종료일') || txt.startsWith('End Date') || txt.startsWith('End')) {
                const inp = lbl.querySelector('input[type="date"]');
                if (inp) lbl.childNodes[0].textContent = _en ? 'End Date ' : '종료일 ';
            }
        });
        document.querySelectorAll('input[placeholder="삭제 비밀번호"], input[placeholder="Delete Password"]').forEach(el => {
            el.placeholder = _en ? 'Delete Password' : '삭제 비밀번호';
        });
        // 💡 [2026-08-30] 예전엔 탭마다 "🗑️ 구간 삭제"/"구간 삭제"(아이콘 유무)가 섞여 있어서 그 상태를
        // 보존하는 분기가 있었는데, 8개 이력 박스를 "🗑️ 구간 삭제"로 통일했으므로 분기를 없앰
        // (혹시 남아있는 옛 표기도 여기서 자연스럽게 통일된 표기로 흡수된다).
        const _rangeBtnLabels = ['🗑️ 구간 삭제', '구간 삭제', '🗑️ Delete Range', 'Delete Range'];
        document.querySelectorAll('button').forEach(btn => {
            if (_rangeBtnLabels.includes(btn.textContent.trim())) {
                btn.textContent = _en ? '🗑️ Delete Range' : '🗑️ 구간 삭제';
            }
        });

        // [M.C Table] ℹ️ 안내문 번역
        const _mcTip = document.getElementById('mc-help-tip');
        if (_mcTip) _mcTip.innerHTML = _en
            ? '📌 Type <b>"etc."</b> (lowercase) in the <b>ITEM</b> column to mark the last row of the current group — SUBTOTAL will be calculated at that point.<br><br>'
            + '📌 Click <b>NO</b> column: row menu (add/delete/move) · <b>Ctrl/Shift</b> click: multi-select rows<br><br>'
            + '📌 Rows with an empty TYPE inherit the TYPE from the row above (used for group grouping).'
            : '📌 <b>ITEM</b> 열에 <b>"etc."</b>(소문자)를 적으면, 그 행이 현재 그룹의 마지막 행이 되어 SUBTOTAL이 계산됩니다.<br><br>'
            + '📌 <b>NO</b> 열 클릭: 메뉴(행 추가/삭제/이동) · <b>Ctrl/Shift</b> 클릭: 여러 행 선택<br><br>'
            + '📌 TYPE이 비어있는 행은 바로 위 행의 TYPE을 그대로 이어받은 것으로 간주됩니다 (그룹 구분용).';

        // [Brief SPEC / M.C Table] 접기·펴기 버튼 텍스트 즉시 반영
        const _bsBtn = document.getElementById('bs-toggle-hidden-btn');
        if (_bsBtn) _bsBtn.textContent = (window._bmExpanded && window._bmExpanded.bs)
            ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
        const _mcBtn = document.getElementById('mc-toggle-hidden-btn');
        if (_mcBtn) _mcBtn.textContent = (window._bmExpanded && window._bmExpanded.mc)
            ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');

        // sum-level0-timeline 안내문 갱신
        const _sumTl = document.getElementById('sum-level0-timeline');
        if (_sumTl) {
            const _tlDiv = _sumTl.querySelector('div[style*="color:#999"]');
            if (_tlDiv) {
                if (_tlDiv.textContent.includes('불러오면') || _tlDiv.textContent.includes('Load Gantt'))
                    _tlDiv.textContent = _en ? 'Load Gantt data to display Level 0 timeline.' : 'Gantt chart 데이터를 불러오면 0레벨 항목이 타임라인으로 표시됩니다.';
                else if (_tlDiv.textContent.includes('날짜') || _tlDiv.textContent.includes('No date'))
                    _tlDiv.textContent = _en ? 'No date set on Level 0 items — timeline unavailable.' : '0레벨 항목에 날짜가 없어 타임라인을 표시할 수 없습니다.';
            }
        }

        // [캘린더] 재렌더 (년/월/요일 반영)
        if (window.calRender && document.getElementById('cal-page')) window.calRender();

        // [AI 업무분석 팝업] 탭 버튼 텍스트
        const _mailTabTexts = {
            'mail-tab-paste':  { ko:'✏️ 직접 입력', en:'✏️ Direct Input' },
            'mail-tab-file':   { ko:'📂 파일 첨부', en:'📂 File Attach' },
            'mail-tab-server': { ko:'🌐 메일 서버', en:'🌐 Mail Server' },
        };
        Object.entries(_mailTabTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });

        // [AI 업무분석 팝업] 주요 고정 텍스트 (id 기반)
        const _mailIdTexts = {
            'mail-popup-title':       { ko:'📧 AI 업무 분석',        en:'📧 AI Task Analysis' },
            'mail-ai-section-label':  { ko:'🤖 AI 선택',             en:'🤖 Select AI' },
            'mail-ai-model-label':    { ko:'🔧 모델 선택',            en:'🔧 Model' },
            'mail-cache-clear-btn':   { ko:'🗑️ 분석 캐시 초기화',    en:'🗑️ Clear Cache' },
            'mail-key-link-btn':      { ko:'🔗 발급받기',             en:'🔗 Get Key' },
            'mail-key-save-btn':      { ko:'💾 저장',                  en:'💾 Save' },
            'mail-analyze-btn':       { ko:'🤖 AI 분석',              en:'🤖 AI Analyze' },
            'mail-reset-btn':         { ko:'⏹ 중단/초기화',           en:'⏹ Stop/Reset' },
            'paste-batch-btn':        { ko:'⚡ 선택항목 연속등록',    en:'⚡ Batch Register' },
            'paste-batch-inbox-btn':  { ko:'📥 선택항목 보관함 이동', en:'📥 Move to Inbox' },
            'mf-clear-btn':           { ko:'🗑️ 전체 비우기',          en:'🗑️ Clear All' },
            'mf-reset-btn':           { ko:'⏹ 중단/초기화',           en:'⏹ Stop/Reset' },
            'mf-batch-btn':           { ko:'⚡ 선택항목 연속등록',    en:'⚡ Batch Register' },
            'mf-batch-inbox-btn':     { ko:'📥 선택항목 보관함 이동', en:'📥 Move to Inbox' },
            'ms-fetch-btn':           { ko:'📥 메일 가져오기',         en:'📥 Fetch Mails' },
            'ms-stop-btn':            { ko:'⏹ 중단',                  en:'⏹ Stop' },
            'ms-batch-btn':           { ko:'⚡ 선택항목 연속등록',    en:'⚡ Batch Register' },
            'ms-batch-inbox-btn':     { ko:'📥 선택항목 보관함 이동', en:'📥 Move to Inbox' },
            'mail-prompt-btn':          { ko:'✏️ 프롬프트',                   en:'✏️ Prompt' },
            'mail-paste-label':         { ko:'📋 메일 내용 붙여넣기',          en:'📋 Paste Mail Content' },
            'ms-keyword-label':         { ko:'🔍 키워드 필터',                  en:'🔍 Keyword Filter' },
            'ms-filter-label':          { ko:'🔍 필터 조건',                    en:'🔍 Filter' },
            'ms-filter-sub':            { ko:'(비우면 전체, 쉼표로 OR 조건)',    en:'(Leave empty for all, comma = OR)' },
            'ms-lbl-subject':           { ko:'제목',                            en:'Subject' },
            'ms-lbl-from':              { ko:'발신자',                          en:'From' },
            'ms-lbl-body':              { ko:'본문',                            en:'Body' },
            'ms-force-reset-btn':       { ko:'🔄 초기화',                       en:'🔄 Reset' },
            'ms-check-all-label':       { ko:'전체선택',                        en:'Select All' },
            'ms-clear-results-btn':     { ko:'🗑️ 초기화',                       en:'🗑️ Clear' },
            'mail-right-empty-title':   { ko:'메일을 분석하면 여기에 결과가 표시됩니다', en:'Analysis results will appear here' },
            'mail-right-empty-sub':     { ko:'직접 입력하거나 파일/서버에서 메일을 가져오세요', en:'Paste content or import from file / mail server' },
            'mail-original-label':      { ko:'📨 원본 메일 보기',               en:'📨 View Original Mail' },
            'mail-right-insert-btn-label': { ko:'✅ 개별 등록',                en:'✅ Register' },
            'mail-right-inbox-btn-label':  { ko:'📥 보관함',                   en:'📥 Inbox' },
        };

        Object.entries(_mailIdTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        // [AI팝업] "원본 메일 보기" 본문 칸 — 더블클릭 접기 안내 툴팁
        const _mailOrigBody = document.getElementById('mail-original-body');
        if (_mailOrigBody) _mailOrigBody.title = _en ? 'Double-click to collapse' : '더블클릭하면 접힙니다';
        // [AI팝업] "📋 수집 N개 / 분석 N개" — 안에 숫자용 <span>(ms-result-count/ms-analyzed-count)이
        //    끼어있어서 위 textContent 방식(통째로 덮어쓰기)을 쓰면 그 숫자 칸까지 같이 날아간다.
        //    현재 숫자를 먼저 읽어둔 뒤, 언어에 맞는 문구로 innerHTML을 다시 조립하면서 숫자를 그대로 되살린다.
        const _msSummaryEl = document.getElementById('ms-collect-summary');
        if (_msSummaryEl) {
            const _msRc = document.getElementById('ms-result-count');
            const _msAc = document.getElementById('ms-analyzed-count');
            const _msRcVal = _msRc ? _msRc.textContent : '0';
            const _msAcVal = _msAc ? _msAc.textContent : '0';
            _msSummaryEl.innerHTML = _en
                ? `📋 Collected <span id="ms-result-count">${_msRcVal}</span> / Analyzed <span id="ms-analyzed-count">${_msAcVal}</span>`
                : `📋 수집 <span id="ms-result-count">${_msRcVal}</span>개 / 분석 <span id="ms-analyzed-count">${_msAcVal}</span>개`;
        }
        // [AI팝업] textarea placeholder 번역
        const _mcInput = document.getElementById('mail-content-input');
        if (_mcInput) _mcInput.placeholder = _en ? 'Paste the mail content here...' : '메일 본문을 여기에 붙여넣으세요...';

        const _mfDropLabel = document.getElementById('mf-drop-label');
        if (_mfDropLabel) _mfDropLabel.textContent = _en ? 'Click or drag files here' : '클릭하거나 파일을 드래그하세요';
        const _mfDropSub = document.getElementById('mf-drop-sub');
        if (_mfDropSub) _mfDropSub.textContent = _en ? '.eml / .html / .txt up to 500 files' : '.eml / .html / .txt 최대 500개';

        // [업무 보관함 모달] 헤더 번역
        // 💡 [2026-08-25] childNodes[0]만 바꾸는 이유 — 이 span 안엔 ℹ️ 도움말 아이콘(nested span)이
        //    같이 들어있어서, textContent를 통째로 덮으면 그 아이콘/툴팁까지 같이 사라진다.
        const _ibxTitle = document.getElementById('inbox-modal-title');
        if (_ibxTitle) _ibxTitle.childNodes[0].textContent = _en ? 'AI Task Inbox' : 'AI 업무 보관함';
        const _ibxHelpTip = document.getElementById('inbox-help-tip-text');
        if (_ibxHelpTip) _ibxHelpTip.innerHTML = _en
            ? `📧 Tasks added via [📥 Inbox] in mail analysis are kept independent of any project (persists across project switches).<br><br>
               ➡️ <b>Current Project</b>: placed at the end of the open project's development-stage (L0) section<br>
               📤 <b>Other Project</b>: sent directly to another project on Drive, without switching screens<br><br>
               If a sent task was lost because a teammate saved at the same time, resending the "Sent" item the same way recovers it.`
            : `📧 메일 분석에서 [📥 보관함]으로 담은 업무를 프로젝트와 독립적으로 보관합니다. (프로젝트를 전환해도 유지됨)<br><br>
               ➡️ <b>현재 프로젝트</b> : 열려 있는 프로젝트의 개발단계(L0) 구간 끝에 배치<br>
               📤 <b>다른 프로젝트</b> : 화면 전환 없이 드라이브의 다른 프로젝트로 직접 전송<br><br>
               전송된 업무가 팀원의 동시 저장으로 유실된 경우, '전송됨' 항목을 같은 방법으로 재전송하면 복구됩니다.`;

        const _ibxBatchBtn = document.getElementById('inbox-batch-register-btn');
        if (_ibxBatchBtn) {
            _ibxBatchBtn.textContent = _en ? '🚀 Send Matched Batch' : '🚀 매칭건 일괄전송';
            _ibxBatchBtn.title = _en
                ? 'Send all "Pending" items with a confirmed single match + confirmed dates to their projects at once (for clearing out previously piled-up items)'
                : '매칭 확정 + 날짜 확정된 대기 항목을 한 번에 각 프로젝트로 전송 (예전에 쌓인 대기 항목 정리용)';
        }
        const _ibxCloseBtn = document.getElementById('inbox-close-btn');
        if (_ibxCloseBtn) _ibxCloseBtn.title = _en ? 'Close' : '닫기';

        const _ibxSubTexts = {
            'inbox-subqueue-header':     { ko:'📬 미분류 / 신규발신자 / 자동폐기', en:'📬 Unclassified / New Senders / Auto-discarded' },
            'inbox-unmatched-label':     { ko:'📭 미분류',              en:'📭 Unclassified' },
            'inbox-newsender-label':     { ko:'👤 신규발신자',          en:'👤 New Sender' },
            'inbox-discarded-label':     { ko:'🗑 자동폐기',            en:'🗑 Discarded' },
            'inbox-unmatched-unit':      { ko:'건',                     en:'' },
            'inbox-newsender-unit':      { ko:'건',                     en:'' },
            'inbox-discarded-unit':      { ko:'건',                     en:'' },
            'inbox-reset-unmatched-btn': { ko:'🗑 미분류 초기화',       en:'🗑 Reset Unclassified' },
            'inbox-reset-newsender-btn': { ko:'🗑 신규발신자 초기화',   en:'🗑 Reset New Senders' },
            'inbox-reset-discarded-btn': { ko:'🗑 자동폐기 초기화',     en:'🗑 Reset Discarded' },
        };
        Object.entries(_ibxSubTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });

        // [업무 배분 모달]
        const _ibxDistTexts = {
            'inbox-dist-task-label':   { ko:'전송 업무',                              en:'Task' },
            'inbox-dist-target-label': { ko:'대상',                                   en:'Target' },
            'inbox-dist-select-label': { ko:'삽입할 개발단계(L0) 구간을 선택하세요.', en:'Select a development stage (L0) to insert into.' },
            'inbox-dist-exec-label':   { ko:'🚀 전송 실행',                           en:'🚀 Send' },
            'inbox-dist-auto-label':   { ko:'🎯 다른 프로젝트 자동위치(시작일 기준)', en:'🎯 Auto-position in target project (by start date)' },
        };
        Object.entries(_ibxDistTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        // 💡 inbox-dist-title도 inbox-modal-title과 동일한 이유로 첫 텍스트 노드만 교체(ℹ️ 아이콘 보존)
        const _ibxDistTitle = document.getElementById('inbox-dist-title');
        if (_ibxDistTitle) _ibxDistTitle.childNodes[0].textContent = _en ? '📤 Send to Another Project' : '📤 다른 프로젝트로 전송';
        const _ibxDistHelpTip = document.getElementById('inbox-dist-help-tip-text');
        if (_ibxDistHelpTip) _ibxDistHelpTip.innerHTML = _en
            ? `Checks whether the target file was updated right before sending, and if another user just saved it, fetches the latest version and retries automatically.<br><br>
               Sending automatically sets a 📌 reminder and records the change in the target project's edit history and distribution ledger.`
            : `전송 직전 대상 파일의 갱신 여부를 확인하며, 다른 사용자가 방금 저장한 경우 최신본을 받아 자동 재시도합니다.<br><br>
               전송 시 📌 알림이 자동 설정되고, 대상 프로젝트의 수정이력과 배분 원장에 함께 기록됩니다.`;
        const _ibxDistCloseBtn = document.getElementById('inbox-dist-close-btn');
        if (_ibxDistCloseBtn) _ibxDistCloseBtn.title = _en ? 'Close' : '닫기';

        // [Elec Parts > PANEL 서브탭] 도움말 내용 (h2 타이틀은 밑줄탭 "PANEL" 라벨로 대체돼 별도 텍스트 노드 없음)
        const _pcHelpTip = document.getElementById('pc-help-tip');
        if (_pcHelpTip) _pcHelpTip.innerHTML = _en
            ? `📚 Panel specs are stored in a team-shared library — once a panel is extracted, any project can reuse it by model name.<br><br>
               🔗 If Summary "Key Materials" has a PANEL model registered, it's automatically added to the front of this comparison table.<br><br>
               🌐 Clicking a model name opens panelook.com search results (the exact detail-page ID can't be known in advance, so it links to search instead).`
            : `📚 패널 스펙은 팀 공용 라이브러리에 저장됩니다 — 한 번 추출한 패널은 다른 프로젝트에서도 모델명으로 바로 재사용됩니다.<br><br>
               🔗 Summary "주요 자재"의 PANEL 모델명이 등록되어 있으면 자동으로 이 비교표 맨 앞에 추가됩니다.<br><br>
               🌐 모델명을 클릭하면 panelook.com 검색결과로 이동합니다(정확한 상세페이지 ID는 알 수 없어 검색결과로 연결됩니다).`;
        // 지금 Elec Parts 탭의 PANEL 서브뷰가 열려있으면 표/토글버튼 문구도 바로 다시 그림
        const _pcTab = document.getElementById('tab-elecparts');
        if (_pcTab && _pcTab.classList.contains('active') && window._elecView === 'panel' && window.renderPanelCompareTab) window.renderPanelCompareTab();
        // 🐛 [2026-08-30 버그 수정] 위 PANEL 서브뷰만 다시 그려주고 있어서, CONVERTER/AD BOARD 서브뷰를
        // 보고 있는 중에 언어를 전환하면 "🔌 보기"/"핀맵 보기" 등 버튼 문구가 예전 언어 그대로 남아있는
        // 문제가 있었음 — 같은 방식으로 두 서브뷰도 다시 그려서 즉시 반영되게 한다.
        if (_pcTab && _pcTab.classList.contains('active') && (window._elecView === 'adbd' || window._elecView === 'convbd') && window.renderElecCompareTab) {
            window.renderElecCompareTab(window._elecView);
        }

        // [AI 팝업] AI 키 상태/가이드 텍스트 재적용
        if (window.onAiProviderChange) window.onAiProviderChange(window.getActiveAiProvider ? window.getActiveAiProvider() : 'gemini');

        // [캘린더 동기화 도움말] 팝업이 열려있으면 즉시 언어 반영
        if (window._calSyncHelpRender && document.getElementById('cal-sync-help-overlay') &&
            document.getElementById('cal-sync-help-overlay').style.display !== 'none') {
            window._calSyncHelpRender();
        }

        // [Weekly Report] 탭이 열려 있으면 재렌더 (섹션 제목 즉시 반영)
        if (window.showWeeklyReport) {
            const _wrTab = document.getElementById('tab-weekly');
            if (_wrTab && _wrTab.style.display !== 'none') window.showWeeklyReport();
        }

        // [알람 탭] 열려있으면 서버상태 포함 재렌더
        if (window.renderAlarmTab) {
            const _alTab = document.getElementById('tab-alarm');
            if (_alTab && _alTab.style.display !== 'none') window.renderAlarmTab();
        }

        if (globalData) { 
            renderTable(globalData);
            generateFilters(globalData);
            applyFilters();
            window.translateAllWbs(window._currentLang === 'en');
                    document.querySelectorAll('.filter-label').forEach(el => {
                const colName = el.dataset.colName;
                if (colName) el.textContent = LANG[window._currentLang].filterLabel[colName] || colName;
            });
            document.querySelectorAll('.btn-all').forEach(el => {
                el.textContent = LANG[window._currentLang].filterAll;
            });
        }

        // [Telegram 서버 상태 배지] 언어 전환 시 즉시 재조회하여 갱신 (연결됨/미설정/서버 미연결)
        if (window.refreshTgStatus) window.refreshTgStatus();

        // [메신저 수신자 안내문] Summary 매칭 인원수 표시된 경우 언어 갱신
        if (window._tgAutoMatchFromSummary) window._tgAutoMatchFromSummary();

        // [M.C Table / Brief SPEC / 주소록 등] "첫 행 추가" 버튼 등 정적 렌더링 항목 언어 전환 시 갱신
        if (window.populateTabData) window.populateTabData();

        // [업무 추가 팝업 - AI 분석결과 패널] 열려 있는 상태에서 언어 전환 시 갱신
        const _mrSection = document.getElementById('mail-result-section');
        if (_mrSection && _mrSection.style.display !== 'none' && window._mailAnalyzedResult && window.renderMailResult) {
            window.renderMailResult(window._mailAnalyzedResult);
        }
     };


    // 💡 오늘이 진행기간에 걸쳐있는(또는 가장 가까운 다음) 행을, 표 헤더 바로 아래로 스크롤해서 보여줌
    window.scrollToTodayRow = function() {
        try {
            const scrollBox = document.querySelector('#table-container > div');
            const tbody = document.getElementById('table-body');
            const thead = document.getElementById('table-head');
            if (!scrollBox || !tbody || !window.globalData) return;

            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayMs = today.getTime();

            let targetIdx = -1;
            // 1순위: 오늘이 시작일~완료일 사이에 걸쳐있는(진행 중인) 첫 번째 행
            for (let i = 1; i < globalData.length; i++) {
                const r = globalData[i];
                if (!r || !r._calcStartTs || !r._calcPlanTs) continue;
                if (r._calcStartTs <= todayMs && todayMs <= r._calcPlanTs) { targetIdx = i; break; }
            }
            // 2순위: 진행 중인 업무가 없으면, 오늘 이후 가장 가까운 시작일을 가진 행
            if (targetIdx === -1) {
                let bestTs = Infinity;
                for (let i = 1; i < globalData.length; i++) {
                    const r = globalData[i];
                    if (!r || !r._calcStartTs) continue;
                    if (r._calcStartTs >= todayMs && r._calcStartTs < bestTs) { bestTs = r._calcStartTs; targetIdx = i; }
                }
            }
            if (targetIdx === -1) return; // 해당하는 행이 없으면 맨 위 그대로 둠

            const targetTr = tbody.querySelector(`tr[data-row-index="${targetIdx}"]`);
            if (!targetTr) return;

            const boxRect = scrollBox.getBoundingClientRect();
            const trRect = targetTr.getBoundingClientRect();
            const headerH = thead ? thead.getBoundingClientRect().height : 0;
            const delta = trRect.top - boxRect.top - headerH;
            scrollBox.scrollTop += delta;
        } catch (e) { /* 스크롤 계산에 실패해도 화면 자체엔 영향 없도록 무시 */ }
    };

    function renderTable(data) {
        const thead = document.getElementById('table-head'); const tbody = document.getElementById('table-body');
        if(!data || data.length === 0) { thead.innerHTML = ''; tbody.innerHTML = ''; return; }
        
        // ✅ 추가: 레벨별 bold 한 곳에서 관리
        const getFontWeight = (level) => level === 0 ? 'bold' : 'normal';

        let hiddenCols = [colIdx.bogo, colIdx.assignee, colIdx.customer, colIdx.model, colIdx.inch, colIdx.dur1, colIdx.dur2, colIdx.dur3, colIdx.dur4, colIdx.devStage, colIdx.taskType1, colIdx.taskType2, colIdx.taskType3, colIdx.taskType4, colIdx.wbs, colIdx.answer];
        let hasPeriodCol = colIdx.period !== -1;

        let headHtml = '<tr>';
        data[0].forEach((cell, idx) => {
            if (hiddenCols.includes(idx)) return;
            let colName = cell ? cell.toString().replace(/\s+/g, '') : '';
            let thStyle = "text-align: center; white-space: nowrap; overflow: hidden; border-right: none;";
            let widthClass = ""; let thClass = ""; let colStr = colName.toLowerCase();

            if (idx === colIdx.period) return; // 💡 "소요일"은 완료~개발업무 사이에서 별도로 삽입하므로 원래 자리에서는 건너뜀
            if (colStr.includes("상태")) return; // 💡 "상태"는 소요일~개발업무 사이에서 별도로 삽입하므로 원래 자리에서는 건너뜀
            if (colStr.includes("현황")) { widthClass = "width: var(--w-chart); min-width: 180px; position: relative;"; thClass = "chart-th"; }
            else if (colStr.includes("내용") || colStr.includes("요청") || colStr.includes("답변") || colStr.includes("대응") || colStr.includes("상세")) { widthClass = "width: var(--w-detail); min-width: 150px;"; thClass = "detail-th"; }
            else if (["no", "view", "보고"].includes(colStr)) { widthClass = "width: var(--w-no); min-width: 45px; max-width: var(--w-no);"; }
            else if (colStr.includes("시작") || colStr.includes("완료")) { widthClass = "width: var(--w-date); min-width: 45px; max-width: var(--w-date);"; }
            else if (colStr.includes("상태")) { widthClass = "width: var(--w-status); min-width: 30px; max-width: var(--w-status);"; }
            else { widthClass = "width: var(--w-default); min-width: 30px; max-width: var(--w-default);"; }

            const lang = LANG[window._currentLang || 'ko'];
            const cellKey = (cell||'').toString().replace(/\s+/g,'').toLowerCase();
            const displayCell = lang.header[cellKey] || escapeHtml(cell);
            if (thClass === 'chart-th') {
                headHtml += `<th class="${thClass}" style="${thStyle} ${widthClass}" ondblclick="window.toggleChartExpand()" title="더블클릭: 차트 확장/기본 보기 전환">
                    <div class="chart-th-axis" style="position:relative; height:12px; overflow:visible; margin:0 20px; box-sizing:border-box;"></div>
                </th>`;
            } else if (thClass === 'detail-th') {
                headHtml += `<th class="${thClass}" style="${thStyle} ${widthClass} cursor:pointer;" title="클릭: 상세내용 전체 펼치기/접기" onclick="window.toggleAllDetailExpand(this, event)"><div style="display:inline-block; padding-right:2px; vertical-align: middle;">${displayCell} <span style="font-size:9px; color:#aaa;" id="detail-th-arrow">▼</span></div></th>`;
            } else {
                headHtml += `<th class="${thClass}" style="${thStyle} ${widthClass}"><div style="display:inline-block; padding-right:2px; vertical-align: middle;">${displayCell}</div></th>`;
            }
            if (idx === colIdx.plan) {
                const periodLabel = lang.header['소요일'] || '소요';
                const statusLabel = lang.header['상태'] || '상태';
                const wbsLabel = lang.header['개발업무(wbs)'] || '개발업무 (WBS)';
                const headerLockSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
                headHtml += `<th style="text-align: center; width: var(--w-period); min-width: 30px; max-width: var(--w-period); white-space: nowrap;">${periodLabel} <span onclick="window.wrToggleAllScheduleLock()" title="🔒 전체 업무 일정 고정 (클릭 시 현재 상태와 무관하게 항상 전체 잠금 · 완료일은 상위 업무엔 표시만 영향)" style="display:inline-flex; vertical-align:middle; cursor:pointer; color:#495057;">${headerLockSvg}</span></th>`;
                headHtml += `<th class="status-th" style="text-align: center; width: var(--w-status); min-width: 30px; max-width: var(--w-status);">${statusLabel}</th>`;
                headHtml += `<th style="text-align: center; width: var(--w-wbs); min-width: 100px; max-width: var(--w-wbs);">${wbsLabel}</th>`;
            }
        });
        headHtml += '</tr>'; thead.innerHTML = headHtml;
        if (window.updateChartHeaderAxis) window.updateChartHeaderAxis();

        let bodyHtml = '';
        let ganttZebraIdx = 0; // 💡 보이는 행 기준 줄무늬 카운터
        for(let i = 1; i < data.length; i++) {
            if (!data[i]) continue; let row = data[i];
            let trClass = row._level === 0 ? 'class="parent-row"' : (row._level === 1 ? 'class="sub-parent-row"' : (row._level === 2 ? 'class="sub-parent-row-2"' : (row._level === 3 ? 'class="sub-parent-row-3"' : 'class="sub-parent-row-4"')));
            if (ganttZebraIdx % 2 === 1) trClass = trClass.replace('class="', 'class="gantt-zebra-b ');
            ganttZebraIdx++;
            if (row._알림) trClass = trClass.replace('class="', 'class="alarm-on ');
            if (colIdx.status !== -1) {
                const _rawSt = (row[colIdx.status] || '').toString().trim();
                const _koMap = LANG['ko'].statusMap;
                const _koKey = Object.keys(_koMap).find(k => k.toLowerCase() === _rawSt.toLowerCase());
                // 항상 한글 기준값으로 정규화해서 판단 (드롭다운과 동일 기준)
                const _normSt = (_koKey ? _koMap[_koKey] : _rawSt);
                if (_normSt === '완료') {
                    trClass = trClass.replace('class="', 'class="status-done ');
                } else if (_normSt === '지연' || _normSt === '보류') {
                    trClass = trClass.replace('class="', 'class="status-delay ');
                } else if (_normSt === '대기') {
                    trClass = trClass.replace('class="', 'class="status-pending ');
                }
            }
            bodyHtml += `<tr data-row-index="${i}" ${trClass}>`;
            
            for(let cellIndex = 0; cellIndex < data[0].length; cellIndex++) {
                if (hiddenCols.includes(cellIndex)) continue; 
                let cell = (row[cellIndex] !== undefined && row[cellIndex] !== null) ? row[cellIndex] : "";
                let colName = data[0][cellIndex] ? data[0][cellIndex].toString().replace(/\s+/g, '') : ""; let colStr = colName.toLowerCase();
                
                let rawForEditing = cell.toString();
                if (cellIndex === colIdx.start && row._calcStartTs) rawForEditing = formatTsToYMD(row._calcStartTs);
                else if (cellIndex === colIdx.plan && row._calcPlanTs) rawForEditing = formatTsToYMD(row._calcPlanTs);
                
                let safeRawValue = encodeURIComponent(rawForEditing); let tdAttrs = ` data-raw="${safeRawValue}"`;
                
                let nonEditableCols = [colIdx.no, colIdx.chart];
                if (!nonEditableCols.includes(cellIndex) && !hiddenCols.includes(cellIndex)) {
                    const isDateCol = (cellIndex === colIdx.start || cellIndex === colIdx.plan);
                    const dateHint = isDateCol ? " · 날짜를 지우면 자동계산, 입력하면 고정되어 다른 행이 바뀌어도 안 움직임" : "";
                    const isDetailCol = (cellIndex === colIdx.content || cellIndex === colIdx.answer);
                    // 💡 [2026-08-24] 개별 셀 클릭 = 그 셀만 펼치기/접기(window.toggleDetailExpand), 헤더 클릭 = 전체 펼치기/접기
                    const detailHint = isDetailCol ? " · 클릭: 이 칸만 펼치기/접기 · 헤더 클릭: 전체 펼치기/접기 · Enter는 편집 완료, 줄바꿈은 Shift+Enter" : "";
                    const detailClickAttr = isDetailCol ? ` onclick="window.toggleDetailExpand(this, event, ${i}, ${cellIndex})"` : "";
                    tdAttrs += `${detailClickAttr} ondblclick="makeEditable(this)" onblur="blurCell(this, ${i}, ${cellIndex})" title="더블클릭하여 텍스트 수정 가능${dateHint}${detailHint}"`;
                }

                let tdStyle = ""; let tdHtml = '';
                
                if (cellIndex === colIdx.no) { 
                    tdAttrs += ` class="no-td"`;
                    const alarmOn = !!row._알림;
                    const alarmStyle = alarmOn
                        ? 'opacity:1; filter:grayscale(1) sepia(1) saturate(6) hue-rotate(180deg) brightness(0.9); transform:scale(1.3);'
                        : 'opacity:1; transform:scale(1.0);';
                    tdHtml = `
                        <div style="display:flex; align-items:center; justify-content:center; gap:3px; position:relative;">
                            <span onclick="window._wrPinClick(${i}, event)" ondblclick="window._wrPinDblClick(${i}, event)" title="${alarmOn ? '알림 켜짐 (클릭하여 끄기 · 더블클릭하면 알람 목록의 이 업무로 이동 · Ctrl/Shift+클릭 시 선택된 행 일괄 토글)' : '알림 꺼짐 (클릭하여 켜기 · Ctrl/Shift+클릭 시 선택된 행 일괄 토글)'}"
                                style="font-size:13px; cursor:pointer; flex-shrink:0; ${alarmStyle}">📌</span>
                            <span class="row-num-span"></span>
                        </div>`;
               } else if (colStr.includes("상세") || colStr.includes("내용") || colStr.includes("답변") || colStr.includes("대응") || colStr === "현황") {
                    tdStyle = "text-align: left; vertical-align: top; white-space: pre-wrap; word-break: break-all; font-size: 11px;";
                    if (colStr.includes("상세") || colStr.includes("내용") || colStr.includes("답변") || colStr.includes("대응")) {
                        // 💡 [2026-08-25 버그 수정] WBS 상하좌우+- 등으로 tbody가 통째로 다시 그려져도,
                        //    이 행에서 개별적으로 펼쳐뒀던 칸(row._expandedDetailCols)은 펼친 채로 그린다.
                        const _wasCellExpanded = !!(row._expandedDetailCols && row._expandedDetailCols[cellIndex]);
                        tdAttrs += ` class="detail-td${_wasCellExpanded ? ' detail-td-expanded' : ''}"`;
                    }
               } else if (colStr.includes("상태")) {
                    continue; // 💡 "상태"는 소요일~개발업무 사이에서 이미 렌더링했으므로 원래 자리에서는 건너뜀
                } else if (["시작", "완료", "기간", "view", "보고"].some(k => colStr.includes(k))) {
                    tdStyle = `text-align: center; white-space: nowrap; font-weight: ${row._level === 0 ? 'bold' : 'normal'}; font-size: calc(var(--table-font-size) - 2px);`;
                    tdAttrs += ` class="date-td"`;
                } else {
                    tdStyle = "text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
                }

                if (cellIndex !== colIdx.no) {
                    if (cellIndex === colIdx.start) { 
                        let tsArg = row._calcStartTs || new Date().getTime();
                        let displayDate = row._calcStartTs ? formatTableDate(row._calcStartTs) : "<span style='color:#ced4da; font-size:11px;'>+ Date</span>";
                        let startBadge = '';
                        const cmpInfoStart = window.getRowCompareInfo ? window.getRowCompareInfo(row) : null;
                        if (cmpInfoStart && cmpInfoStart.isNew) {
                            startBadge = `<span title="${escapeHtml(cmpInfoStart.aLabel)} 계획 저장 이후 새로 추가된 업무 — 비교할 계획 데이터가 없습니다" style="font-size:9px; color:#fff; background:#2f9e44; font-weight:bold; margin-left:2px; padding:0 3px; border-radius:3px;">🆕신규</span>`;
                        } else if (cmpInfoStart && cmpInfoStart.aStart && cmpInfoStart.bStart) {
                            const diffDays = workdayShift(cmpInfoStart.aStart, cmpInfoStart.bStart);
                            if (diffDays !== 0) {
                                const badgeColor = diffDays > 0 ? '#e03131' : '#1971c2';
                                const badgeTitle = cmpInfoStart.mode === 'vsPlan'
                                    ? `${escapeHtml(cmpInfoStart.aLabel)}(${formatTsToYMD(cmpInfoStart.aStart)}) 대비 ${escapeHtml(cmpInfoStart.bLabel)} 시작일 ${diffDays > 0 ? diffDays + '근무일 증가' : (-diffDays) + '근무일 단축'}`
                                    : `계획(${formatTsToYMD(cmpInfoStart.aStart)}) 대비 시작일 ${diffDays > 0 ? diffDays + '근무일 지연' : (-diffDays) + '근무일 단축'}`;
                                startBadge = `<span title="${badgeTitle}" style="font-size:inherit; color:${badgeColor}; font-weight:bold; margin-left:2px;">${diffDays > 0 ? '▲' : '▼'}${Math.abs(diffDays)}</span>`;
                            }
                        }
                        tdHtml = `<span class="date-clickable" onclick="showCalendar(this, ${tsArg}, ${i}, ${cellIndex}); const _rap=document.getElementById('row-action-popup'); if(_rap) {_rap.style.display='none'; window.clearRowHighlight();} event.stopPropagation();" title="클릭하여 달력으로 날짜 변경">${displayDate}</span>${startBadge}`;
                    } 
                    else if (cellIndex === colIdx.plan) { 
                        let tsArg = row._calcPlanTs || new Date().getTime();
                        let displayDate = row._calcPlanTs ? formatTableDate(row._calcPlanTs) : "<span style='color:#ced4da; font-size:11px;'>+ Date</span>";
                        let planBadge = '';
                        const cmpInfoFinish = window.getRowCompareInfo ? window.getRowCompareInfo(row) : null;
                        if (cmpInfoFinish && cmpInfoFinish.aEnd && cmpInfoFinish.bEnd) {
                            const diffDays = workdayShift(cmpInfoFinish.aEnd, cmpInfoFinish.bEnd);
                            if (diffDays !== 0) {
                                const badgeColor = diffDays > 0 ? '#e03131' : '#1971c2';
                                const badgeTitle = cmpInfoFinish.mode === 'vsPlan'
                                    ? `${escapeHtml(cmpInfoFinish.aLabel)}(${formatTsToYMD(cmpInfoFinish.aEnd)}) 대비 ${escapeHtml(cmpInfoFinish.bLabel)} 완료일 ${diffDays > 0 ? diffDays + '근무일 증가' : (-diffDays) + '근무일 단축'}`
                                    : `계획(${formatTsToYMD(cmpInfoFinish.aEnd)}) 대비 완료일 ${diffDays > 0 ? diffDays + '근무일 지연' : (-diffDays) + '근무일 단축'}`;
                                planBadge = `<span title="${badgeTitle}" style="font-size:inherit; color:${badgeColor}; font-weight:bold; margin-left:2px;">${diffDays > 0 ? '▲' : '▼'}${Math.abs(diffDays)}</span>`;
                            }
                        }
                        tdHtml = `<span class="date-clickable" onclick="showCalendar(this, ${tsArg}, ${i}, ${cellIndex}); const _rap=document.getElementById('row-action-popup'); if(_rap) {_rap.style.display='none'; window.clearRowHighlight();} event.stopPropagation();" title="클릭하여 달력으로 날짜 변경">${displayDate}</span>${planBadge}`;
                        bodyHtml += `<td style="${tdStyle}"${tdAttrs}>${tdHtml}</td>`;
                        {
                            // 💡 "소요일" — 엑셀에 실제 기간 열이 있든 없든 항상 완료 다음, 개발업무(WBS) 앞에 표시
                            let calcDays = countWorkingDays(row._calcStartTs, row._calcPlanTs);
                            const periodEditable = colIdx.period !== -1;
                            const periodAttrs = periodEditable
                                ? ` data-raw="${encodeURIComponent(String(calcDays))}" ondblclick="makeEditable(this)" onblur="blurCell(this, ${i}, ${colIdx.period})"`
                                : '';
                            const isLocked = !!(row._startForced && row._planForced);
                            const lockSvg = isLocked
                                ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>'
                                : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.75-1.5"></path></svg>';
                            const lockIcon = `<span onclick="window.wrToggleScheduleLock(${i}, event); event.stopPropagation();" title="${isLocked ? '🔒 고정 (클릭하여 자동으로 전환 · Ctrl/Shift+클릭 시 선택된 행 일괄 적용)' : '🔓 자동 (클릭하여 고정으로 전환 · Ctrl/Shift+클릭 시 선택된 행 일괄 적용)'}" style="display:inline-flex; cursor:pointer; margin-left:3px; vertical-align:middle; color:${isLocked ? '#333' : '#adb5bd'};">${lockSvg}</span>`;
                            let baselineBadge = '';
                            const cmpInfoDur = window.getRowCompareInfo ? window.getRowCompareInfo(row) : null;
                            if (cmpInfoDur && cmpInfoDur.aStart && cmpInfoDur.aEnd && cmpInfoDur.bStart && cmpInfoDur.bEnd) {
                                const aDur = countWorkingDays(cmpInfoDur.aStart, cmpInfoDur.aEnd);
                                const bDur = countWorkingDays(cmpInfoDur.bStart, cmpInfoDur.bEnd);
                                const diffDur = bDur - aDur;
                                if (diffDur !== 0) {
                                    const badgeColor = diffDur > 0 ? '#e03131' : '#1971c2';
                                    const badgeTitle = cmpInfoDur.mode === 'vsPlan'
                                        ? `${escapeHtml(cmpInfoDur.aLabel)}(${formatTsToYMD(cmpInfoDur.aStart)}~${formatTsToYMD(cmpInfoDur.aEnd)}) 대비 ${escapeHtml(cmpInfoDur.bLabel)} 소요일 ${diffDur > 0 ? diffDur + '일 증가' : (-diffDur) + '일 감소'}`
                                        : `계획(${formatTsToYMD(cmpInfoDur.aStart)}~${formatTsToYMD(cmpInfoDur.aEnd)}) 대비 소요일 ${diffDur > 0 ? diffDur + '일 증가' : (-diffDur) + '일 감소'}`;
                                    baselineBadge = `<span title="${badgeTitle}" style="font-size:inherit; color:${badgeColor}; font-weight:bold; margin-left:2px;">${diffDur > 0 ? '▲' : '▼'}${Math.abs(diffDur)}</span>`;
                                }
                            }
                            bodyHtml += `<td class="period-td"${periodAttrs} style="text-align: center; font-weight: ${getFontWeight(row._level)}; color: #e03131; white-space: nowrap; font-size: calc(var(--table-font-size) - 2px);" title="${periodEditable ? '더블클릭하여 소요일 직접 수정 (자동 상태 행은 완료일이 시작일+소요일로 재계산됩니다)' : ''}">${calcDays}${lockIcon}${baselineBadge}</td>`;
                        }
                        if (colIdx.status !== -1) {
                            // 💡 "상태" — 소요일 다음, 개발업무(WBS) 앞에 표시
                            const statusRaw = (row[colIdx.status] !== undefined && row[colIdx.status] !== null) ? row[colIdx.status].toString().trim() : '';
                            const lang = LANG[window._currentLang||'ko'];
                            // 대소문자 무시로 statusMap 조회 (엑셀 저장값이 소문자인 경우도 대응)
                            const _smKeys = Object.keys(lang.statusMap);
                            const _smMatch = _smKeys.find(k => k.toLowerCase() === statusRaw.toLowerCase());
                            const statusVal = (_smMatch ? lang.statusMap[_smMatch] : null) || statusRaw;
                            const statusSelectHtml = `<select onchange=\"window.updateStatus(this, ${i}, ${colIdx.status})\"
                                ondblclick=\"window.setStatusDone(this, ${i}, ${colIdx.status})\"
                                style=\"border:none; background:transparent; font-size:var(--table-font-size); font-weight:${row._level === 0 ? 'bold' : 'normal'}; color:inherit; white-space:nowrap;
                                       -webkit-appearance:none; -moz-appearance:none; appearance:none;\">
                                ${lang.status.map((s, idx) => {
                                    const optColor = ['', 'rgba(0,0,0,0.45)', '#f08c00', '#e03131'][idx] || '';
                                    const colorAttr = optColor ? ` style=\"color:${optColor};\"` : '';
                                    return `<option value=\"${s}\" ${statusVal===s?'selected':''}${colorAttr}>${s}</option>`;
                                }).join('')}
                            </select>`;
                            bodyHtml += `<td class="status-td" data-raw="${encodeURIComponent(statusVal)}" style="text-align: center; white-space: nowrap; font-weight: ${row._level === 0 ? 'bold' : 'normal'};">${statusSelectHtml}</td>`;
                        }
                        let taskTxt = "";
                        if (row._level === 0) taskTxt = row._origDev; else if (row._level === 1) taskTxt = row._origT1; else if (row._level === 2) taskTxt = row._origT2; else if (row._level === 3) taskTxt = row._origT3; else if (row._level === 4) taskTxt = row._origT4;
                        if (taskTxt === undefined || taskTxt === null) taskTxt = "";
                        // 💡 [2026-08-28 신규] WBS 접기/펴기 화살표 — 바로 다음 행이 이 행보다 레벨이 깊으면(=자식이
                        //    있으면) 화살표를 붙인다. 리프(자식 없는) 행은 자리만 맞추는 빈 칸을 넣어 정렬 유지.
                        //    "업무 상세내용" 헤더의 전체 펼치기 화살표(#detail-th-arrow)와 같은 스타일(흐린 회색,
                        //    ▶/▼ 삼각형)을 재사용. 실제 숨기고 보이기는 applyFilters()가 row._wbsCollapsed를
                        //    보고 처리한다(필터와 동시에 적용돼도 서로 안 꼬이도록 한 곳에서 같이 판정).
                        const _wbsHasChildren = (i + 1 < globalData.length) && globalData[i + 1] && ((globalData[i + 1]._level || 0) > (row._level || 0));
                        const wbsToggleHtml = _wbsHasChildren
                            ? `<span class="wbs-toggle-arrow" onclick="window.toggleWbsCollapse(${i}, event);" title="${row._wbsCollapsed ? (window._currentLang === 'en' ? 'Expand' : '펼치기') : (window._currentLang === 'en' ? 'Collapse' : '접기')}" style="display:inline-block; width:11px; text-align:center; cursor:pointer; color:#aaa; font-size:9px; vertical-align:middle; user-select:none;">${row._wbsCollapsed ? '▶' : '▼'}</span>`
                            : `<span style="display:inline-block; width:11px;"></span>`;
                        // 💡 [2026-08-28 신규 → 뒤쪽 배치 → 드롭다운으로 변경] 담당구분(PM/ME/HW/...) 선택 배지 —
                        //    업무명 "뒤"에 작은 드롭다운(select)으로 붙여서 목록에서 바로 골라 지정한다(기존엔
                        //    클릭할 때마다 다음 구분으로 순환하는 방식이었음 → window.setWbsDiscipline 참고).
                        //    값이 없으면 AI 분석 업무의 상세내용 [담당구분]... 태그에서 초기값을 가져온다.
                        // 💡 [2026-08-28 버그 수정] row._담당구분에 AI 원본 명칭("영업" 등)이 별칭 변환 없이
                        //    그대로 저장돼 있던 과거/현재 데이터도 여기서 한 번 더 정규화해서, 드롭다운에
                        //    "SAL"과 "영업"이 별개 값처럼 중복 표시되지 않게 한다(_normalizeWbsDiscipline 참고).
                        const _wbsDiscipline = window._normalizeWbsDiscipline(row._담당구분) || window._extractDisciplineFromContent(row) || 'ETC';
                        const _wbsDisciplineOpts = window.WBS_DISCIPLINE_CATEGORIES.map(c => `<option value="${c}" ${c === _wbsDiscipline ? 'selected' : ''}>${c}</option>`).join('')
                            + (window.WBS_DISCIPLINE_CATEGORIES.indexOf(_wbsDiscipline) === -1 ? `<option value="${_wbsDiscipline}" selected>${_wbsDiscipline}</option>` : '');
                        const wbsDisciplineBadge = `<select class="wbs-discipline-badge" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onchange="window.setWbsDiscipline(${i}, this.value); event.stopPropagation();" title="${window._currentLang === 'en' ? 'Select discipline' : '담당구분 선택'}" style="display:inline-block; font-size:9px; color:#868e96; background:#f1f3f5; border:none; border-radius:3px; padding:0 1px; margin-left:4px; cursor:pointer; vertical-align:middle; white-space:nowrap;">${_wbsDisciplineOpts}</select>`;
                        let prefix = wbsToggleHtml + (row._level > 0
                            ? `<span style="font-size:9px; color:#999; margin-right:1px;">${row._level}</span>` + (row._isLastChild ? '└ ' : '├ ')
                            : '');
                        let indentEm = (row._level || 0) * 1.2;
                        let wbsStyle = `text-align: left; padding-left: calc(${indentEm}em + 5px) !important; font-weight: ${row._level === 0 ? 'bold' : 'normal'}; color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
                        let wbsColIdx = (row._level === 0) ? colIdx.devStage : (row._level === 1 ? colIdx.taskType1 : (row._level === 2 ? colIdx.taskType2 : (row._level === 3 ? colIdx.taskType3 : colIdx.taskType4)));
                        if (wbsColIdx === -1 && colIdx.wbs !== -1) wbsColIdx = colIdx.wbs; // 💡 단일 "개발업무(WBS)" 열 모드 대응
                        let wbsRawValue = encodeURIComponent(taskTxt);
                        let wbsAttrs = wbsColIdx !== -1 ? ` data-raw="${wbsRawValue}" onclick="window.onRowNoClick(this, ${i}, event); if(document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display='none'; event.stopPropagation();" ondblclick="makeEditable(this)" onblur="blurCell(this, ${i}, ${wbsColIdx})" title="클릭: 메뉴 / Ctrl·Shift 클릭: 여러 행 선택 / 더블클릭하여 수정 가능&#10;&#10;* 표시: 다른 업무와 병렬로 진행되는 업무"` : ``;

                        let hasKorWbs = /[가-힣]/.test(taskTxt); let hasEngWbs = /[a-zA-Z]/.test(taskTxt);
                        let transModeWbs = hasKorWbs ? 1 : (hasEngWbs ? 2 : 0);
                        let wbsInnerHtml;
                        if (transModeWbs > 0 && taskTxt.trim() !== '') {
                            let safeTextWbs = encodeURIComponent(taskTxt).replace(/'/g, "%27").replace(/\\/g, "\\\\");
                            wbsInnerHtml = prefix + '<span class="trans-btn-hide-print" data-trans-mode="' + transModeWbs + '" style="display:inline-block; cursor:pointer; font-size:8px; border-radius:3px; padding:1px 2px; margin-right:3px; background:transparent; vertical-align:middle;" onclick="toggleTranslationWbs(this, \'' + safeTextWbs + '\', ' + transModeWbs + '); event.stopPropagation();">🌐</span><span class="content-span">' + escapeHtml(taskTxt) + '</span>' + wbsDisciplineBadge;
                        } else {
                            wbsInnerHtml = prefix + escapeHtml(taskTxt) + wbsDisciplineBadge;
                        }
                        bodyHtml += `<td class="wbs-cell" style="${wbsStyle}"${wbsAttrs}>${wbsInnerHtml}</td>`;
                        continue; 
                    } 
                    else if (cellIndex === colIdx.period) {
                        continue; // 💡 "소요일"은 완료~개발업무 사이에서 이미 렌더링했으므로 원래 자리에서는 건너뜀
                    }
                    else if (cellIndex === colIdx.content || cellIndex === colIdx.answer) {
                        let cellText = cell.toString().trim(); let hasKor = /[가-힣]/.test(cellText); let hasEng = /[a-zA-Z]/.test(cellText); let transMode = 0; 
                        if (hasKor) transMode = 1; else if (hasEng) transMode = 2; 

                        let isStrike = (cellIndex === colIdx.content && row._isStrikeContent) || (cellIndex === colIdx.answer && row._isStrikeAnswer);
                        if (!isStrike && (cellText.includes('[취소]') || cellText.includes('(취소)') || cellText.includes('[Drop]') || cellText.includes('(Drop)'))) isStrike = true;
                        if (isStrike) tdStyle += " text-decoration: line-through; color: #adb5bd;";

                        // 💡 [2026-08-27] "업무 상세내용"(colIdx.content)만 [대괄호] Bold 처리 끔 — 답변(colIdx.answer)은 그대로 유지.
                        let boldBrackets = cellIndex !== colIdx.content;
                        if (transMode > 0) {
                            let safeText = encodeURIComponent(cellText).replace(/'/g, "%27").replace(/\\/g, "\\\\");
                            let displayHtml = linkifyAndEscape(cellText, boldBrackets);
                            if (cellIndex === colIdx.content) displayHtml = injectMailRawBtn(displayHtml, row, i);
                            tdStyle += " position: relative; padding-left: 22px;";
                            // 💡 [2026-08-28 버그 수정] 개별 셀 펼침(row._expandedDetailCols → 위에서 이미 tdAttrs에
                            //    'detail-td-expanded' 클래스로 반영해둠)이 있어도, 여기서 class 속성을 통째로
                            //    갈아끼우면서 그 클래스가 조용히 사라졌다 — 한글/영문이 섞인 대부분의 실제
                            //    상세내용은 항상 이 분기(transMode>0)를 타므로, WBS 상하좌우/+-/삭제 등으로
                            //    renderTable()이 다시 그려질 때마다 개별로 펼쳐뒀던 칸이 매번 접혀 보였다.
                            const _hadExpandedClass = / class="[^"]*\bdetail-td-expanded\b[^"]*"/.test(tdAttrs);
                            tdAttrs = tdAttrs.replace(/ class="[^"]*"/, '') + ` class="detail-td content-cell-trans${_hadExpandedClass ? ' detail-td-expanded' : ''}"`;
                            tdHtml = '<span class="content-span" style="display: block;">' + displayHtml + '</span><span class="trans-btn-hide-print" style="position: absolute; top: 3.6px; left: 2px; cursor: pointer; font-size: 8px; border-radius:3px; padding:2px 2px; z-index: 1; background:transparent;" onclick="toggleTranslation(this, \'' + safeText + '\', ' + transMode + ', ' + boldBrackets + '); event.stopPropagation();">🌐</span>';                        } else { tdHtml = linkifyAndEscape(cellText, boldBrackets); if (cellIndex === colIdx.content) tdHtml = injectMailRawBtn(tdHtml, row, i); }
                    } 
                    // 교체
                    else if (cellIndex === colIdx.chart) { 
                        tdHtml = createStatusChart(row._calcStartTs, row._calcPlanTs, row[colIdx.status], row._level, window.getRowCompareInfo ? window.getRowCompareInfo(row) : null);
                        tdStyle = `font-weight: ${getFontWeight(row._level)}; position:relative;`;
                        tdAttrs += ` class="chart-td" ondblclick="window.toggleChartExpand()" title="더블클릭: 차트 확장/기본 보기 전환"`;
                    }

                    else { tdHtml = linkifyAndEscape(cell.toString().trim()); }
                }

                bodyHtml += `<td style="${tdStyle}"${tdAttrs}>${(cellIndex === colIdx.content || cellIndex === colIdx.answer) ? '<div class="detail-td-inner">' + tdHtml + '</div>' : tdHtml}</td>`;
            }
            bodyHtml += `</tr>`;
        }
        
        tbody.innerHTML = bodyHtml; initColumnResizers(); if (window.paintRowSelection) window.paintRowSelection();

        // 💡 [버그 수정] "상세내용 헤더 클릭 → 전체 펼치기"는 DOM class(detail-td-expanded)로만 표시돼서,
        //    WBS 상하좌우/+-/삭제 등 다른 액션이 renderTable()을 다시 부르며 thead/tbody를 통째로 새로
        //    그릴 때마다(바로 위 tbody.innerHTML 대입, 헤더도 위에서 매번 새로 그려짐) 상태가 사라져
        //    매번 다시 헤더를 클릭해야 했다. 전체 펼치기 여부를 window._allDetailExpanded에 별도로
        //    저장해두고, 렌더링될 때마다 여기서 다시 적용해 재렌더링을 넘나들며 유지되게 한다.
        if (window._allDetailExpanded) {
            document.querySelectorAll('td.detail-td').forEach(el => el.classList.add('detail-td-expanded'));
            const arrowEl = document.getElementById('detail-th-arrow');
            if (arrowEl) arrowEl.textContent = '▲';
        }

        // 💡 페이지를 새로고침한 뒤 최초 1회만 "오늘" 행으로 스크롤 (편집/필터 등으로 인한 재렌더링 시엔 스크롤 위치를 건드리지 않음)
        if (!window._didInitialScrollToToday && data && data.length > 1) {
            window._didInitialScrollToToday = true;
            setTimeout(window.scrollToTodayRow, 50);
        }
    }

    // 💡 [공용] 0레벨 업무 목록({name, startTs})에서 PROTO/ES/PP 9개 마일스톤 날짜를 계산.
    //    실적(현재 Gantt 기준)과 계획(최초 킥오프 baseline 기준) 양쪽에서 동일한 규칙으로 재사용.
    function deriveMilestoneDatesFromLevel0(level0Rows) {
        if (!level0Rows || level0Rows.length === 0) return null;
        const findByName = function(name) {
            return level0Rows.find(r => r.name === name) || level0Rows.find(r => r.name.includes(name));
        };
        const firstStart = level0Rows.reduce((min, r) => (r.startTs < min ? r.startTs : min), level0Rows[0].startTs);
        const protoDR = findByName('PROTO DR');
        const dvr = findByName('DVR');
        const pra = findByName('PRA');
        if (!protoDR || !dvr || !pra) {
            return { error: true, missing: [!protoDR && 'PROTO DR', !dvr && 'DVR', !pra && 'PRA'].filter(Boolean) };
        }

        const DAY = 86400000;
        const addDays = function(ts, days) { return ts + days * DAY; };
        const addMonths = function(ts, months) { const d = new Date(ts); d.setMonth(d.getMonth() + months); return d.getTime(); };

        return {
            '기획Start': firstStart,
            '기획Finish': addDays(protoDR.startTs, -14),
            'ProtoDR': protoDR.startTs,
            'ESStart': addDays(protoDR.startTs, 14),
            'ESEnd': addDays(dvr.startTs, -14),
            'DVR': dvr.startTs,
            'PPStart': addDays(dvr.startTs, 14),
            'PPEnd': addMonths(pra.startTs, -1),
            'PRA': pra.startTs,
        };
    }

    // 💡 Summary "실적" 표를 Gantt 0레벨 업무(시작일 기준)와 연동.
    //    🆕 저장된 "최초 계획(킥오프)" baseline이 있으면, 같은 방식으로 "계획" 행도 함께 되살려 채운다 —
    //    그래야 이 표에서 계획 대비 실적을 바로 비교할 수 있다(계획 행이 그동안 비어있거나 최초 PROTO
    //    Start 한 칸만 있고 나머지 8칸은 안 채워져 있던 문제를 여기서 함께 해결).
    window.syncSummaryActualsFromGantt = function() {
        if (!globalData || globalData.length < 2) { alert('Gantt 데이터가 없습니다.'); return; }
        const level0Rows = [];
        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i];
            if (row && row._level === 0 && row._calcStartTs) {
                level0Rows.push({ name: (row._origDev || '').toString().trim(), startTs: row._calcStartTs });
            }
        }
        if (level0Rows.length === 0) { alert('시작일이 있는 0레벨 업무를 찾을 수 없습니다.'); return; }

        const result = deriveMilestoneDatesFromLevel0(level0Rows);
        if (!result || result.error) {
            alert('0레벨 업무 중 "' + (result ? result.missing.join('", "') : '') + '"을(를) 찾을 수 없습니다. 업무명을 확인해주세요.');
            return;
        }

        Object.keys(result).forEach(function(stage) {
            const inp = document.querySelector('#sum-milestone-body-actual input[data-stage="' + stage + '"]');
            if (inp) inp.value = formatTsToYMD(result[stage]);
        });

        // 🆕 계획(Plan) 행 — "최초 계획(킥오프)"이 저장되어 있으면 동일한 규칙으로 계산해 함께 반영
        let planSynced = false;
        const kickoffBl = window._getInitialKickoffBaseline ? window._getInitialKickoffBaseline() : null;
        if (kickoffBl) {
            const blLevel0Rows = window._level0RowsFromBaseline ? window._level0RowsFromBaseline(kickoffBl) : [];
            const planResult = deriveMilestoneDatesFromLevel0(blLevel0Rows);
            if (planResult && !planResult.error) {
                Object.keys(planResult).forEach(function(stage) {
                    const inp = document.querySelector('#sum-milestone-body input[data-stage="' + stage + '"]');
                    if (inp) inp.value = formatTsToYMD(planResult[stage]);
                });
                planSynced = true;
            }
        }

        if (window.collectTabData) window.collectTabData();
        if (window._checkAllRequiredFields) window._checkAllRequiredFields();
        alert('Gantt 0레벨 업무 기준으로 실적 일정이 반영되었습니다.' + (planSynced
            ? '\n(저장된 "최초 계획(킥오프)" 기준으로 계획 일정도 함께 반영했습니다)'
            : '\n(저장된 "최초 계획(킥오프)"이 없어 계획 일정은 그대로 두었습니다 — 신규 프로젝트 등록 시에만 자동 저장됩니다)'));
    };

    function toggleTranslation(btn, encodedText, transMode, boldBrackets) {
        if (boldBrackets === undefined) boldBrackets = true; // 💡 기존 호출부(인자 3개)와의 하위호환
        let container = btn.parentElement; let contentSpan = container.querySelector('.content-span');
        if (btn.dataset.expanded === "true") { contentSpan.innerHTML = contentSpan.dataset.origHtml; btn.dataset.expanded = "false"; btn.style.backgroundColor = "transparent"; return; }
        if (contentSpan.dataset.transHtml) { contentSpan.innerHTML = contentSpan.dataset.transHtml; btn.dataset.expanded = "true"; btn.style.backgroundColor = "rgba(0,0,0,0.05)"; return; }
        btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5';
        let text = decodeURIComponent(encodedText); let targetLang = transMode === 1 ? 'en' : 'ko'; let labelPrefix = transMode === 1 ? 'ENG' : '한글';
        let urls = [];
        let placeholderText = text.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gim, function(match) { urls.push(match); return ` ZXZX${urls.length - 1}ZXZX `; });
        placeholderText = placeholderText.replace(/(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim, function(match) { urls.push(match); return ` ZXZX${urls.length - 1}ZXZX `; });
        placeholderText = placeholderText.replace(/(^|[^\/a-zA-Z0-9])(www\.[\S]+(\b|$))/gim, function(match, p1, p2) { urls.push(p2); return p1 + ` ZXZX${urls.length - 1}ZXZX `; });

        fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(placeholderText)}`)
        .then(res => res.json())
        .then(tData => {
            let translated = ''; tData[0].forEach(item => translated += item[0]);
            urls.forEach((url, idx) => { let rx = new RegExp(`\\s*ZXZX${idx}ZXZX\\s*`, 'gi'); translated = translated.replace(rx, ' ' + url + ' '); });
            let transDisplayHtml = linkifyAndEscape(translated.trim(), boldBrackets);
            let cleanOrigHtml = contentSpan.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)+$/gi, ' ').trim();
            let finalHtml = cleanOrigHtml + '<br><span class="trans-result" style="color: var(--trans-text) !important; font-weight: normal;">' + transDisplayHtml + '</span>';
            contentSpan.dataset.origHtml = cleanOrigHtml; contentSpan.dataset.transHtml = finalHtml; contentSpan.innerHTML = finalHtml;
            btn.dataset.expanded = "true"; btn.style.backgroundColor = "rgba(0,0,0,0.05)"; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
        }).catch(err => { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; alert("번역 중 오류가 발생했습니다."); });
    }

    // 💡 WBS 업무명은 상세내용/답변과 달리 "교체" 방식 — 원문 ↔ 번역문 한 줄 토글
    function toggleTranslationWbs(btn, encodedText, transMode) {
        let contentSpan = btn.nextElementSibling;
        if (btn.dataset.expanded === "true") {
            contentSpan.textContent = decodeURIComponent(encodedText);
            btn.dataset.expanded = "false"; btn.style.backgroundColor = "transparent";
            return;
        }
        btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5';
        let text = decodeURIComponent(encodedText); let targetLang = transMode === 1 ? 'en' : 'ko';
        fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`)
        .then(res => res.json())
        .then(tData => {
            let translated = ''; tData[0].forEach(item => translated += item[0]);
            contentSpan.textContent = translated.trim();
            btn.dataset.expanded = "true"; btn.style.backgroundColor = "rgba(0,0,0,0.05)"; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
        }).catch(err => { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; alert("번역 중 오류가 발생했습니다."); });
    }

    // forceExpand: true → 한글 업무명 전체 번역 표시 / false → 전체 원복
    window.translateAllWbs = function(forceExpand) {
        const btns = Array.from(document.querySelectorAll('#myTable td.wbs-cell .trans-btn-hide-print'))
            .filter(function(b) { return b.dataset.transMode === '1'; }); // 한글 → 영문 대상만
        btns.forEach(function(btn) {
            const isExpanded = btn.dataset.expanded === 'true';
            if (forceExpand && !isExpanded) btn.click();
            else if (!forceExpand && isExpanded) btn.click();
        });
    };

    function initColumnResizers() {
        const table = document.getElementById('myTable'); const thElements = document.querySelectorAll('th');
        thElements.forEach(th => {
            if (th.querySelector('.resizer')) return;
            const resizer = document.createElement('div'); resizer.className = 'resizer'; th.appendChild(resizer);
            let startX, startWidth, startTableWidth;
            resizer.addEventListener('mousedown', function(e) {
                e.preventDefault(); startX = e.clientX; startWidth = th.offsetWidth; startTableWidth = table.offsetWidth;
                // 💡 [수정] 드래그 대상이 아닌 열은 절대 건드리지 않음 — max-width로 고정된 열까지 스냅샷되어
                //    줌/리사이즈 이후 값이 영구적으로 어긋나는 문제를 방지 (상세내용/현황 열만 실제로 유동적)
                if (!th.classList.contains('detail-th') && !th.classList.contains('chart-th')) {
                    // 고정 열은 이미 CSS로 고정되어 있으므로 스냅샷 자체가 불필요
                } 
                table.style.width = startTableWidth + 'px'; resizer.classList.add('resizing');
                const mouseMoveHandler = function(e) {
                    const diff = e.clientX - startX; const newWidth = startWidth + diff;
                    if (newWidth > 20) { th.style.width = `${newWidth}px`; table.style.width = `${startTableWidth + diff}px`; }
                };
                const mouseUpHandler = function() { resizer.classList.remove('resizing'); document.removeEventListener('mousemove', mouseMoveHandler); document.removeEventListener('mouseup', mouseUpHandler); };
                document.addEventListener('mousemove', mouseMoveHandler); document.addEventListener('mouseup', mouseUpHandler);
            });
        });
    }

    // =========================================================
    // 🎛️ 필터 적용 및 파일명 동적 조립 함수 (누락 복원 및 버그 완벽 수정)
    // =========================================================
    // 💡 담당자/고객/모델/인치 — 더 이상 엑셀 행에서 읽지 않고 Summary(프로젝트 정보) 값을 그대로 사용
    window.getSummaryAssignee = function() { return ((window.projectMeta || {}).프로젝트담당자 || '').trim(); };
    window.getSummaryCustomer = function() { return ((window.projectMeta || {}).고객사 || '').trim(); };
    window.getSummaryModel    = function() { return ((window.projectMeta || {}).고객모델명 || '').trim(); };
    // 💡 인치: KTK 모델명(">" 오른쪽)의 4,5,6번째 글자를 가져와 "320" → "32.0" 형식으로 변환
    window.getSummaryInch = function() {
        const raw = String((window.projectMeta || {}).KTK모델명 || '');
        const afterGt = raw.indexOf('>') !== -1 ? raw.slice(raw.indexOf('>') + 1) : raw;
        const digits = afterGt.slice(3, 6);
        if (digits.length < 2) return '';
        return digits.slice(0, -1) + '.' + digits.slice(-1);
    };

    // 💡 저장(=파일 생성) 전 필수 검증: 파일명 조립에 쓰이는 Summary 항목이 비어 있으면
    //    "All_All_All" 같은 의미 없는 파일명으로 저장되는 것을 막는다.
    window.validateRequiredProjectInfo = function() {
        const pm = window.projectMeta || {};
        const missing = [];
        if (!String(pm.고객사 || '').trim()) missing.push('고객사');
        if (!String(pm.고객모델명 || '').trim()) missing.push('고객 모델명');
        if (!String(pm.KTK모델명 || '').trim()) missing.push('KTK PN_모델명');
        if (!String(pm.프로젝트담당자 || '').trim()) missing.push('프로젝트 담당자');
        // 💡 [버그 수정] PROTO Start는 "새 프로젝트를 처음 등록할 때"만 필수여야 하는데, 모든 저장에
        //    걸리게 해뒀더니 — 이미 등록된 기존 프로젝트(PROTO Start를 입력한 적 없는 대부분의 과거
        //    프로젝트 포함)들까지 저장이 막혀버렸다("프로젝트 열기"가 전환 전 자동저장을 시도하다 여기
        //    걸려서 프로젝트 목록조차 못 여는 것처럼 보이는 문제로 이어짐). 드라이브에 아직 파일이 없는
        //    (=currentDriveFileId가 없는) 진짜 신규 등록 때만 요구하도록 범위를 좁힌다.
        //    💡 [추가 수정] 그것만으론 부족했다 — PROTO Start는 "Gantt 일정에 앵커로 쓰일 때"만 의미가
        //    있는데, 아직 Gantt WBS를 하나도 안 불러온 채(Summary만 먼저 채우는 흔한 순서) 저장하려 하면
        //    앵커로 쓸 일정 자체가 없는데도 요구하고 있었다. 실제로 앵커링할 Gantt 데이터
        //    (globalData.length > 1)가 있을 때만 요구하도록 조건을 하나 더 좁힌다.
        if (!window.currentDriveFileId && globalData && globalData.length > 1) {
            const protoStartMs = (((window.tabData || {}).summary || {}).milestones || {})['기획Start'];
            if (!protoStartMs || !String(protoStartMs.date || '').trim()) missing.push('PROTO Start (첫 표 "계획" 행의 시작일 · 프로젝트 시작일 — Gantt 데이터가 있는 신규 프로젝트만 필수)');
        }
        if (missing.length === 0) return '';
        // 💡 [UX] 빈 줄을 줄여 한눈에 들어오게 — 예전엔 문단마다 \n\n이 들어가 모달이 불필요하게 길었다.
        return '⚠️ 필수 정보가 비어 있어 저장할 수 없습니다.\n(Summary 탭에서 입력 · 파일명 생성과 일정 자동계산에 필요)\n\n· ' + missing.join('\n· ');
    };

    // 💡 필수 항목(고객사/고객모델명/KTK PN_모델명/프로젝트담당자, 신규 프로젝트는 PROTO Start도) 빈 값이면 시각적 하이라이트
    window._checkRequiredField = function(el) {
        if (!el) return;
        if (String(el.value || '').trim()) el.classList.remove('req-missing');
        else el.classList.add('req-missing');
    };
    window._checkAllRequiredFields = function() {
        ['sum-customer', 'sum-customer-model', 'sum-ktk-pn-model', 'sum-pm'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) window._checkRequiredField(el);
        });
        // 💡 PROTO Start는 신규 프로젝트(아직 드라이브에 없는 파일) 등록 시에만 필수 — 이미 등록된
        //    기존 프로젝트를 열었을 때는 빨간 경고를 띄우지 않는다 (validateRequiredProjectInfo와 동일 기준)
        const protoEl = document.getElementById('sum-ms-plan-protostart');
        if (protoEl) {
            if (window.currentDriveFileId) protoEl.classList.remove('req-missing');
            else window._checkRequiredField(protoEl);
        }
    };

    window.updatePrintTitle = function() {
        try {
            // 💡 더 이상 엑셀 행/필터에서 찾지 않고, Summary(프로젝트 정보)에 입력된 값을 그대로 사용
            let customer = window.getSummaryCustomer() || "All";
            let model = window.getSummaryModel() || "All";
            let inch = window.getSummaryInch();
            // 💡 담당자 이름은 화면 표시/파일명(xlsx·json·드라이브 저장·주간보고서 전부 공용) 어디에도 넣지 않음

            const infoStr = inch ? `${customer}_${model}_${inch}` : `${customer}_${model}`; 
            const safeInfoStr = infoStr.replace(/\s*>\s*/g, '_').replace(/[\x00-\x1F\x7F"*/:<>?\\|]/g, ''); 
            
            const tableInfoTextElem = document.getElementById('table-info-text'); 
            if (tableInfoTextElem) { tableInfoTextElem.textContent = infoStr.replace(/_/g, " > "); }
            
            const today = new Date(); 
            const yy = String(today.getFullYear()).slice(-2); 
            const mm = String(today.getMonth() + 1).padStart(2, '0'); 
            const dd = String(today.getDate()).padStart(2, '0'); 
            const dateStringYYMMDD = `${yy}${mm}${dd}`; 
            const dateStringFull = today.getFullYear() + "-" + mm + "-" + dd;
            
            const printDateEl = document.getElementById('print-date');
            if (printDateEl) printDateEl.textContent = "인쇄일자: " + dateStringFull;
            
            const exportName = `${dateStringYYMMDD}_${safeInfoStr}`; 
            document.title = exportName; 
            window.exportFilenameStr = exportName;
            window.driveSaveFilenameStr = `${safeInfoStr}`;  // 날짜 없는 드라이브 전용 파일명
        } catch (err) {
            console.error("파일명 자동 조립 엔진 오류:", err);
        }
    };

    // 💡 [2026-08-28 신규] WBS 셀 접기/펴기 화살표 클릭 — 이 행 아래 하위(자식) 행들을 숨기고/보이고
    //    토글한다. 실제 표시/숨김은 applyFilters()가 row._wbsCollapsed를 보고 필터와 함께 한 번에
    //    판정하므로(둘이 따로 tr.style.display를 건드리면 서로 덮어써서 꼬임), 여기서는 상태값과
    //    화살표 아이콘만 바꾸고 applyFilters()를 다시 호출한다. renderTable() 전체 재호출보다 가벼움.
    window.toggleWbsCollapse = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        const row = globalData[rowIndex];
        if (!row) return;
        row._wbsCollapsed = !row._wbsCollapsed;
        const tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
        const arrow = tr ? tr.querySelector('.wbs-toggle-arrow') : null;
        if (arrow) {
            arrow.textContent = row._wbsCollapsed ? '▶' : '▼';
            arrow.title = row._wbsCollapsed ? '펼치기' : '접기';
        }
        applyFilters();
    };

    // ═══════════════════════════════════════════════════════════
    // 💡 [2026-08-28 신규 → 같은 날 개편] WBS 업무명 앞 "담당구분" 순환 토글 배지 — 클릭할 때마다
    //    담당구분 목록을 순서대로 한 칸씩 돌려가며 row._담당구분을 바꾼다. 원래는 AI 업무분석 프롬프트
    //    (2361줄)의 정식 명칭(기구/영업/Tooling/미분류)을 그대로 썼는데, 배지가 좁아서 짧은 영문 약칭
    //    (ME/SAL/TOOL/ETC)으로 바꾸고, Slimming/Cutting은 별도 항목을 없애고 LCM으로 의미를 합쳤다
    //    (Slimming/Cutting이 원래도 LCM 패널 자체의 두께·가공 관련 이슈라 LCM 범주에 속함).
    //    AI가 예전 방식(기구/영업/Tooling/미분류/Slimming/Cutting)으로 이미 만들어둔 [담당구분]... 태그도
    //    있으니, _WBS_DISCIPLINE_ALIASES로 옛 명칭 → 새 배지 값으로 자동 변환해서 읽는다(AI 프롬프트
    //    자체의 분류 기준은 안 건드림 — 배지 표시/순환용 목록만 바뀜).
    // 💡 [2026-08-28 버그 수정] "영업"이 SAL로도, "영업" 그대로도 둘 다 드롭다운에 보인다는 지적 —
    //    AI 자동등록 경로(buildMailTaskRow, 14269줄 부근)가 AI 원본 응답의 정식 명칭(영업/기구/Tooling/
    //    미분류/Slimming/Cutting)을 별칭 변환 없이 row._담당구분에 그대로 저장하고 있었다. row._담당구분이
    //    이미 채워져 있으면(대부분의 AI 등록 업무) 아래 _extractDisciplineFromContent(상세내용 태그에서
    //    별칭 변환하는 경로)는 아예 호출되지 않으므로, 그 값만 변환 없이 그대로 배지에 노출됐던 것.
    //    이제 값을 "쓰는" 시점(등록 시)과 "읽는" 시점(배지 표시) 양쪽 모두 이 별칭표를 거치도록 통일한다.
    //    (SA→SAL: "SA"만으로는 Sales인지 직관적으로 안 와닿는다는 지적 — Sales의 알파벳 3글자라 더 바로 읽힘)
    window.WBS_DISCIPLINE_CATEGORIES = ['PM','ME','HW','FW','BLU','TSP','LCM','TOOL','SAL','CS','FA','ETC'];
    window._WBS_DISCIPLINE_ALIASES = {
        '기구': 'ME', '영업': 'SAL', 'Tooling': 'TOOL', '미분류': 'ETC',
        'Slimming': 'LCM', 'Cutting': 'LCM' // 💡 별도 항목 삭제, 의미는 LCM으로 이동
    };

    // 💡 위 별칭표를 한 곳에서만 적용하도록 뺀 공용 함수 — 등록 시(newRow._담당구분 저장)와 표시 시
    // (배지/드롭다운 렌더링) 양쪽에서 반드시 이 함수를 거쳐야 "SA"와 "영업"처럼 같은 뜻의 값이
    // 서로 다른 문자열로 남아 드롭다운에 중복 표시되는 일이 없다. 이미 짧은 코드(ME/SAL/...)인
    // 값이나 목록에 없는 값은 별칭이 없으므로 그대로 반환.
    window._normalizeWbsDiscipline = function(raw) {
        const s = (raw || '').toString().trim();
        if (!s) return '';
        // 💡 "HW, FW"처럼 콤마로 여러 개 기재된 경우도 각각 변환(AI 프롬프트가 최대 2개까지 허용)
        return s.split(',').map(function(part) {
            const p = part.trim();
            return window._WBS_DISCIPLINE_ALIASES[p] || p;
        }).join(', ');
    };

    // AI 분석 업무는 상세내용 [담당구분]기구 처럼 항상 태그를 남기므로, row._담당구분이 비어있는
    // 과거 업무도 이 태그에서 초기값을 복원할 수 있다(AI 분석 날짜 복원 때 만든 것과 같은 패턴).
    // 옛 정식 명칭으로 남아있는 태그는 위 별칭표로 새 배지 값으로 변환해서 반환한다.
    window._extractDisciplineFromContent = function(row) {
        if (!row) return null;
        const contentStr = colIdx.content !== -1 ? (row[colIdx.content] || '').toString() : '';
        if (!contentStr) return null;
        const m = contentStr.match(/\[담당구분\]([^\n]+)/);
        if (!m) return null;
        return window._normalizeWbsDiscipline(m[1]);
    };

    // 💡 [2026-08-28 → 드롭다운으로 교체] 드롭다운에서 담당구분을 선택하면 row._담당구분 갱신 +
    //    상세내용에 [담당구분]... 태그가 이미 있으면 그 값도 같이 바꿔서 서로 어긋나지 않게 한다
    //    (태그가 원래 없던 수동 입력 업무는 새로 끼워넣지 않음). 기존엔 클릭할 때마다 다음 구분으로
    //    순환하는 toggleWbsDiscipline()이었으나, 목록에서 바로 골라 지정하는 방식으로 바뀌었다.
    window.setWbsDiscipline = function(rowIndex, next) {
        const row = globalData[rowIndex];
        if (!row || !next) return;
        const cur = row._담당구분 || window._extractDisciplineFromContent(row) || '';
        if (cur === next) return;
        row._담당구분 = next;

        if (colIdx.content !== -1 && row[colIdx.content] && /\[담당구분\][^\n]*/.test(row[colIdx.content].toString())) {
            row[colIdx.content] = row[colIdx.content].toString().replace(/\[담당구분\][^\n]*/, '[담당구분]' + next);
        }

        logChange(rowIndex, -1, '담당구분', (cur || '(없음)') + ' → ' + next);
        renderTable(globalData);
        applyFilters();
    };

    function applyFilters() {
        try {
            const tbody = document.getElementById('table-body'); const trs = tbody.getElementsByTagName("tr"); let visibleCount = 1;
            let _wbsHideUntilLevel = null; // 💡 접힌 조상의 하위 트리인 동안 계속 숨김 처리하기 위한 추적 상태
            for (let i = 0; i < trs.length; i++) {
                let tr = trs[i]; let rowIndex = parseInt(tr.dataset.rowIndex, 10); if (isNaN(rowIndex)) continue;
                let rowData = globalData[rowIndex]; if (!rowData) continue;
                let showRow = true;

                // 💡 WBS 접기 상태 확인 — 필터보다 먼저 판정해서 AND로 결합(접혔으면 필터 통과 여부와 무관하게 숨김)
                if (_wbsHideUntilLevel !== null) {
                    if ((rowData._level || 0) > _wbsHideUntilLevel) { showRow = false; }
                    else { _wbsHideUntilLevel = null; }
                }
                if (showRow && rowData._wbsCollapsed) { _wbsHideUntilLevel = rowData._level || 0; }

                if (showRow) {
                    for (let colIndexStr in currentFilters) {
                        let colIndex = parseInt(colIndexStr, 10); let filterSet = currentFilters[colIndex];
                        if (!filterSet.has('All')) {
                            let cellValue = (rowData[colIndex] !== undefined && rowData[colIndex] !== null) ? rowData[colIndex].toString().trim() : '';
                    if (colIndex === colIdx.status) {
                        const sMap = (typeof LANG !== 'undefined' && window._currentLang && LANG[window._currentLang]) ? LANG[window._currentLang].statusMap : null;
                        cellValue = (sMap && sMap[cellValue]) || cellValue;
                    }
                    if (!filterSet.has(cellValue)) { showRow = false; break; }
                        }
                    }
                }

                if (showRow) {
                    tr.style.display = "";
                    // 💡 필터 적용 후 "보이는 행" 순서 기준으로 줄무늬 다시 매기기
                    tr.classList.remove('gantt-zebra-b');
                    if ((visibleCount - 1) % 2 === 1) tr.classList.add('gantt-zebra-b');
                    let noTd = tr.querySelector('.no-td'); 
                    if (noTd) { 
                        let span = noTd.querySelector('.row-num-span');
                        if(span) span.textContent = visibleCount++; else noTd.textContent = visibleCount++; 
                    } else if (tr.cells.length > 0) { tr.cells[0].textContent = visibleCount++; }
                    let chartTd = tr.querySelector('.chart-td'); if (chartTd) { chartTd.innerHTML = createStatusChart(rowData._calcStartTs, rowData._calcPlanTs, rowData[colIdx.status], rowData._level, window.getRowCompareInfo ? window.getRowCompareInfo(rowData) : null); }
                } else { tr.style.display = "none"; }
            }
            // 💡 전역 타이틀 및 파일명 동적 주입 스케줄러 명시 호출
            if (typeof window.updatePrintTitle === 'function') window.updatePrintTitle(); 
            updateFilterVisibility();
        } catch(e) { console.error("Filter Apply Error: ", e); }
    }

    function updateFilterVisibility() {
        filterColumns.forEach(col => {
            let validValues = new Set();
            for (let i = 1; i < globalData.length; i++) {
                let rowData = globalData[i]; if (!rowData || rowData.join('').trim() === '') continue;
                let val = rowData[col.index]; if (val !== undefined && val !== null && val.toString().trim() !== '') { validValues.add(val.toString().trim()); }
            }
            const groupDiv = document.getElementById('filter-group-' + col.index);
            if (groupDiv) {
                const btns = groupDiv.querySelectorAll('.btn:not(.btn-all)');
                btns.forEach(btn => {
                    let btnValue = btn.dataset.value;
                    if (col.name === '개발단계') { btn.style.display = 'inline-block'; if (!validValues.has(btnValue) && !btn.classList.contains('active')) btn.classList.add('dimmed'); else btn.classList.remove('dimmed'); }
                    else if (col.name === '업무상태') { btn.style.display = 'inline-block'; btn.classList.remove('dimmed'); }
                    else { if (validValues.has(btnValue) || btn.classList.contains('active')) btn.style.display = 'inline-block'; else btn.style.display = 'none'; }
                });
            }
        });
    }

    function updateFilter(event, colIndex, value, groupDiv) {
        const btn = event.currentTarget; const filterSet = currentFilters[colIndex]; const allBtn = groupDiv.querySelector('.btn-all');
        if (value === 'All') { filterSet.clear(); filterSet.add('All'); const btns = groupDiv.querySelectorAll('.btn'); btns.forEach(b => b.classList.remove('active')); allBtn.classList.add('active'); } 
        else {
            if (filterSet.has('All')) { filterSet.delete('All'); allBtn.classList.remove('active'); }
            if (filterSet.has(value)) { filterSet.delete(value); btn.classList.remove('active'); } else { filterSet.add(value); btn.classList.add('active'); }
            if (filterSet.size === 0) { filterSet.add('All'); allBtn.classList.add('active'); }
        }
        applyFilters();
    }

    function exportToExcel() {
        if (globalData.length <= 1) { alert("다운로드할 데이터가 없습니다. 먼저 엑셀 파일을 선택하여 병합해주세요."); return; }
        // ── GanttChart 시트: 웹 화면과 동일 구성 ──
        const _hdrContent = (colIdx.content !== -1 && globalData[0][colIdx.content]) ? globalData[0][colIdx.content] : '업무 상세내용';
        // 💡 텍스트 막대(유니코드 블록)로 웹의 현황 막대 위치를 흉내냄 — 전체 타임라인 기준, 총 20칸
        const BAR_LEN = 20;
        function _textStatusBar(startTs, planTs, statusVal) {
            const viewStart = window.ganttViewStartTs, viewDur = window.ganttViewDuration;
            if (!viewStart || !viewDur || (!startTs && !planTs)) return '';
            let ts0 = startTs, ts1 = planTs || startTs; if (ts1 < ts0) ts1 = ts0;
            const startPct = Math.max(0, Math.min(1, (ts0 - viewStart) / viewDur));
            const endPct   = Math.max(0, Math.min(1, (ts1 - viewStart) / viewDur));
            let startCell = Math.round(startPct * BAR_LEN);
            let endCell   = Math.round(endPct * BAR_LEN);
            if (endCell <= startCell) endCell = startCell + 1;
            const s = String(statusVal || '').toLowerCase();
            const mark = (s.includes('취소') || s.includes('cancel') || s.includes('드랍') || s.includes('drop')) ? '▓' : '█';
            let bar = '';
            for (let k = 0; k < BAR_LEN; k++) bar += (k >= startCell && k < endCell) ? mark : '░';
            return bar;
        }
        let exportData = [['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', _hdrContent, '현황']];
        let ganttL0Rows = [];
        let rowNumCounter = 1;
        for (let i = 1; i < globalData.length; i++) {
            let row = globalData[i]; if (!row) continue;
            const lv = row._level !== undefined ? row._level : 0;
            const prefix = lv > 0 ? (row._isLastChild ? '└ ' : '├ ') : '';
            let taskTxt = lv === 0 ? row._origDev : lv === 1 ? row._origT1 : lv === 2 ? row._origT2 : lv === 3 ? row._origT3 : row._origT4;
            if (taskTxt === undefined || taskTxt === null) taskTxt = '';
            const indent = new Array(lv + 1).join('  ');
            const startVal = (lv === 0 || row._startForced || !row._finalDuration) ? (row._calcStartTs ? formatTsToYMD(row._calcStartTs) : '') : '';
            const planVal  = (lv === 0 || row._planForced  || !row._finalDuration) ? (row._calcPlanTs  ? formatTsToYMD(row._calcPlanTs)  : '') : '';
            const days = countWorkingDays(row._calcStartTs, row._calcPlanTs);
            const statusVal  = colIdx.status  !== -1 ? (row[colIdx.status]  || '') : '';
            const contentVal = colIdx.content !== -1 ? (row[colIdx.content] || '') : '';
            const barVal = _textStatusBar(row._calcStartTs, row._calcPlanTs, statusVal);
exportData.push([rowNumCounter, lv, startVal, planVal, days, statusVal, indent + prefix + taskTxt, contentVal, barVal]);
            if (lv === 0) ganttL0Rows.push(exportData.length - 1);
            rowNumCounter++;
        }
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        ws['!cols'] = [{wch:5},{wch:10},{wch:11},{wch:11},{wch:7},{wch:8},{wch:34},{wch:55},{wch:24}];
        (function() {
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let r = 1; r <= range.e.r; r++) {
                const isL0 = ganttL0Rows.indexOf(r) !== -1;
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    cell.s = {
                        font: c === 8
                            ? { name: "Consolas", sz: 11, bold: true, color: { rgb: window._cpXlsxRole('darkText') } }
                            : { name: "맑은 고딕", sz: 10, bold: isL0, color: { rgb: "1F2937" } },
                        fill: isL0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('headerTint') } }
                                : (r % 2 === 0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('zebraB') } } : undefined),
                        alignment: { vertical: "center", horizontal: c <= 5 ? "center" : (c === 8 ? "center" : "left"), wrapText: c === 7 }
                    };
                }
            }
        })();

        const wb = XLSX.utils.book_new();

        // 💡 엑셀 출력 직전, 신규 탭(Summary/Brief SPEC/M.C Table)에 입력된 최신 내용을
        //    projectMeta / tabData로 동기화한다 (탭을 이동하지 않고 바로 저장해도 반영되도록)
        if (window.collectTabData) window.collectTabData();
        const tabData = window.tabData || {};

        // ── Summary 시트 (프로젝트 정보 + 프로젝트 개요 + 마일스톤, 통합) ──
        const meta = window.projectMeta || {};
        const sd = tabData.summary || {};
        // ── Summary 시트: 웹 페이지와 동일 배치 ──
        const M = function(k, f) { const m = (sd.milestones && sd.milestones[k]) || {}; return m[f] || ''; };
        const ktkCombined = (meta.KTKPN || '') + (meta.KTK모델명 ? '_' + meta.KTK모델명 : '');
        const summaryData = [
            /* 0*/ ['구분', 'PROTO', '', '', 'ES', '', '', 'PP', '', ''],
            /* 1*/ ['', 'Start', 'End', 'DR', 'Start', 'End', 'DVR', 'Start', 'End', 'PRA'],
            /* 2*/ ['계획', M('기획Start','date'), M('기획Finish','date'), M('ProtoDR','date'), M('ESStart','date'), M('ESEnd','date'), M('DVR','date'), M('PPStart','date'), M('PPEnd','date'), M('PRA','date')],
            /* 3*/ ['실적', M('기획Start','actualDate'), M('기획Finish','actualDate'), M('ProtoDR','actualDate'), M('ESStart','actualDate'), M('ESEnd','actualDate'), M('DVR','actualDate'), M('PPStart','actualDate'), M('PPEnd','actualDate'), M('PRA','actualDate')],
            /* 4*/ ['개발기간(일)', sd.devDays || '', '', '', '현재 M.C 리비전', tabData.mcActiveRevision || 'R1', '', '', '', ''],
            /* 5*/ [],
            /* 6*/ ['프로젝트 개요', '', '', '', '프로젝트 정보', '', '', '', '', ''],
            /* 7*/ ['적용 목적', sd.purpose || '', '', '', '고객사', meta.고객사 || '', '', '', '', ''],
            /* 8*/ ['연간 수요량', sd.volume || '', '', '', '고객 모델명', meta.고객모델명 || meta.모델명 || '', '', '', '', ''],
            /* 9*/ ['목표 양산 일정', sd.mpDate || '', '', '', '프로젝트 코드', meta.프로젝트코드 || '', '', '', '', ''],
            /*10*/ ['', '', '', '', '프로젝트 명칭', meta.프로젝트명 || '', '', '', '', ''],
            /*11*/ ['', '', '', '', 'KTK PN_모델명', ktkCombined, '', '', '', ''],
            /*12*/ ['', '', '', '', '인치', meta.인치 || '', '', '', '', ''],
            /*13*/ [],
            /*14*/ ['추진 배경 및 의의', '', '', '', '', '', '', '', '', ''],
            /*15*/ [sd.background || '', '', '', '', '', '', '', '', '', ''],
            /*16*/ [],
            /*17*/ ['프로젝트 멤버-1', '', '', '', '프로젝트 멤버-2', '', '', '', '', ''],
            /*18*/ ['프로젝트 담당자', meta.프로젝트담당자 || '', meta.프로젝트담당자이메일 || '', '', 'TSP 담당자', meta.TSP담당자 || '', meta.TSP담당자이메일 || '', '', '', ''],
            /*19*/ ['기구 담당자', meta.기구담당자 || '', meta.기구담당자이메일 || '', '', 'LCM 담당자', meta.LCM담당자 || '', meta.LCM담당자이메일 || '', '', '', ''],
            /*20*/ ['H/W 담당자', meta.HW담당자 || '', meta.HW담당자이메일 || '', '', 'Slimming 담당자', meta.Slimming담당자 || '', meta.Slimming담당자이메일 || '', '', '', ''],
            /*21*/ ['F/W 담당자', meta.FW담당자 || '', meta.FW담당자이메일 || '', '', 'Cutting 담당자', meta.Cutting담당자 || '', meta.Cutting담당자이메일 || '', '', '', ''],
            /*22*/ ['BLU 담당자', meta.Module담당자 || '', meta.Module담당자이메일 || '', '', 'Tooling 담당자', meta.Tooling담당자 || '', meta.Tooling담당자이메일 || '', '', '', ''],
        ];
        // 💡 프로젝트 멤버-3 (자유 추가 인원)
        const member3 = tabData.projectMembers3 || [];
        if (member3.length) {
            summaryData.push([]);
            summaryData.push(['프로젝트 멤버-3', '', '', '', '', '', '', '', '', '']);
            for (let i = 0; i < member3.length; i += 2) {
                const a = member3[i], b = member3[i + 1];
                summaryData.push([
                    a.role || '', a.name || '', a.email || '', '',
                    b ? (b.role || '') : '', b ? (b.name || '') : '', b ? (b.email || '') : '', '', '', ''
                ]);
            }
        }
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },   // 구분
            { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },   // PROTO
            { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } },   // ES
            { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } },   // PP
            { s: { r: 14, c: 0 }, e: { r: 14, c: 9 } }, // 추진 배경 제목
            { s: { r: 15, c: 0 }, e: { r: 15, c: 9 } }, // 추진 배경 내용
        ];
        (function() {
            const NAVYS = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
            const rowFill = function(r, rgb) {
                for (let c = 0; c <= 9; c++) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (!cell) continue;
                    cell.s = { font: { name: "맑은 고딕", sz: 10, bold: c === 0 }, fill: { patternType: "solid", fgColor: { rgb: rgb } }, alignment: { vertical: "center", horizontal: "center", wrapText: true } }; }
            };
            for (let c = 0; c <= 9; c++) { [0, 1].forEach(function(r) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (cell) cell.s = NAVYS; }); }
            rowFill(2, 'F4F6F8');  // 계획 — 웹 #f4f6f8
            rowFill(3, 'FFF8E6');  // 실적 — 웹 #fff8e6
            const member3TitleRow = summaryData.findIndex(function(row) { return row[0] === '프로젝트 멤버-3'; });
            const navyRows = member3TitleRow === -1 ? [6, 14, 17] : [6, 14, 17, member3TitleRow];
            navyRows.forEach(function(r) { for (let c = 0; c <= 9; c++) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (cell && String(cell.v || '') !== '') cell.s = NAVYS; } });
        })();
        wsSummary['!cols'] = [{wch:16},{wch:22},{wch:24},{wch:6},{wch:16},{wch:24},{wch:24},{wch:11},{wch:11},{wch:11}];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // ── Brief SPEC 시트 (컨셉 단계) ──
        const briefSpecData = [['NO', 'TYPE', '', 'Model A', 'Model B', 'Model C', 'Note']];
        (tabData.briefSpec || []).forEach((r, i) => { briefSpecData.push([i + 1, r.type || '', r.sub || '', r.modelA || r.desc || '', r.modelB || '', r.modelC || '', r.note || '']); });
        const wsBrief = XLSX.utils.aoa_to_sheet(briefSpecData);
        // 💡 스타일은 공통 applyExcelStyles가 일괄 처리 (헤더 흰색/남색, 지브라 등)
        wsBrief['!cols'] = [{wch: 6}, {wch: 22}, {wch: 14}, {wch: 35}, {wch: 30}];
        XLSX.utils.book_append_sheet(wb, wsBrief, "Customer SPEC"); // 💡 [2026-08-29] 표시명 변경(구 "Brief SPEC") — 재가져오기 매칭은 parseConceptSheetsFromWorkbook의 구 시트명 호환 참고

                // ── MC 종류별(기본 + 추가된 종류) 반복: Comparison + R1~R5 시트 ──
        // 💡 제품구분자가 하나라도 있으면 그것들만 순회(이름 없는 "기본" 자리는 이제 존재하지 않음).
        //    아직 제품구분자를 하나도 안 쓰는(단일종류) 프로젝트만 예전처럼 ''(이름 없음) 하나로 저장.
        (window.getMcUnits().length ? window.getMcUnits() : ['']).forEach(function(_mcUnitKey) {
            // 💡 이 종류의 저장소를 잠깐 가리키게 함 (화면 상태는 안 건드림)
            window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
            window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
            const _mcRevSrc = _mcUnitKey ? (window.tabData.mcRevisionsByUnit[_mcUnitKey] || {}) : (window.tabData.mcRevisions || {});
            const _mcSalesSrc = _mcUnitKey ? (window.tabData.mcSalesPriceDetailByUnit[_mcUnitKey] || {}) : (window.tabData.mcSalesPriceDetail || {});
            const _mcHasData = Object.keys(_mcRevSrc).some(function(k) { return _mcRevSrc[k] && _mcRevSrc[k].length; });
            if (_mcUnitKey && !_mcHasData) return; // 추가는 됐지만 데이터가 전혀 없는 종류는 시트 생성 안 함

            const _mcPrevRevisions = tabData.mcRevisions, _mcPrevSales = tabData.mcSalesPriceDetail;
            const _mcPrevActiveUnit = window.mcActiveUnit; // 💡 Note 저장소도 이 종류 기준으로 바뀌도록 잠깐 전환
            tabData.mcRevisions = _mcRevSrc; tabData.mcSalesPriceDetail = _mcSalesSrc;
            window.mcActiveUnit = _mcUnitKey;
            const _mcSuffix = _mcUnitKey ? ('-' + _mcUnitKey) : '';

            // ── MC Comparison 시트 (R1~R5 비교 + 영업판가 + 재료비율) ──
            if (window.mcBuildComparisonRows) {
                const compRows = window.mcBuildComparisonRows();
                const revs = window._mcRevList(tabData.mcRevisions || {}, { onlyWithMoney: true, desc: true });
                const compSalesPrice = {};
                revs.forEach(function(rev) {
                    const detail = (tabData.mcSalesPriceDetail && tabData.mcSalesPriceDetail[rev]) || {};
                    const n = parseFloat(String(detail.mpCost || '').replace(/[^0-9.-]+/g, ''));
                    compSalesPrice[rev] = isNaN(n) ? 0 : n;
                });
                const header1 = ['TYPE', 'ITEM', 'GROUP'];
                const header2 = ['', '', ''];
                revs.forEach(function(rev) { header1.push(rev + ' MP', ''); header2.push('Cost($)', 'NRE'); });
                header1.push('Note'); header2.push('');
                const compData = [header1, header2];
                const totals = {}; revs.forEach(function(rev) { totals[rev] = { cost: 0, nre: 0 }; });

                let compCurType = '';
                const compGroupSubtotal = {}; revs.forEach(function(rev) { compGroupSubtotal[rev] = { cost: 0, nre: 0 }; });
                const compSubtotalRowIdx = [];
                const compTypeMerges = [];
                let compSegStartRow = compData.length;
                compRows.forEach(function(r, idx) {
                    const rt = String(r.type || '').trim();
                    if (rt) compCurType = rt;
                    const row = [r.type, r.item, r.group];
                    revs.forEach(function(rev) {
                        const p = r.prices[rev] || { cost: 0, nre: 0 };
                        row.push(p.cost || '', p.nre || '');
                        totals[rev].cost += p.cost; totals[rev].nre += p.nre;
                        compGroupSubtotal[rev].cost += p.cost; compGroupSubtotal[rev].nre += p.nre;
                    });
                    row.push(r.note || '');
                    compData.push(row);
                    const compCurRowIdx = compData.length - 1;

                    const itemHasEtc = /\betc\b|\bNRE\b/.test(String(r.item || ''));
                    const nextRow = compRows[idx + 1];
                    const nextType = nextRow ? String(nextRow.type || '').trim() : '';
                    const isLastRow = !nextRow;
                    const typeWillChange = !!(nextRow && nextType && nextType !== compCurType);
                    if (compCurType && (itemHasEtc || typeWillChange || isLastRow)) {
                        if (compCurRowIdx > compSegStartRow) {
                            compTypeMerges.push({ s: { r: compSegStartRow, c: 0 }, e: { r: compCurRowIdx, c: 0 } });
                        }
                        const subRow = [compCurType + ' SUBTOTAL', '', ''];
                        revs.forEach(function(rev) { subRow.push(compGroupSubtotal[rev].cost || '', compGroupSubtotal[rev].nre || ''); });
                        subRow.push('');
                        compSubtotalRowIdx.push(compData.length);
                        compData.push(subRow);
                        revs.forEach(function(rev) { compGroupSubtotal[rev] = { cost: 0, nre: 0 }; });
                        compSegStartRow = compData.length;
                    }
                });

                const totalRow = ['TOTAL(M.C)', '', ''];
                revs.forEach(function(rev) { totalRow.push(totals[rev].cost, totals[rev].nre); });
                totalRow.push('');
                compData.push(totalRow);
                const salesRow = ['영업판가', '', ''];
                revs.forEach(function(rev) { salesRow.push(compSalesPrice[rev] || '', ''); });
                salesRow.push('');
                compData.push(salesRow);
                const ratioRow = ['재료비율 (M.C ÷ 영업판가) [%]', '', ''];
                revs.forEach(function(rev) {
                    const sp = compSalesPrice[rev] || 0;
                    ratioRow.push(sp > 0 ? (totals[rev].cost / sp * 100).toFixed(1) : '', '');
                });
                ratioRow.push('');
                compData.push(ratioRow);

                const wsComp = XLSX.utils.aoa_to_sheet(compData);
                wsComp['!merges'] = [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
                ];
                revs.forEach(function(rev, i) { const c0 = 3 + i * 2; wsComp['!merges'].push({ s: { r: 0, c: c0 }, e: { r: 0, c: c0 + 1 } }); });
                wsComp['!merges'].push({ s: { r: 0, c: 3 + revs.length * 2 }, e: { r: 1, c: 3 + revs.length * 2 } });
                const compSummaryRows = compSubtotalRowIdx.map(function(r) { return { r: r, color: 'FFF9C4' }; }).concat([
                    { r: compData.length - 3, color: 'E3F2FD' },
                    { r: compData.length - 2, color: 'E8F5E9' },
                    { r: compData.length - 1, color: 'FFE0B2' },
                ]);
                compSummaryRows.forEach(function(s) { wsComp['!merges'].push({ s: { r: s.r, c: 0 }, e: { r: s.r, c: 2 } }); });
                compTypeMerges.forEach(function(m) { wsComp['!merges'].push(m); });
                for (let r = 0; r <= 1; r++) {
                    for (let c = 0; c < header1.length; c++) {
                        const h = wsComp[XLSX.utils.encode_cell({ r: r, c: c })];
                        if (h) h.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                    }
                }
                const compRange = XLSX.utils.decode_range(wsComp['!ref']);
                for (let r = 2; r <= compRange.e.r; r++) {
                    const sum = compSummaryRows.find(function(s) { return s.r === r; });
                    for (let c = 0; c <= compRange.e.c; c++) {
                        const cell = wsComp[XLSX.utils.encode_cell({ r: r, c: c })];
                        if (!cell) continue;
                        if (c >= 3 && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
                        if (sum) {
                            cell.s = {
                                font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "333333" } },
                                fill: { patternType: "solid", fgColor: { rgb: sum.color } },
                                alignment: { vertical: "center", horizontal: c === 0 ? "right" : "center" }
                            };
                        } else if (c === 0) {
                            cell.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                        }
                    }
                }
                wsComp['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 16 }];
                XLSX.utils.book_append_sheet(wb, wsComp, "MC Comparison" + _mcSuffix);
            }

            const mcRevisionsForExport = tabData.mcRevisions || {};
            // 💡 참조 템플릿에서 온 TYPE/ITEM 라벨만 있고 금액이 전부 빈 "껍데기 행"은
            //    실제 데이터로 치지 않음 — Cost/NRE 중 하나라도 값이 있어야 "데이터 있음"으로 간주
            const _mcHasRealMoney = function(rows) {
                if (!rows || !rows.length) return false;
                const moneyFields = ['protoCost', 'protoNre', 'protoBCost', 'protoBNre', 'mpCost', 'mpNre'];
                return rows.some(function(r) {
                    return moneyFields.some(function(f) { return r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== ''; });
                });
            };
            window._mcRevList(mcRevisionsForExport).forEach(function(rev) {
                const rows = mcRevisionsForExport[rev] || (rev === 'R1' && !_mcUnitKey ? tabData.mcTable : null);
                if (rev !== 'R1' && !_mcHasRealMoney(rows)) return; // R1은 골격 유지용으로 항상 저장, 나머지는 실제 금액 있을 때만
                const sheetName = 'M.C Table' + _mcSuffix + ' ' + rev;
                XLSX.utils.book_append_sheet(wb, _buildMcSheet(rows, rev, _mcUnitKey), sheetName);
            });

            tabData.mcRevisions = _mcPrevRevisions; tabData.mcSalesPriceDetail = _mcPrevSales;
            window.mcActiveUnit = _mcPrevActiveUnit; // 💡 화면 상태 원복
        });
        function _buildMcSheet(rows, rev, unitLabel) {
            const num = function(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.-]+/g, '')); return isNaN(n) ? 0 : n; };
            const cellMoney = function(v) { const n = num(v); return n === 0 ? '' : n; };
            // 💡 견적 마지막 수정 날짜 — 이 리비전(rev)의 마지막 변경이력 시각 (없으면 '-')
            const revChangeLogs = (tabData.mcChangeLog || []).filter(function(l) { return l.rev === rev; });
            const mcLatestDate = revChangeLogs.length ? revChangeLogs[revChangeLogs.length - 1].time : '-';
            const _mcUnitTag = unitLabel ? '[' + unitLabel + ']' : '';
            const mcData = [
                ['TYPE', 'ITEM', 'GROUP', 'P/N', 'Specification', _mcUnitTag + 'PROTO A', '', _mcUnitTag + 'PROTO B', '', _mcUnitTag + 'MP', '', (window._currentLang === 'en' ? 'Last Modified: ' : '최종수정: ') + mcLatestDate],
                ['', '', '', '', '', 'Cost($)', 'NRE', 'Cost($)', 'NRE', 'Cost($)', 'NRE', 'Note'],
            ];
            const valid = (rows || []).filter(function(r) { const t = String(r.type || '').toUpperCase().replace(/\s/g, ''); return t !== 'SUBTOTAL' && t !== 'TOTAL'; });
            let lastType = '';
            const typed = valid.map(function(r) { const t = String(r.type || '').trim(); if (t) lastType = t; return lastType; });
            const zero = function() { return { pc: 0, pn: 0, bc: 0, bn: 0, mc: 0, mn: 0 }; };
            let sub = zero(), grand = zero(), curType = '';
            const summaryRows = [];
            const typeMerges = [];
            let segStartRow = mcData.length;
            valid.forEach(function(r, idx) {
                curType = typed[idx] || curType;
                mcData.push([String(r.type || ''), r.item || '', r.group || '', r.pn || '', r.spec || '', cellMoney(r.protoCost), cellMoney(r.protoNre), cellMoney(r.protoBCost), cellMoney(r.protoBNre), cellMoney(r.mpCost), cellMoney(r.mpNre), r.note || '']);
                const curRowIdx = mcData.length - 1;
                sub.pc += num(r.protoCost); sub.pn += num(r.protoNre); sub.bc += num(r.protoBCost); sub.bn += num(r.protoBNre); sub.mc += num(r.mpCost); sub.mn += num(r.mpNre);
                grand.pc += num(r.protoCost); grand.pn += num(r.protoNre); grand.bc += num(r.protoBCost); grand.bn += num(r.protoBNre); grand.mc += num(r.mpCost); grand.mn += num(r.mpNre);
                const itemHasEtc = /\betc\b|\bNRE\b/.test(String(r.item || ''));
                const nextType = idx + 1 < typed.length ? typed[idx + 1] : '';
                const isLast = idx === valid.length - 1;
                if (curType && (itemHasEtc || isLast || (nextType && nextType !== curType))) {
                    if (curRowIdx > segStartRow) {
                        typeMerges.push({ s: { r: segStartRow, c: 0 }, e: { r: curRowIdx, c: 0 } });
                    }
                    mcData.push([curType + ' SUBTOTAL', '', '', '', '', sub.pc, sub.pn, sub.bc, sub.bn, sub.mc, sub.mn, '']);
                    summaryRows.push({ r: mcData.length - 1, color: 'FFF9C4' });
                    sub = zero();
                    segStartRow = mcData.length;
                }
            });
            mcData.push(['TOTAL(M.C)', '', '', '', '', grand.pc, grand.pn, grand.bc, grand.bn, grand.mc, grand.mn, '']);
            summaryRows.push({ r: mcData.length - 1, color: 'E3F2FD' });
            const sp = ((tabData.mcSalesPriceDetail || {})[rev]) || {};
            const spv = function(f) { return num(sp[f]); };
            mcData.push(['영업판가', '', '', '', '', spv('protoCost') || '', spv('protoNre') || '', spv('protoBCost') || '', spv('protoBNre') || '', spv('mpCost') || '', spv('mpNre') || '', '']);
            summaryRows.push({ r: mcData.length - 1, color: 'E8F5E9' });
            const ratio = function(tot, f) { const s = spv(f); return s > 0 ? (tot / s * 100).toFixed(1) + '%' : '-'; };
            mcData.push(['재료비율 (M.C ÷ 영업판가) [%]', '', '', '', '', ratio(grand.pc, 'protoCost'), ratio(grand.pn, 'protoNre'), ratio(grand.bc, 'protoBCost'), ratio(grand.bn, 'protoBNre'), ratio(grand.mc, 'mpCost'), ratio(grand.mn, 'mpNre'), '']);
            summaryRows.push({ r: mcData.length - 1, color: 'FFE0B2' });

            const wsMc = XLSX.utils.aoa_to_sheet(mcData);
            wsMc['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
                { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
                { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }, { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } },
                { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } },
            ];
            summaryRows.forEach(function(s) { wsMc['!merges'].push({ s: { r: s.r, c: 0 }, e: { r: s.r, c: 4 } }); });
            typeMerges.forEach(function(m) { wsMc['!merges'].push(m); });
            for (let c = 0; c <= 11; c++) {
                const h2 = wsMc[XLSX.utils.encode_cell({ r: 1, c: c })];
                if (h2) h2.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
            }
            // 💡 Note 헤더 상단 셀(최종수정 날짜)만 우측 정렬 — 나머지 헤더는 기본 중앙정렬 유지
            const noteDateCell = wsMc[XLSX.utils.encode_cell({ r: 0, c: 11 })];
            if (noteDateCell) noteDateCell.s = { alignment: { vertical: "center", horizontal: "right" } };
            const range = XLSX.utils.decode_range(wsMc['!ref']);
            for (let r = 2; r <= range.e.r; r++) {
                const sum = summaryRows.find(function(s) { return s.r === r; });
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = wsMc[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    if (c >= 5 && c <= 10 && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
                    if (sum) {
                        cell.s = {
                            font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "333333" } },
                            fill: { patternType: "solid", fgColor: { rgb: sum.color } },
                            alignment: { vertical: "center", horizontal: c === 0 ? "right" : "center" }
                        };
                    } else if (c === 0) {
                        cell.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                    }
                }
            }
            wsMc['!cols'] = [{wch:12},{wch:18},{wch:16},{wch:12},{wch:36},{wch:11},{wch:10},{wch:11},{wch:10},{wch:11},{wch:10},{wch:30}];
            return wsMc;
        }
        
        // ── M.C 수정이력 시트 ──
        const mcLogs = tabData.mcChangeLog || [];
        if (mcLogs.length) {
            const mcLogData = [['변경 일시', '수정자', '리비전', '항목', '필드', '변경 전 (Old)', '변경 후 (New)']];
            mcLogs.forEach(function(log) {
                mcLogData.push([log.time, log.userName || '알 수 없음', log.rev, log.row, log.field, log.oldVal, log.newVal]);
            });
            const wsMcLog = XLSX.utils.aoa_to_sheet(mcLogData);
            wsMcLog['!cols'] = [{wch: 20}, {wch: 14}, {wch: 8}, {wch: 20}, {wch: 12}, {wch: 30}, {wch: 30}];
            XLSX.utils.book_append_sheet(wb, wsMcLog, "M.C 수정이력");
        }

        // ── Elec Parts 시트 — PANEL/CONV/AD BD 비교표의 "선택 모델·Note·수정이력"을 백업/복원 ──
        //    💡 [2026-08-28 신규] 실제 스펙 데이터는 팀 공용 라이브러리(Drive JSON)에 있어 프로젝트
        //    엑셀엔 필요 없지만, "이 프로젝트가 무슨 모델을 비교표에 골라뒀는지"는 프로젝트별 정보라
        //    여기 없으면 엑셀로 백업→복원 시 통째로 사라진다. ## 구획 표시로 섹션을 나누고,
        //    가져오기(_parseElecPartsSheetFromWorkbook)도 이 구조를 그대로 되읽는다.
        (function() {
            const epTypeLabel = { panel: 'PANEL', convbd: 'CONV', adbd: 'AD BD' };
            const pc = tabData.panelCompare || { selectedModels: [], notes: {} };
            const ecAll = tabData.elecCompare || {};
            const selByType = {
                panel: pc.selectedModels || [],
                convbd: (ecAll.convbd && ecAll.convbd.selectedModels) || [],
                adbd: (ecAll.adbd && ecAll.adbd.selectedModels) || []
            };
            const notesByType = {
                panel: pc.notes || {},
                convbd: (ecAll.convbd && ecAll.convbd.notes) || {},
                adbd: (ecAll.adbd && ecAll.adbd.notes) || {}
            };
            const logsByType = {
                panel: tabData.panelCompareChangeLog || [],
                convbd: (tabData.elecCompareChangeLog && tabData.elecCompareChangeLog.convbd) || [],
                adbd: (tabData.elecCompareChangeLog && tabData.elecCompareChangeLog.adbd) || []
            };
            const epData = [
                ['ELEC PARTS DATA'],
                ['## SELECTED MODELS'],
                ['TYPE', 'MODELS (comma-separated)'],
                ['PANEL', selByType.panel.join(',')],
                ['CONV', selByType.convbd.join(',')],
                ['AD BD', selByType.adbd.join(',')],
                [],
                ['## NOTES'],
                ['TYPE', 'LABEL', 'NOTE'],
            ];
            ['panel', 'convbd', 'adbd'].forEach(function(t) {
                Object.keys(notesByType[t]).forEach(function(label) {
                    const v = notesByType[t][label];
                    if (v) epData.push([epTypeLabel[t], label, v]);
                });
            });
            epData.push([], ['## CHANGE LOG'], ['TYPE', '변경 일시', '수정자', '항목', '필드', '변경 전 (Old)', '변경 후 (New)']);
            ['panel', 'convbd', 'adbd'].forEach(function(t) {
                logsByType[t].forEach(function(log) {
                    epData.push([epTypeLabel[t], log.time, log.userName || '알 수 없음', log.row, log.field, log.oldVal, log.newVal]);
                });
            });
            const hasAnyData = selByType.panel.length || selByType.convbd.length || selByType.adbd.length
                || Object.keys(notesByType.panel).length || Object.keys(notesByType.convbd).length || Object.keys(notesByType.adbd).length
                || logsByType.panel.length || logsByType.convbd.length || logsByType.adbd.length;
            if (hasAnyData) {
                const wsEp = XLSX.utils.aoa_to_sheet(epData);
                wsEp['!cols'] = [{wch: 10}, {wch: 40}, {wch: 16}, {wch: 20}, {wch: 12}, {wch: 26}, {wch: 26}];
                XLSX.utils.book_append_sheet(wb, wsEp, "Elec Parts");
            }
        })();

        XLSX.utils.book_append_sheet(wb, ws, "GanttChart");

        if (window.changeLogs && window.changeLogs.length > 0) {
            let logData = [['변경 일시', '수정자', 'No (행)', '변경 항목', '변경 전 (Old)', '변경 후 (New)']];
            window.changeLogs.forEach(log => { logData.push([log.time, log.userName || "알 수 없음", log.rowName, log.colName, log.oldVal, log.newVal]); });
            const wsLog = XLSX.utils.aoa_to_sheet(logData);
            // 💡 스타일은 공통 applyExcelStyles가 일괄 처리
            wsLog['!cols'] = [{wch: 22}, {wch: 15}, {wch: 12}, {wch: 15}, {wch: 35}, {wch: 35}]; 
            XLSX.utils.book_append_sheet(wb, wsLog, "Gantt 수정이력");
        }

        // ── 알림메일 시트: _알림 체크된 행만 모아 정리 (발송 로직은 별도 단계) ──
        const alarmRows = globalData.slice(1).filter(row => row && row._알림);
        if (alarmRows.length > 0) {
            const taskName = (row) => {
                if (row._level === 0) return row._origDev || "";
                if (row._level === 1) return row._origT1 || "";
                if (row._level === 2) return row._origT2 || "";
                if (row._level === 3) return row._origT3 || "";
                if (row._level === 4) return row._origT4 || "";
                return "";
            };
            let alarmData = [['업무명', '시작일', '완료일', '상태', '상세내용']];
            alarmRows.forEach(row => {
                alarmData.push([
                    taskName(row),
                    row._calcStartTs ? formatTsToYMD(row._calcStartTs) : "",
                    row._calcPlanTs ? formatTsToYMD(row._calcPlanTs) : "",
                    colIdx.status !== -1 ? (row[colIdx.status] || "") : "",
                    colIdx.content !== -1 ? (row[colIdx.content] || "") : ""
                ]);
            });
            const wsAlarm = XLSX.utils.aoa_to_sheet(alarmData);
            for (let key in wsAlarm) {
                if (key[0] === '!') continue;
                if (!wsAlarm[key].s) wsAlarm[key].s = {};
                wsAlarm[key].s.font = { sz: 10, name: "맑은 고딕" };
                if (typeof wsAlarm[key].v === 'string' && wsAlarm[key].v.includes('\n')) wsAlarm[key].s.alignment = { wrapText: true, vertical: "top" };
                else wsAlarm[key].s.alignment = { vertical: "center" };
            }
            wsAlarm['!cols'] = [{wch: 28}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 45}];
            XLSX.utils.book_append_sheet(wb, wsAlarm, "알림메일");
        }

        // ── 제품사진_원본데이터 시트: 사진(base64)을 셀 글자수 제한(약 32,767자) 때문에 여러 행으로 나눠 저장 ──
        const CHUNK_SIZE = 30000;
        const piRows = [['슬롯', '순번', '가로(w)', '세로(h)', '데이터(base64 조각)']];
        (tabData.productImages || []).forEach(function(entry, slotIdx) {
            if (!entry) return;
            const src = (typeof entry === 'string') ? entry : entry.data;
            if (!src) return;
            const w = (entry && entry.w) || '';
            const h = (entry && entry.h) || '';
            for (let c = 0; c * CHUNK_SIZE < src.length; c++) {
                piRows.push([slotIdx, c, w, h, src.substr(c * CHUNK_SIZE, CHUNK_SIZE)]);
            }
        });
        if (piRows.length > 1) {
            const wsProdImg = XLSX.utils.aoa_to_sheet(piRows);
            wsProdImg['!cols'] = [{wch: 6}, {wch: 6}, {wch: 8}, {wch: 8}, {wch: 40}];
            XLSX.utils.book_append_sheet(wb, wsProdImg, "제품사진_원본데이터");
        }

        // ── 🪪 Address 시트 ──
        const addrRows = tabData.addressBook || [];
        if (addrRows.length > 0) {
            const addrData = [['이름', '영문 이름', '부서', '직함', '이메일', '휴대폰', '근무처 전화', '텔레그램 ID']];
            addrRows.forEach(function(p) { addrData.push([p.name, p.nameEn, p.dept, p.title, p.email, p.mobile, p.phone, p.telegramId || '']); });
            const wsAddr = XLSX.utils.aoa_to_sheet(addrData);
            // 💡 스타일은 공통 applyExcelStyles가 일괄 처리
            wsAddr['!cols'] = [{wch: 14}, {wch: 14}, {wch: 16}, {wch: 26}, {wch: 16}, {wch: 16}];
            XLSX.utils.book_append_sheet(wb, wsAddr, "Address");
        }

        // ── 업무 보관함 시트 (이 PC 사용자의 보관함 스냅샷 · 출력 전용, 가져오기 시 무시됨) ──
        try {
            const inboxItems = (window.TaskInbox && window.TaskInbox.load()) || [];
            if (inboxItems.length) {
                const inboxData = [['상태', '출처', '담은 일시', 'WBS레벨', '개발단계(L0)', '업무명', '상세내용', '시작일', '완료일', '업무상태']];
                inboxItems.forEach(function(it) {
                    const t = it.task || {};
                    inboxData.push([it.status || '', it.source || '', it.addedAt ? new Date(it.addedAt).toLocaleString('ko-KR') : '', 'L' + (t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4), t['개발단계'] || '', t['업무명'] || '', (t['상세내용'] || '').toString(), t['시작일'] || '', t['완료일'] || '', t['상태'] || '']);
                });
                const wsInbox = XLSX.utils.aoa_to_sheet(inboxData);
                wsInbox['!cols'] = [{wch:8},{wch:16},{wch:18},{wch:8},{wch:14},{wch:26},{wch:60},{wch:11},{wch:11},{wch:8}];
                XLSX.utils.book_append_sheet(wb, wsInbox, "업무 보관함");
            }
        } catch (e) { console.warn('보관함 시트 생성 실패:', e); }

        // 💡 전 시트 공통 스타일 적용 — 모든 시트 추가 후, 저장 직전에 1회만 호출
        applyExcelStyles(wb);
        const fileName = `${window.exportFilenameStr || "GanttChart"}.xlsx`; XLSX.writeFile(wb, fileName);
    }

    // ===== 엑셀 출력 공통 스타일러 =====
    function applyExcelStyles(wb) {
        const NAVY = window._cpXlsxRole('darkText'), BORDER = { style: "thin", color: { rgb: window._cpXlsxRole('border') } };
        const allBorder = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        wb.SheetNames.forEach(function(name) {
            const ws = wb.Sheets[name];
            if (!ws || !ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);
            const colW = [];
            for (let r = range.s.r; r <= range.e.r; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    // 열 너비 자동 계산 (한글 2배 가중치, 최대 45자) — !cols 기지정 시트는 건너뜀
                    if (!ws['!cols']) {
                        const txt = String(cell.v === undefined || cell.v === null ? '' : cell.v);
                        const len = txt.split('\n').reduce(function(m, line) {
                            let w = 0; for (const ch of line) w += /[가-힣ㄱ-ㅎ]/.test(ch) ? 2 : 1;
                            return Math.max(m, w);
                        }, 0);
                        colW[c] = Math.min(45, Math.max(colW[c] || 6, len + 2));
                    }
                    const isHeader = (r === range.s.r);
                    const txt2 = String(cell.v === undefined || cell.v === null ? '' : cell.v);
                    const base = {
                        font: { name: "맑은 고딕", sz: 10, bold: isHeader, color: { rgb: isHeader ? "FFFFFF" : "1F2937" } },
                        fill: isHeader ? { patternType: "solid", fgColor: { rgb: NAVY } }
                              : (r % 2 === 0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('zebraB') } } : undefined),
                        border: allBorder,
                        alignment: { vertical: "center", horizontal: isHeader ? "center" : undefined, wrapText: txt2.indexOf('\n') !== -1 }
                    };
                    // 💡 시트별 개별 지정(L0 강조, SUBTOTAL 색, 계획/실적 배경 등)이 우선 — 테두리 등 기본값만 보강
                    cell.s = Object.assign(base, cell.s || {});
                    if (!cell.s.border) cell.s.border = allBorder;
                }
            }
            if (!ws['!cols'] && colW.length) ws['!cols'] = colW.map(function(w) { return { wch: w || 6 }; });
            ws['!rows'] = ws['!rows'] || [];
            ws['!rows'][0] = { hpt: 22 };
        });
    }

    function formatChartLabel(ts) {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + " '" + String(d.getFullYear()).slice(-2);
}

