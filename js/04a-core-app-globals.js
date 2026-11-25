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
- 상세내용: 아래 형식으로 작성 (글자 수 제한 없음 — 메일에 담긴 정보를 빠짐없이 서술. 배경·수량·모델코드·가격·납기·조건 등 구체적 사실을 최대한 포함), 반드시 줄바꿈(\n)으로 구분
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
  * 출력 형식: [업무유형][발신자→수신자] YYYY-MM-DD\n[핵심내용]메일의 핵심 상황·요청·배경을 배경·수치·모델코드·조건·경위까지 모두 포함해 상세하게 서술 (중요 정보는 생략하지 말 것. 여러 문장 사용 가능)\n[To do]후속조치(누가, 무엇을, 언제까지 해야 하는지 구체적으로 서술)\n[출처]메일 본문 안에서 확인 가능한 제목(Subject)이나 첫 줄 요약 문구, 날짜, 발신자명을 "제목_날짜_발신자" 형태로 간단히 기재 (본문에 제목이 명시되어 있지 않으면 첫 문장을 20자 이내로 축약해서 대신 사용)
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
  \n[문제점]문제의 원인·현황·영향을 구체적으로 서술 (수치·기간·부품명 등 사실 정보 포함)\n[대책]해결책·조치 방향 및 예상 소요 일정을 구체적으로 서술
  예시: "...[To do]후속조치\n[문제점]원자재 수급 차질로 Die-Casting 파트 입고 지연 — 현 재고 0ea, 추가 입고 ETA 3주 후. 출하 일정 최소 3주 지연 예상\n[대책]대체 공급사(B사) 긴급 견적 요청 중(2~3일 내 회신 예정). 확보되면 즉시 발주 전환하여 지연 최소화 추진"

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

    // 📁 앱 루트 바로 아래에 있지만 **프로젝트 폴더가 아닌** 것들 — 목록 조회에서 뺀다.
    //    왜 데이터로 빼나: 예전엔 호출하는 곳마다 배열을 직접 적어서 js/04b 는 3개,
    //    js/05 는 2개로 **서로 달랐다.** 폴더가 하나 늘 때 한쪽만 고치면, 그 폴더를 매번
    //    쓸데없이 뒤지고(왕복 1회) 그 안의 `.json` 이 프로젝트인 척 목록에 끼어든다.
    //    ⚠️ 새 폴더를 앱 루트에 만들면 **여기 한 줄 추가**할 것.
    // 💊 [2026-11-23 사용자 요청 "일일 업무보고 칩 버튼도 AI 요약(기준)으로 통일"] 칩 버튼·작은 드롭다운의
    //    모양 **한 벌** — js/62(AI 요약)·js/59(일일보고)가 같이 쓴다. 따로 적으면 한쪽만 바뀐다.
    //    [2026-11-23 2차 "칩 버튼 크기 모양 통일"] 칩·버튼·드롭다운·입력칸이 **같은 높이(22px)·같은 둥근 모서리**.
    /** 🎨 [2026-11-25] 날짜 글자색 클래스 — 일요일·공휴일=빨강, 토요일=파랑, 평일=회색(Daily Report·Calendar 와 같은 규칙, 색은 styles.css/js/21). YYYY-MM-DD 만 받고 아니면 ''. */
    window._dateDayCls = function (s) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if (!m) return '';
        var wd = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
        var hol = (wd === 0) || !!(window.isHoliday && window.isHoliday(m[1] + '-' + m[2] + '-' + m[3]));
        return hol ? 'date-day-hol' : (wd === 6 ? 'date-day-sat' : 'date-day-wk');
    };
    var _UI_BOX = ' box-sizing:border-box; height:22px; border-radius:11px; font-size:11px; vertical-align:middle;';
    // 🎨 [2026-11-24 "배지·칩 색 통일"] 기본 색은 **팔레트**(`--ui-accent*`, styles.css :root — 모달 헤더와 같은 세 색).
    //    예전엔 켜진 칩이 고정 파랑 #1971c2 인데 꺼진 칩 글자(#2c5f8a)는 js/21 이 테마색으로 갈아 끼워, 한 줄에 파랑·초록이 섞였다.
    //    `tone` 을 준 칩(분류 칩 등)은 역할색이라 그대로. 빨강(danger)도 역할색.
    var ACC = 'var(--ui-accent, #00707d)', ACC_BG = 'var(--ui-accent-bg, #e0f5f7)', ACC_LN = 'var(--ui-accent-line, #a3d9e0)';
    /** 칩(켜고 끄는 것). `tone`={color,bg} 를 주면 그 색 칩(분류 칩 등), 없으면 테마색. */
    window._uiPillStyle = function (on, tone) {
        var c = (tone && tone.color) || ACC;
        var offBg = (tone && tone.bg) || '#fff', offBd = tone ? c : '#cfd8e3', offFg = tone ? c : ACC;
        return 'border:1px solid ' + (on ? c : offBd) + '; background:' + (on ? c : offBg) + '; color:' + (on ? '#fff' : offFg) + ';' +
               _UI_BOX + ' padding:0 9px; line-height:20px; font-weight:bold; cursor:pointer; white-space:nowrap;';
    };
    /** 동작 버튼(엑셀·새로 생성·🔍·↺). kind: 'danger'(해제·초기화) | 'accent'(검색) | 기본. */
    window._uiBtnStyle = function (kind) {
        var k = { danger: ['#eeb0ac', '#fbe4e2', '#b1432f'], accent: [ACC_LN, ACC_BG, ACC] }[kind] || ['#cfd8e3', '#fff', ACC];
        return 'border:1px solid ' + k[0] + '; background:' + k[1] + '; color:' + k[2] + ';' +
               _UI_BOX + ' padding:0 9px; line-height:20px; cursor:pointer; white-space:nowrap;';
    };
    window._uiSelectStyle = function (active) {
        return 'padding:0 6px; border:1px solid ' + (active ? ACC_LN : '#cfd8e3') + '; background:' + (active ? ACC_BG : '#fff') + ';' + _UI_BOX;
    };
    /** 🏷 [2026-11-24 "배지 통일"] 작은 배지(상태·출처·담당자 표시) 모양 한 벌 — 크기·둥글기만, 색은 부르는 쪽이 붙인다.
     *  실측: JIRA 상태 11px·패딩 2/8·둥글기 10(19px) · JIRA 출처 10px·1/5·8(15px) · Project Review 담당자 10.5px·1/6·8(16px) 로 제각각이었다.
     *  간트 업무명 안 구분 배지(9px 드롭다운)는 조밀한 간트용이라 예외. */
    window._uiBadgeStyle = function () {
        return 'display:inline-block; font-size:10.5px; line-height:16px; padding:0 7px; border-radius:8px; white-space:nowrap; vertical-align:middle;';
    };
    /** ⇅ [2026-11-25 "정렬 화살표 통일"] 표 머리글 정렬 표시 한 벌 — 오름차순 ▲ · 내림차순 ▼, **정렬 중인 열에만**.
     *  모양은 styles.css `.ui-sort-mark`(10px·테마색·왼쪽 3px). 실측: 주소록 10px 테마색 · BOM 고정 청록 · Project list 글자 그대로 ·
     *  Project Review 고정 파랑 + 안 고른 열 ↕ · JIRA 10px + 안 고른 열 흐린 ⇅ 로 제각각이었다. */
    window._uiSortMark = function (asc) {
        return '<span class="ui-sort-mark">' + (asc ? '▲' : '▼') + '</span>';
    };
    /** 입력칸(검색 등) — 칩과 같은 높이. */
    window._uiInputStyle = function () {
        return 'padding:0 9px; border:1px solid #cfd8e3; background:#fff;' + _UI_BOX;
    };

    // 🔍 [2026-11-24] 목록 검색 규칙 한 벌 — 프로젝트 불러오기(js/04c)·Project list(js/55)가 같이 쓴다.
    //    ① 띄어 쓴 낱말은 **모두** 들어 있어야 걸린다(AND) ② 공백·기호(> - _ / . , ( ))는 무시하고도 본다
    //    ("LNW K43" ↔ "LNW>K43", "1647180 13p50" ↔ "1647180-13P50") ③ 대소문자 무시.
    //    따로 두면 "여기선 걸리는데 저기선 안 걸린다"가 생긴다 — 규칙은 여기서만 고칠 것.
    var _SEARCH_NOISE = /[\s\-_>\/.,()]+/g;
    window._searchNorm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(_SEARCH_NOISE, ''); };
    /** 검색어 → 낱말 배열(소문자). 비면 [].
     *  🔍 [2026-11-25 사용자 요청 `32", LNW, 인증`] 쉼표(, ， ;)가 있으면 **쉼표로만** 나눈다 —
     *  그래야 띄어쓰기가 든 말("LNW K43", "Harness 300mm")도 한 덩어리로 찾는다. 쉼표가 없으면 예전처럼 띄어쓰기. */
    window._searchTokens = function (q) {
        var s = String(q == null ? '' : q).trim().toLowerCase();
        // 📅 [2026-11-25] "2026-11-01 ~ 2026-11-20" · "11월 25일" 은 띄어 써도 한 날짜/기간이다(쪼개기 전에 붙인다)
        s = s.replace(/\s*~\s*/g, '~').replace(/(\d{1,2})월\s+(\d{1,2})일/g, '$1월$2일');
        var parts = /[,，;]/.test(s) ? s.split(/[,，;]/) : s.split(/\s+/);
        return parts.map(function (p) { return p.trim(); }).filter(Boolean);
    };
    // 🔍 [2026-11-25 사용자 요청] AND / OR 고르기 — 앱 전체 한 값(localStorage). 기본 AND(전부 들어 있어야).
    //    OR = 하나라도 들어 있으면. 모든 검색이 `_searchMatchAll` 을 지나므로 여기 한 곳에서 바뀐다.
    var _SEARCH_MODE_KEY = 'gantt_search_mode_v1';
    window._searchMode = function () { try { return localStorage.getItem(_SEARCH_MODE_KEY) === 'or' ? 'or' : 'and'; } catch (e) { return 'and'; } };
    /** 낱말마다 pred 를 돌려 지금 모드(AND=전부 / OR=하나라도)로 합친다. 직접 낱말을 도는 곳(간트 날짜)용. */
    window._searchCombine = function (tokens, pred) { return window._searchMode() === 'or' ? tokens.some(pred) : tokens.every(pred); };
    /** AND/OR 전환 버튼 html — forId: 다시 돌릴 입력칸 id, run: (선택) 다시 돌릴 전역 함수 이름(oninput 이 검색을 안 돌리는 칸). */
    window._searchModeBtnHtml = function (forId, style, run) {
        var or = window._searchMode() === 'or';
        return '<button type="button" class="search-mode-btn' + (or ? ' is-or' : '') + '" data-for="' + (forId || '') + '"' +
            (run ? ' data-run="' + run + '"' : '') + ' onclick="event.stopPropagation(); window._searchToggleMode()"' +
            ' title="' + window._searchModeTitle() + '" style="' + (style || '') + '">' + (or ? 'OR' : 'AND') + '</button>';
    };
    window._searchModeTitle = function () {
        var en = window._currentLang === 'en', or = window._searchMode() === 'or';
        return en ? ((or ? 'OR — any word matches' : 'AND — every word must match') + ' (click to switch). Separate words with commas to keep spaces: 32", LNW, cert')
                  : ((or ? 'OR — 하나라도 들어 있으면' : 'AND — 모두 들어 있어야') + ' (눌러서 바꾸기). 쉼표로 나누면 띄어쓰기가 든 말도 한 덩어리: 32", LNW, 인증');
    };
    /** 모드를 바꾸고, 앱의 모든 전환 버튼 글자를 맞추고, 글자가 들어 있는 검색칸을 다시 돌린다. */
    window._searchToggleMode = function () {
        var next = window._searchMode() === 'or' ? 'and' : 'or';
        try { localStorage.setItem(_SEARCH_MODE_KEY, next); } catch (e) {}
        var t = window._searchModeTitle();
        document.querySelectorAll('.search-mode-btn').forEach(function (b) {
            b.textContent = next === 'or' ? 'OR' : 'AND';
            b.classList.toggle('is-or', next === 'or');
            b.title = t;
            var inp = b.getAttribute('data-for') ? document.getElementById(b.getAttribute('data-for')) : null;
            if (!inp || !String(inp.value || '').trim()) return;
            var run = b.getAttribute('data-run');
            if (run && typeof window[run] === 'function') { try { window[run](); } catch (e) { console.warn('[search-mode]', run, e); } }
            else inp.dispatchEvent(new Event('input', { bubbles: true }));
        });
        try { window.dispatchEvent(new CustomEvent('searchmodechange', { detail: next })); } catch (e) {}
    };
    /** HTML 에 박힌 전환 버튼(Project list·주소록)을 저장된 모드에 맞춘다 — 처음 그릴 때 한 번. */
    window._searchModeSync = function () {
        var or = window._searchMode() === 'or', t = window._searchModeTitle();
        document.querySelectorAll('.search-mode-btn').forEach(function (b) {
            b.textContent = or ? 'OR' : 'AND'; b.classList.toggle('is-or', or); b.title = t;
        });
    };
    if (typeof document === 'undefined') { /* node 하네스 */ }
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window._searchModeSync(); });
    else setTimeout(function () { window._searchModeSync(); }, 0);
    /** 한 낱말이 이 글에 있나(글자 그대로 또는 기호 뗀 모양). hayNorm 은 미리 만들어 넘기면 빠르다. */
    window._searchHasToken = function (hayLower, token, hayNorm) {
        if (hayLower.indexOf(token) !== -1) return true;
        var tn = window._searchNorm(token);
        if (!tn) return false;
        return (hayNorm != null ? hayNorm : window._searchNorm(hayLower)).indexOf(tn) !== -1;
    };
    /** 검색어가 걸리나 — 지금 모드대로(AND=전부 / OR=하나라도, `_searchMode`). tokens 가 비면 true.
     *  ⚠️ 이름은 옛날 그대로(호출지 30곳) — 거르기는 전부 이 함수를 지난다. */
    //    dates(선택): 글로 안 싣는 날짜 [{from,to}] — 날짜를 글로 넣으면 "2026" 안의 "02" 처럼 숫자 낱말이 걸려서 따로 받는다(`_searchSpan`).
    window._searchMatchAll = function (hay, tokens, dates) {
        if (!tokens || !tokens.length) return true;
        var low = String(hay == null ? '' : hay).toLowerCase(), norm = window._searchNorm(low), hd = null;
        return window._searchCombine(tokens, function (t) {
            if (window._searchHasToken(low, t, norm)) return true;
            // 📅 [2026-11-25] 날짜·기간 낱말이면 글에 적힌 날짜(들)와 겹치는지 본다(글자로 맞추는 것에 더한다 — 넓히기만)
            var r = window._searchDateRange(t);
            if (!r) return false;
            if (hd === null) hd = window._searchHayDates(low).concat(dates || []);
            return hd.some(function (d) { return d.from <= r.to + _SD_DAY - 1 && d.to + _SD_DAY - 1 >= r.from; });
        });
    };

    // 📅 [2026-11-25 사용자 요청 "다른 페이지 찾기에도 달력 기간 검색"] 날짜 낱말 규칙 한 벌 — 간트(js/26)도 이걸 쓴다.
    //    받는 모양: 오늘·어제·내일 / 2026-11-25 · 2026.11.25 · 26-11-25 · 20261125 / 11/25 · 11-25 · 11/25'26 /
    //    11월25일 / 2026-11 · 11월(그 달 전체) / **기간 A~B**(한쪽을 비우면 열린 기간, 거꾸로 적어도 받는다). 연도가 없으면 올해.
    //    숫자 하나("32")는 날짜로 읽지 않는다. 못 읽으면 null.
    var _SD_DAY = 86400000;
    function _sdDay(y, m, d) {
        var dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return dt.getTime();
    }
    window._searchDateRange = function (t) {
        t = String(t || '').trim().toLowerCase();
        if (!t) return null;
        if (t.indexOf('~') >= 0) {
            var pp = t.split('~');
            if (pp.length !== 2 || (!pp[0].trim() && !pp[1].trim())) return null;
            var a = pp[0].trim() ? window._searchDateRange(pp[0]) : { from: -Infinity, to: -Infinity };
            var b = pp[1].trim() ? window._searchDateRange(pp[1]) : { from: Infinity, to: Infinity };
            if (!a || !b) return null;
            var lo = a.from, hi = b.to;
            if (hi < lo) { lo = b.from; hi = a.to; }
            return { from: lo, to: hi };
        }
        var now = new Date(); now.setHours(0, 0, 0, 0);
        var Y = now.getFullYear(), m, s, e;
        var rel = { '오늘': 0, 'today': 0, '어제': -1, 'yesterday': -1, '내일': 1, 'tomorrow': 1 };
        if (Object.prototype.hasOwnProperty.call(rel, t)) {
            s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + rel[t]).getTime();
            return { from: s, to: s };
        }
        if ((m = t.match(/^(\d{4}|\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/)) || (m = t.match(/^(20\d{2})(\d{2})(\d{2})$/))) {
            var y = parseInt(m[1], 10); if (y < 100) y += 2000;
            s = _sdDay(y, parseInt(m[2], 10), parseInt(m[3], 10));
            return s == null ? null : { from: s, to: s };
        }
        if ((m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:'(\d{2}))?$/)) || (m = t.match(/^(\d{1,2})월(\d{1,2})일?$/))) {
            s = _sdDay(m[3] ? 2000 + parseInt(m[3], 10) : Y, parseInt(m[1], 10), parseInt(m[2], 10));
            return s == null ? null : { from: s, to: s };
        }
        if ((m = t.match(/^(\d{4})[-/.](\d{1,2})$/)) || (m = t.match(/^()(\d{1,2})월$/))) {
            var yy = m[1] ? parseInt(m[1], 10) : Y, mm = parseInt(m[2], 10);
            if (mm < 1 || mm > 12) return null;
            s = new Date(yy, mm - 1, 1).getTime(); e = new Date(yy, mm, 0).getTime();
            return { from: s, to: e };
        }
        return null;
    };
    /** 글 속에 적힌 날짜들 → [{from,to}]. 연도가 있는 모양만 읽는다(2026-11-25 · 2026.11.25 · 2026/11/25 · 2026-11-25T… ·
     *  11/25'26 · 2026년 11월 25일). "A~B" 로 붙어 있으면 기간 하나로 본다. "1/2" 같은 비율은 날짜로 안 읽는다. */
    var _SD_HAY = /(^|[^\d])(?:(\d{4})[-./](\d{1,2})[-./](\d{1,2})|(\d{1,2})\/(\d{1,2})'(\d{2})|(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일)(?!\d)/g;
    window._searchHayDates = function (low) {
        var out = [], m, prevEnd = -1;
        _SD_HAY.lastIndex = 0;
        while ((m = _SD_HAY.exec(low))) {
            var at = m.index + m[1].length, ts;
            if (m[2]) ts = _sdDay(+m[2], +m[3], +m[4]);
            else if (m[5]) ts = _sdDay(2000 + (+m[7]), +m[5], +m[6]);
            else ts = _sdDay(+m[8], +m[9], +m[10]);
            if (ts != null) {
                var last = out[out.length - 1];
                if (last && last.open && /^\s*~\s*$/.test(low.slice(prevEnd, at))) { last.to = Math.max(last.from, ts); last.from = Math.min(last.from, ts); last.open = false; }
                else out.push({ from: ts, to: ts, open: true });
                prevEnd = _SD_HAY.lastIndex;
            }
            if (m[0].length === m[1].length) _SD_HAY.lastIndex++;
        }
        return out;
    };
    /** 기간 → `_searchMatchAll` 셋째 인자 [{from,to}](하루 단위로 내림). 숫자(ts)·글 둘 다 받는다. 못 읽으면 []. */
    window._searchSpan = function (s, e) {
        var f = function (v) {
            if (v == null || v === '') return null;
            var d = new Date(typeof v === 'number' ? v : String(v)); if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0); return d.getTime();
        };
        var a = f(s), b = f(e); if (a == null) a = b; if (b == null) b = a;
        if (a == null) return [];
        return [{ from: Math.min(a, b), to: Math.max(a, b) }];
    };
    // 📅 달력으로 날짜/기간 고르기 버튼 — 앱 공용 달력(showGenericCalendar, js/04i). 고른 값을 forId 칸에 넣고
    //    그 칸의 검색을 다시 돌린다(run 이 있으면 그 함수, 없으면 input 이벤트 — AND/OR 버튼과 같은 방식).
    //    기간 버튼은 달력을 두 번 띄운다(시작 → 끝). 끝을 안 고르고 닫으면 칸에 "A~"(그날 이후 전부)가 남는다.
    window._searchCalBtnsHtml = function (forId, style, run) {
        var en = window._currentLang === 'en';
        var attrs = ' data-for="' + (forId || '') + '"' + (run ? ' data-run="' + run + '"' : '') +
            ' onchange="window._searchCalPicked(this)" style="' + (style || '') + '"';
        return '<button type="button" class="search-cal-btn" data-range="0"' + attrs +
                ' onclick="event.stopPropagation(); window._searchCalOpen(this)" title="' + (en ? 'Pick a date from calendar' : '달력에서 날짜 골라 찾기') + '">📅</button>' +
               '<button type="button" class="search-cal-btn" data-range="1"' + attrs +
                ' onclick="event.stopPropagation(); window._searchCalOpen(this)" title="' + (en ? 'Pick a period (start → end) from calendar' : '달력에서 기간 골라 찾기 (시작 → 끝)') + '">📅~📅</button>';
    };
    window._searchCalOpen = function (btn) {
        btn.removeAttribute('data-start'); btn.value = '';
        if (window.showGenericCalendar) window.showGenericCalendar(btn);
        if (btn.getAttribute('data-range') === '1' && window.showToast) window.showToast(window._currentLang === 'en' ? 'Pick the START date' : '시작 날짜를 고르세요', 'info');
    };
    window._searchCalPicked = function (btn) {
        var v = btn.value; if (!v) return;
        var inp = document.getElementById(btn.getAttribute('data-for') || '');
        if (!inp) return;
        var run = function () {
            var fn = btn.getAttribute('data-run');
            if (fn && typeof window[fn] === 'function') { try { window[fn](); } catch (e) { console.warn('[search-cal]', fn, e); } }
            else inp.dispatchEvent(new Event('input', { bubbles: true }));
        };
        if (btn.getAttribute('data-range') !== '1') { inp.value = v; run(); return; }
        var a = btn.getAttribute('data-start');
        if (!a) {
            btn.setAttribute('data-start', v); inp.value = v + '~';
            setTimeout(function () {   // 달력이 이 change 뒤에 스스로 닫히므로 한 틱 뒤에 다시 연다
                if (window.showGenericCalendar) window.showGenericCalendar(btn);
                if (window.showToast) window.showToast(window._currentLang === 'en' ? 'Now pick the END date' : '이제 끝 날짜를 고르세요', 'info');
            }, 0);
            return;
        }
        btn.removeAttribute('data-start');
        var b = v; if (b < a) { var x = a; a = b; b = x; }
        inp.value = a + '~' + b; run();
    };
    /** 낱말이 하나라도 들어 있나 — 걸린 칸/글자 강조용. */
    window._searchMatchAny = function (text, tokens) {
        if (!tokens || !tokens.length) return false;
        var low = String(text == null ? '' : text).toLowerCase(), norm = window._searchNorm(low), hd = null;
        // 📅 [2026-11-25] 날짜·기간 낱말도 본다 — 안 보면 Summary 처럼 "칸마다 걸렸나"를 이걸로 가르는 페이지에서
        //    줄 전체(_searchMatchAll)는 걸렸는데 강조할 칸이 0개라 결과가 통째로 사라졌다.
        return tokens.some(function (t) {
            if (window._searchHasToken(low, t, norm)) return true;
            var r = window._searchDateRange ? window._searchDateRange(t) : null;
            if (!r) return false;
            if (hd === null) hd = window._searchHayDates(low);
            return hd.some(function (d) { return d.from <= r.to + _SD_DAY - 1 && d.to + _SD_DAY - 1 >= r.from; });
        });
    };
    /** 강조 표시(이미 escape 된 html 을 감싼다) — 모양 한 벌. */
    window._searchMarkHtml = function (escapedHtml) {
        return '<mark style="background:#fff3bf; color:inherit; padding:0 1px; border-radius:2px;">' + escapedHtml + '</mark>';
    };

    window.APP_NON_PROJECT_FOLDERS = [
        'Backups',          // 자동 백업
        'App_Config',       // 팀 공용 설정(주소록·공휴일·프롬프트·project_index …)
        'MailBodies',       // 메일 원문 사본(js/54) — text/plain 이라 어차피 안 걸리지만 조회 자체를 뺀다
        'Trash',            // 🗑️ Drive 의 trashed:true 를 어댑터(js/57 driveTrash)가 여기로 옮긴다 — 지운 프로젝트가 목록에 또 뜨면 안 된다
        'MailRoutes',       // 🧭 메일 배분 팀 공용 기록(js/74) — .json 이지만 프로젝트가 아니다
        '개발자료실'        // 사양서·도면 저장소(문서 저장소 root). 파일이 수만 건이라 절대 뒤지면 안 된다.
    ];



    // 🗄️ [2026-11-04] **이 팀의 정본은 어디인가** — 전환 선언. 코드가 아니라 데이터다.
    //   왜 저장소(이 파일)에 두나: 아직 안 옮긴 팀원은 Drive 모드라 NAS 를 못 읽는다. 그래서
    //   "이제 NAS 가 정본"이라는 사실만은 **앱 코드와 같이** 와야 한다(GitHub Pages 라 새로고침
    //   한 번이면 받는다). ⚠️ 사내 주소는 여기 쓰지 않는다 — 공개 저장소다. 주소는 설정 코드로.
    //   `cutover` 를 끄면 경고는 전부 사라진다(되돌릴 때 코드를 뜯지 않아도 되게).
    window.STORAGE_POLICY = {
        cutover: true,              // 팀 전체가 NAS 로 넘어왔는가
        since: '2026-11-04',        // 그날 이후 Drive 에 쓴 내용은 팀에 안 보인다
        target: 'nas',
        hideMirror: true,           // 미러는 이사 중간 단계였다 — 끝났으면 목록에서 내린다
        // 🗄️ [2026-11-04] **고르게 하지 않는다.** 플래그가 없으면 사내 NAS 다.
        //   왜: 저장소는 팀 전체가 같은 곳이어야 의미가 있다. 한 사람이 드라이브에 남으면
        //   그 사람 것만 조용히 갈라진다 — 고를 수 있게 둔 것 자체가 사고의 입구였다.
        //   ⚠️ 비상 탈출구는 남긴다: 콘솔에서
        //        localStorage.setItem('gantt_storage_backend','drive'); location.reload();
        //      NAS·백엔드가 죽었을 때 드라이브의 **옛 사본**을 열어 보는 용도다
        //      (거기 저장하면 팀과 갈라진다 — 배너가 그렇게 말해 준다).
        //   되돌리려면 이 한 줄을 false 로. 코드를 뜯을 필요 없다.
        nasOnly: true,
        // 📂 앱을 열 때 프로젝트 불러오기 창을 **한 번만** 띄운다(사용자 요청 2026-11-04).
        //    Drive 는 사람이 [연동]을 누른 **직후 1회**였는데, NAS 는 연결이 페이지를 열
        //    때마다 일어난다 — 그래서 "한 번만"을 코드가 지켜야 한다(`_projectListAutoOpened`).
        autoOpenProjectList: true
    };
    // ⚠️ [2026-11-04] 이 두 함수는 한때 이 파일에 **똑같은 내용으로 두 번** 들어 있었다
    //    (NAS 전환 중 붙여넣기 사고). 동작은 같았지만 앞 복사본을 고쳐도 뒤 것이 이기므로
    //    "고쳤는데 안 바뀐다"가 될 수 있어 한 벌만 남긴다.

    // 🔀 지금 저장소 모드 하나로 — 'nas' | 'mirror' | 'drive'.
    //
    //   ⚠️ **"토큰이 있나"로 드라이브 연동 여부를 묻지 말 것.** NAS 모드에선 어댑터(js/57)가
    //   앱의 로그인 검사 40여 곳을 통과시키려고 **가짜 토큰을 채워 둔다**. 그래서 토큰 검사는
    //   NAS 모드에서도 늘 참이고, 그걸 믿은 코드가 드라이브를 불러 실패했다(2026-11-04
    //   새 프로젝트 마법사 콘솔 오류). 저장소를 물어야 할 땐 반드시 이 함수를 쓴다.
    window._storageMode = function () {
        var m = '';
        try { m = (localStorage.getItem('gantt_storage_backend') || '').toLowerCase(); } catch (e) { /* ignore */ }
        if (m !== 'drive' && m !== 'mirror' && m !== 'nas') {
            m = (window.STORAGE_POLICY || {}).nasOnly ? 'nas' : 'drive';
        }
        return m;
    };

    // 🏷 지금 저장소를 **사람 말로**. 화면 문구는 이걸 쓴다 — "구글 드라이브"가 문자열로
    //   박혀 있으면 NAS 로 옮긴 뒤 **틀린 안내**가 된다("드라이브 연동하기를 누르세요" 같은:
    //   NAS 모드엔 그런 버튼이 없다). ⚠️ 245곳을 전부 바꾸지는 않는다 — 대부분은 주석이고,
    //   일부는 **진짜로 Drive 를 가리키는 말**이라 바꾸면 거꾸로 틀린다(모드 고르기 경고 등).
    //   사람이 자주 보는 자리만 이 함수로 바꾼다.
    window._storeName = function (en) {
        var m = window._storageMode();
        if (en === undefined) en = (window._currentLang === 'en');
        if (m === 'nas') return en ? 'the in-house NAS' : '사내 NAS';
        if (m === 'mirror') return en ? 'Drive + NAS' : '드라이브+NAS';
        return en ? 'Google Drive' : '구글 드라이브';
    };

    // 🔌 "아직 연결 안 됐을 때 어디로 가라" — 모드마다 가는 곳이 다르다.
    window._storeConnectHint = function (en) {
        var nas = window._storeName(false) === '사내 NAS';
        if (en === undefined) en = (window._currentLang === 'en');
        if (nas) {
            return en ? 'Open 🔑 Settings ▸ NAS and sign in (ID and password only).'
                      : '🔑 설정 ▸ NAS 에서 로그인해주세요(사번·비밀번호만 넣으면 됩니다).';
        }
        return en ? 'Please connect Google Drive first (📁 Project ▸ Connect Drive).'
                  : '먼저 [📁 프로젝트 → 🔵 드라이브 연동하기]로 연결해주세요.';
    };

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;

// ═══════════════════════════════════════════════════════════════════════
// 🏷️ [2026-10-21 신규, 사용자 요청] 고객사 카탈로그 — 고객사 입력란 드롭다운의 원천.
//    ⚠️ 코드가 아니라 **데이터**다. 고객사가 늘면 이 배열만 고친다(CLAUDE.md: 어휘는 데이터로).
//    · code  = SAP 모델명 규칙(KORTEK Model name Descriptions V10)의 고객사 1글자 코드.
//              문서 표에 있는 8곳만 코드가 있다 — 나머지는 코드 없이 이름만 쓴다.
//              (js/46-model-name-builder.js의 MNB_CHART.customer가 문서 원본이고, 여기 code는
//               같은 값을 편의상 함께 적어둔 것이다. 모델명 조립은 그쪽 표를 본다.)
//    · src   = 'doc'  문서 표에 있는 고객사
//              'app'  이 앱 데이터(프로젝트·메일 도메인)에서 실제로 관찰된 고객사
//              'web'  카지노 게이밍 머신 제작사 조사로 보강(2026-10-21)
// ═══════════════════════════════════════════════════════════════════════
window.CUSTOMER_CATALOG = window.CUSTOMER_CATALOG || [
    // ── 사내 모델명 규칙에 코드가 있는 고객사 (문서 표 기준) ──
    { name: 'LNW(SG)',    code: 'S', src: 'doc', note: 'Light & Wonder (구 Scientific Games)' },
    { name: 'I.G.T',      code: 'I', src: 'doc', note: 'International Game Technology' },
    { name: 'WMS',        code: 'W', src: 'doc' },
    { name: 'EUROCOIN',   code: 'E', src: 'doc' },
    { name: 'ARISTOCRAT', code: 'A', src: 'doc' },
    { name: 'GTECH',      code: 'G', src: 'doc' },
    { name: 'ZITRO',      code: 'Z', src: 'doc' },
    { name: 'KONAMI',     code: 'K', src: 'doc' },
    // ── 이 앱 데이터에서 실제로 쓰이는 고객사 ──
    // 🏷️ [2026-10-21 사용자 지정] AMUSNET은 불가리아 회사라 지역 코드 2(EUROPEAN AREA)를 쓴다.
    //    code를 사람이 직접 적어준 경우는 "앞자리 자동 배정"과 달리 **의도된 것**이므로, 이미
    //    쓰이는 코드와 겹쳐도 충돌 경고 없이 그대로 쓴다(js/46 _mnbCustomerOptions 참고).
    //    ⚠️ 대신 모델명만 보고는 AMUSNET과 EUROPEAN AREA를 구분할 수 없다 — 코드를 공유한다는 건
    //    그런 뜻이고, 사내 규칙이 원래 그렇게 지역 코드를 폴백으로 두고 있다.
    { name: 'AMUSNET',    code: '2', src: 'app' },
    { name: 'KGI',        src: 'app' },
    { name: 'INTRALOT',   src: 'app' },
    { name: 'UNIDESA',    src: 'app' },
    // ── 조사로 보강한 카지노 게이밍 머신 제작사 (2026-10-21) ──
    //    ⚠️ 거래처 명단이 아니라 "있을 법한 후보"다. 실제 거래가 시작되면 src를 'app'으로 올릴 것.
    { name: 'NOVOMATIC',  src: 'web' },
    { name: 'AINSWORTH',  src: 'web' },
    { name: 'ARUZE',      src: 'web', note: 'Aruze Gaming' },
    { name: 'BALLY',      src: 'web', note: 'Bally Technologies' },
    { name: 'EVERI',      src: 'web' },
    { name: 'MERKUR',     src: 'web', note: 'Gauselmann' },
    { name: 'SEGA SAMMY', src: 'web' },
    { name: 'AGS',        src: 'web', note: 'PlayAGS' },
    { name: 'INSPIRED',   src: 'web', note: 'Inspired Entertainment' },
    { name: 'GAMING ARTS', src: 'web' },
    { name: 'EGT',        src: 'web', note: 'Euro Games Technology' },
    { name: 'APEX GAMING', src: 'web' },
    { name: 'CASINO TECHNOLOGY', src: 'web' },
    { name: 'JCM',        src: 'web', note: 'JCM Global' }
];

/**
 * 드롭다운에 넣을 고객사 이름 목록.
 * 카탈로그 + "이 앱이 이미 알고 있는 고객사"(열린 프로젝트·프로젝트 인덱스 캐시)를 합친다 —
 * 카탈로그에 없는 실제 거래처가 목록에서 빠져 매번 직접 타이핑하게 되는 일을 막는다.
 */
window.getCustomerOptions = function() {
    var seen = {}, out = [];
    var push = function(n) {
        n = String(n || '').trim();
        if (!n) return;
        var k = n.toUpperCase();
        if (seen[k]) return;
        seen[k] = true;
        out.push(n);
    };
    // 💡 [2026-11-12] 고객사 칸은 "고객사>프로젝트명(>세부모델)"을 한 칸에 담으므로(2026-10-22~),
    //    드롭다운엔 첫 조각(고객사명)만 올린다 — 안 그러면 프로젝트 전체 식별자가 통째로
    //    "고객사 이름"인 것처럼 섞여 들어간다.
    var pushCustomerField = function(raw) { push(String(raw || '').split('>')[0]); };
    (window.CUSTOMER_CATALOG || []).forEach(function(c) { push(c.name); });
    // 지금 열려 있는 프로젝트의 고객사
    pushCustomerField((window.projectMeta || {}).고객사);
    // project_index.json 캐시(모달 열 때 5분 캐시로 채워짐) — Drive를 새로 읽지는 않는다
    ((window._piModalCache) || []).forEach(function(p) { pushCustomerField(p && p.customer); });
    // 주소록의 회사명 — 마법사의 기존 자동완성(_npwCustAC)이 쓰던 출처다.
    //    드롭다운으로 바꾸면서 이 출처가 빠지면 "전엔 뜨던 거래처가 안 뜬다"가 되므로 같이 합친다.
    try {
        var ab = (window.tabData && window.tabData.addressBook)
              || (window.AddressBook && window.AddressBook.load && window.AddressBook.load()) || [];
        ab.forEach(function(r) { push(r && (r.company || r['고객사'])); });
    } catch (e) { /* 주소록 미로드 — 카탈로그만으로 충분하다 */ }
    return out;
};

/** 고객사 datalist를 만들고(없으면) 채운다. 입력란은 그대로 자유 입력도 된다. */
window.refreshCustomerDatalist = function() {
    var dl = document.getElementById('customer-options');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'customer-options';
        document.body.appendChild(dl);
    }
    var cat = {};
    (window.CUSTOMER_CATALOG || []).forEach(function(c) { cat[String(c.name).toUpperCase()] = c; });
    dl.innerHTML = window.getCustomerOptions().map(function(n) {
        var c = cat[n.toUpperCase()] || {};
        var label = [c.code ? '코드 ' + c.code : '', c.note || ''].filter(Boolean).join(' · ');
        return '<option value="' + String(n).replace(/"/g, '&quot;') + '">'
             + String(label).replace(/</g, '&lt;') + '</option>';
    }).join('');
    var input = document.getElementById('sum-customer');
    if (input && input.getAttribute('list') !== 'customer-options') input.setAttribute('list', 'customer-options');
};

// 입력란이 생겨 있을 때 한 번 채우고, 포커스할 때마다 최신 목록으로 갱신한다
document.addEventListener('DOMContentLoaded', function() { try { window.refreshCustomerDatalist(); } catch (e) {} });
document.addEventListener('focusin', function(e) {
    if (e.target && e.target.id === 'sum-customer') { try { window.refreshCustomerDatalist(); } catch (err) {} }
});

// ══════════════════════════════════════════════════════════════════════════
// 🔴 "이 업무가 늦었나" — **한 곳에서만** 정한다 (2026-11-09)
//
// ⚠️⚠️ 실측으로 드러난 것: 내 프로젝트 7개의 리프 2,272행 중 '완료' 는 80행(3.5%)뿐이고
//    날짜가 지난 미완료 행이 **1,501건**이었다. 그런데 그중 **1,225건(82%)이 메일에서
//    들어온 행**이다. 메일 행은 "고객이 단가를 물었다 — 2026-08-24" 같은 **사건**이지
//    누가 끝내는 **업무**가 아니다. 끝낼 수 없는 것을 1,225건 쌓아 두고 "왜 안 닫나" 를
//    물으니 아무도 안 닫는다 — 그래서 '지연' 이라는 말 자체가 뜻을 잃었다.
//    → 메일 행은 **지연으로 세지 않는다**(사람이 적은 업무만 센다: 실측 276건).
//
// ⚠️ 데이터는 **안 건드린다.** 판정만 바꾼다 — 되돌리려면 `skipMailRows` 한 줄이다.
// ⚠️ "오늘 마감·오늘 시작·이번 주" 에서는 메일 행을 **빼지 않는다** — 사건은 늦을 수 없어도
//    "오늘 들어온 것" 일 수는 있다. 빼는 건 '지연' 하나다.
// ⚠️ 메일 유래 판정은 **표식(`_mailRaw`·`＊AI📧`)이 아니라 칸 내용**으로 한다 —
//    2026-11-04 에 표식이 통째로 날아간 적이 있고, 그때도 칸 내용만 살아남았다.
// 🔗 같은 규칙이 백엔드 아침 브리핑(`kortek_backend.py` `_brief_text_for`)에도 있다 —
//    거기선 js 를 못 부르므로 **사본**이다. 한쪽만 고치면 화면과 텔레그램이 갈린다.
// ══════════════════════════════════════════════════════════════════════════
window.GANTT_OVERDUE_POLICY = window.GANTT_OVERDUE_POLICY || {
    skipMailRows: true,                  // 메일에서 들어온 행은 '지연' 으로 세지 않는다
    doneWords: ['완료', 'Done']          // 이 상태면 끝난 것
};

/** 이 행이 메일 분석으로 들어온 것인가 — **칸 내용**으로 본다. */
window._ganttRowIsMail = function (row, ci) {
    if (!row) return false;
    var c = (ci && ci.content != null && ci.content !== -1) ? String(row[ci.content] || '') : '';
    return /\[출처\]|\[핵심내용\]/.test(c);
};

/**
 * 이 행이 **늦었나**. 화면·요약·브리핑이 전부 이걸 쓴다.
 * @param nowTs 기준 시각(없으면 오늘 0시)
 */
window._ganttIsOverdue = function (row, ci, nowTs) {
    if (!row) return false;
    var P = window.GANTT_OVERDUE_POLICY || {};
    var end = row._calcPlanTs || 0;
    if (!end && ci && ci.plan != null && ci.plan !== -1) {
        var d = new Date(String(row[ci.plan] || '').replace(/[.\/]/g, '-'));
        end = isNaN(d) ? 0 : d.getTime();
    }
    if (!end) return false;
    var t0 = nowTs;
    if (!t0) { var n = new Date(); n.setHours(0, 0, 0, 0); t0 = n.getTime(); }
    if (end >= t0) return false;
    var st = (ci && ci.status != null && ci.status !== -1) ? String(row[ci.status] || '').trim() : '';
    if ((P.doneWords || []).indexOf(st) >= 0) return false;
    if (P.skipMailRows && window._ganttRowIsMail(row, ci)) return false;
    return true;
};

// 🌐 [2026-11-25] 두 언어를 같이 싣는 글자 — **한 번 만들어 두고 다시 쓰는 모달**용. 만들 때의 언어로 보이고,
//    언어를 바꾸거나(04j toggleLang) 모달이 다시 열리면(js/19 → `_applyLangLight` → js/23 `_applyInlineI18n`) 따라 바뀐다.
//    `_bi('한글','English')` → <span data-ko data-en>…</span> · `_biT(...)` → title 속성 셋 · `_biPh(...)` → placeholder 셋.
(function () {
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var cur = function (ko, en) { return window._currentLang === 'en' ? en : ko; };
    window._bi = function (ko, en) { return '<span data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(cur(ko, en)) + '</span>'; };
    window._biT = function (ko, en) { return 'title="' + esc(cur(ko, en)) + '" data-ko-title="' + esc(ko) + '" data-en-title="' + esc(en) + '"'; };
    window._biPh = function (ko, en) { return 'placeholder="' + esc(cur(ko, en)) + '" data-ko-ph="' + esc(ko) + '" data-en-ph="' + esc(en) + '"'; };
})();
