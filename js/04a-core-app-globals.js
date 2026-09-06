// [분리됨] 원본: js/04-core-app.js 의 1~202행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 전역 변수 선언 (순서 꼬임 및 TDZ 에러 방지)

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
    - 이메일 내용 맨 앞에 "받는사람: ..." (및 "참조: ...") 줄이 주어졌다면, 그것이 실제 수신자를 직접 명시한
      가장 확실한 근거입니다 — 이 값을 최우선으로 수신자에 사용하세요(문맥 추정보다 신뢰도가 높음).
      "받는사람: (본문에 명시 안 됨)"으로 돼 있거나 이 줄 자체가 없을 때만 아래 문맥 분석으로 수신자를 추정하세요.
    - 인사말(Hi, Regards)이나 서명이 없을 수 있으므로, 문장의 주어·목적어 등 문맥을 분석해 발신자/수신자를 정확히 식별하세요.
    - 발신자: 자료를 첨부/발송(attached, sending)하거나 피드백·승인을 요청(wondering, requesting)하는 주체 (예: "I'd like to send~"에서 'I')
    - 수신자: 자료를 받아 검토해야 하거나 피드백을 제공(provide feedback)해야 하는 대상 (예: "Please provide~", "your CAD update"에서 'You')
    - 본문에 언급된 이름(영문/국문)을 있는 그대로 추출하되, 발신자/수신자 정보가 본문에 드러나지 않는다면 프로젝트 담당자명 등으로 임의 추정해 치환하지 마세요. 본문에 쓰인 영문 표기(예: Anthony→Andy 같은 애칭)를 최우선으로 사용하세요.
    - 위 어떤 단서로도 수신자를 특정할 수 없을 때만 "수신자 미지정" 또는 "수신자 제위"로 표기하세요 — 확실한 단서가 있는데도 습관적으로 이렇게 쓰지 마세요.
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
