/* 🛠 [2026-10-19 신규] AI 문답 — function-calling 자율 호출 (읽기 전용)
 *
 * 왜 필요했나
 * ───────────
 * 지금까지 그룹웨어/SAP 조작은 `js/04h`에 **미리 박아둔 if 블록**이 했다. 카탈로그 어휘가
 * 걸리면 정해진 라우트를 부르고, 안 걸리면 AI에게 텍스트로만 넘겼다. 그래서 구현해 두지
 * 않은 조합("문서관리 승인 대기 보여줘")은 AI가 "지원하지 않습니다"라고 답했다 —
 * AI가 거부한 게 아니라 **부를 코드가 없었던 것**이다.
 *
 * 이 파일은 그 마지막 경로를 바꾼다. 라우트 목록을 **데이터**로 들고 있다가 AI에게 보여주고,
 * AI가 "어떤 도구를 어떤 인자로 부를지" 고르게 하고, 코드가 실행해 결과를 되먹인다.
 *
 * 설계 원칙 (CLAUDE.md)
 * ─────────────────────
 * 1. **결정론 먼저** — 기존 if 블록이 이긴다. 이 루프는 그게 전부 빗나간 뒤에만 돈다.
 * 2. **읽기만** — `mode:'read'` 도구만 호출 가능. 쓰기는 사람 확인 경로를 그대로 쓴다.
 *    AI가 엔드포인트 문자열을 고르는 게 아니라 **도구 id만** 고른다(URL 주입 차단).
 * 3. **데이터화** — 도구·인자·허용값은 아래 QA_TOOLS 한 곳. 코드에 정규식/URL 박지 않는다.
 * 4. **신호 기록** — 호출·실패를 전부 남긴다(조용히 삼키지 않는다).
 * 5. **투명** — 무엇을 어떤 인자로 불렀는지 사용자 답변에 그대로 보여준다.
 *
 * ⚠️ GAS 프록시를 거치는 구조라 공급사 네이티브 function-calling을 쓸 수 없다. 그래서 앱에
 *    이미 있는 `[[ACTION:...]]`과 같은 **텍스트 프로토콜**(`[[TOOL:id {json}]]`)을 쓴다.
 *    백엔드 변경이 필요 없고, 모델을 바꿔도 그대로 동작한다.
 */
(function () {
    'use strict';

    var BACKEND = 'http://127.0.0.1:5000';

    // ── 도구 레지스트리 (데이터) ─────────────────────────────────────
    // 새 읽기 라우트를 만들면 **여기 한 줄만** 추가하면 AI가 쓸 수 있다.
    //   path   : BACKEND 아래 경로. 반드시 '/'로 시작. AI는 이 값을 못 고른다(id만 고름).
    //   local  : path 대신 **브라우저 안 전역 함수 이름**. 앱이 이미 들고 있는 카탈로그를
    //            돌려줄 때 쓴다(백엔드·그룹웨어를 안 거치므로 로그인도 필요 없다).
    //            AI는 이 값도 못 고른다 — id만 고르고, 함수 이름은 여기 데이터에만 있다.
    //   params : name/type/desc(+enum/min/max/default). 스키마에 없는 인자는 **버린다**.
    //   requires: 'gw'면 그룹웨어 로그인 확인을 먼저 한다(실패 시 호출 자체를 안 한다).
    //   pick   : 응답에서 AI에게 넘길 배열 키(너무 큰 응답을 그대로 싣지 않기 위해).
    window.QA_TOOLS = window.QA_TOOLS || [
        // 🔑 [2026-10-20] 로그인 상태 자체를 묻는 질문용. 이게 없어서 "그룹웨어 로그인"을
        //    물으면 일반 AI로 떨어져 "데이터에 없습니다 — IT에 문의하세요"라고 답했다.
        //
        //    ⚠️⚠️ **여기에 requires:'gw'를 달면 안 된다.** 선검사(_gwEnsureLogin)가 먼저
        //    돌아 로그아웃이면 호출 자체를 막아버리므로, 정작 "로그인 됐어?"라는 질문에
        //    영영 답할 수 없게 된다. 상태 조회는 로그인 여부와 무관하게 돌아야 한다.
        //
        //    ⚠️ 상태만 본다 — 여기서 자동 로그인을 **하지 않는다**. "로그인 됐어?"라고
        //    물었는데 말없이 로그인시켜 버리면 안 되기 때문이다. 실제 그룹웨어 조회 명령은
        //    requires:'gw' 선검사가 알아서 1회 자동 로그인한다.
        //
        //    ⚠️ /gw/status는 로그아웃일 때 {ok:false, message:'로그인이 필요합니다.'}를
        //    준다. 라우터는 ok:false를 "호출 실패"로 적지만 steps에는 그대로 실려 AI가
        //    사유를 보고 답한다 — 그래서 별도 처리가 필요 없다.
        {
            id: 'gw_status', mode: 'read',
            title: '그룹웨어 로그인 상태',
            desc: '그룹웨어에 로그인되어 있는지와 내 계정(로그인ID·이메일·회사)을 확인한다. '
                + '로그인되어 있지 않으면 ok=false와 사유를 돌려준다 — 그건 조회 실패가 아니라 '
                + '"로그인되어 있지 않다"는 답이므로 그대로 그렇게 답하라. '
                + '이런 질문에 쓴다: "그룹웨어 로그인 됐어?", "그룹웨어 연결 상태", '
                + '"그룹웨어 세션 살아 있어?", "그룹웨어 끊겼어?", "그룹웨어 로그인 풀렸나", '
                + '"그룹웨어 지금 어느 계정으로 접속돼 있어?", "다우오피스 접속 확인해줘", '
                + '"그룹웨어 로그인 상태 알려줘".',
            path: '/gw/status',
            params: []
        },
        // ── 🧑‍💼 인사관리(kInsa) ─ 읽기 전용 ───────────────────────────────
        //  화면 주소는 코드에 박지 않는다 — `insa_menu_catalog.json`(관찰로 학습한 데이터)에서
        //  가져온다. 새 화면이 생기면 "인사관리 화면 학습해줘" 한 번이면 목록이 늘어난다.
        {
            id: 'insa_workplan_form', mode: 'read', requires: 'insa',
            title: '근무계획 수정 신청서 현재 내용',
            // ⚠️ [2026-10-21 실사용] "행 하나 추가해줘"에 AI가 되묻기만 하고, 다음엔 date 없이
            //    쓰기를 호출해 "필수 인자 누락"으로 끝났다. **지금 행을 볼 눈이 없었기 때문**이다.
            //    insa_fill_workplan 의 days 는 "최종 상태" 목록이라, 더하려면 먼저 읽어야 한다.
            desc: '지금 열려 있는 근무계획 수정 신청서에 **어떤 행이 들어 있는지** 읽는다'
                + '(날짜·변경 후 출퇴근·식사유형·비고·제목·사유). '
                + '"행 하나 추가해줘", "하루 더 넣어줘"처럼 **기존 내용에 더하는 요청이면 반드시 먼저 이걸 호출해** '
                + '지금 행을 확인하고, insa_fill_workplan 의 days 에 **기존 행 + 새 행을 전부** 담아라. '
                + 'days 는 최종 상태라서 새 행만 보내면 기존 행이 지워진다.',
            path: '/insa/workplan-form',
            params: []
        },
        {
            id: 'insa_overtime_form', mode: 'read', requires: 'insa',
            title: '연장근무 신청서 현재 내용',
            // insa_workplan_form 과 같은 이유(2026-10-27) — insa_fill_overtime 의 days 도
            // "최종 상태" 목록이라, 행을 더하려면 먼저 지금 행을 봐야 한다.
            desc: '지금 열려 있는 연장근무 신청서에 **어떤 행이 들어 있는지** 읽는다'
                + '(날짜·변경 후 출퇴근·식사유형·비고). '
                + '"행 하나 추가해줘"처럼 **기존 내용에 더하는 요청이면 반드시 먼저 이걸 호출해** '
                + '지금 행을 확인하고, insa_fill_overtime 의 days 에 **기존 행 + 새 행을 전부** 담아라.',
            path: '/insa/overtime-form',
            params: []
        },
        {
            id: 'insa_annual_plan_status', mode: 'read', requires: 'insa',
            title: '연차휴가사용계획서 작성 대상 여부',
            // ⚠️ 읽기 전용이다 — 열거나 채우지 않는다(법정 연차 문서라 쓰기 자체가 없음, docs/insa-hr.md).
            desc: '이번 기(반기) 연차휴가사용계획서를 **써야 하는지/이미 썼는지**만 확인한다. '
                + '작성이 필요하면 인사관리 화면에서 직접 하라고 안내한다(이 도구·앱은 대신 작성하지 않는다). '
                + '"연차 계획서 써야 돼?", "연차 사용계획 제출했나?" 같은 질문에 쓴다.',
            path: '/insa/annual-plan-status', params: []
        },
        {
            id: 'insa_menus', mode: 'read', requires: 'insa',
            title: '인사관리 화면 목록',
            desc: '사내 인사관리(kInsa)에서 볼 수 있는 화면 목록을 돌려준다. '
                + '어떤 화면이 있는지 먼저 확인한 뒤 insa_screen 으로 내용을 읽는 식으로 쓴다. '
                + '이런 질문에 쓴다: "인사관리에서 뭘 볼 수 있어?", "인사 메뉴 목록", '
                + '"인사관리 화면 뭐뭐 있어?".',
            path: '/insa/menus', pick: 'menus',
            params: []
        },
        {
            id: 'insa_screen', mode: 'read', requires: 'insa',
            title: '인사관리 화면 읽기',
            // ⚠️ [2026-10-21 실사용] "연장근무 신청내역 보여줘"에 **4번** 호출하고서야 맞췄다.
            //    ① 연차 안내를 너무 강조해 둬서 엉뚱하게 '근무 계획'부터 열었고
            //    ② code 에 **순번('9')을 지어냈다**. 질문 → 화면 대응표를 주고,
            //    code 는 "목록의 이름을 그대로"라고 못박는다. desc 가 AI의 유일한 판단 근거다.
            desc: '인사관리 화면 하나를 열어 내용을 글자로 읽어 온다. '
                + '[어떤 질문에 어느 화면인지] '
                + '연차 잔여·발생·사용일수, 이번달 근무시간/소정/연장 집계 → "근무 계획". '
                + '연장근무 신청한 내역·결재상태 → "연장근무 신청내역". '
                + '연차 신청서 목록 → "연차휴가사용계획서목록"(여기엔 잔여일수가 없다). '
                + '의료비 신청 → "의료비", 학자금 신청 → "학자금", '
                + '근무계획 수정 이력 → "근무계획 수정내역", 결재선 → "설정". '
                + '한 화면만 열면 되는 질문에 여러 화면을 열지 말 것. '
                + '어떤 화면이 있는지 모르겠으면 insa_menus 로 먼저 목록을 보라.',
            path: '/insa/screen', pick: 'text',
            params: [
                { name: 'code', type: 'text', max: 40,
                  desc: 'insa_menus 가 돌려준 **label 을 그대로** 넣는다(예: "근무 계획", "연장근무 신청내역"). '
                      + '⚠️ 순번이나 숫자를 지어내지 말 것 — 코드는 "11", "OW", "AP" 같은 고정 문자열이고 '
                      + '목록의 몇 번째인지와 무관하다. 확실하지 않으면 이름을 쓰는 쪽이 안전하다.' }
            ]
        },
        {
            id: 'gw_mail', mode: 'read', requires: 'gw',
            title: '그룹웨어 메일 목록',
            desc: '사내 그룹웨어 웹메일함을 기간/폴더/안읽음으로 조회한다. 메일을 열지 않으므로 읽음 처리되지 않고, 각 항목에 본문 발췌(preview)가 들어 있다.',
            path: '/gw/mail/recent', pick: 'mails',
            params: [
                { name: 'from', type: 'date', desc: '시작일 YYYY-MM-DD (기본: 어제)' },
                { name: 'to', type: 'date', desc: '종료일 YYYY-MM-DD (생략하면 오늘까지)' },
                { name: 'folder', type: 'enum', enum: ['Inbox', 'Sent', 'Drafts', 'Trash'], def: 'Inbox', desc: '메일함' },
                { name: 'unread', type: 'bool', desc: '1이면 안읽은 메일만' },
                { name: 'keyword', type: 'text', max: 40, desc: '제목·본문 검색어' },
                { name: 'limit', type: 'int', min: 1, max: 80, def: 40, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_board', mode: 'read', requires: 'gw',
            title: '그룹웨어 게시판 게시물',
            desc: '사내 게시판(공지사항·인사발령·IT공지·식단표 등) 게시물을 기간으로 조회한다. 항목에 본문 발췌가 들어 있다.',
            path: '/gw/board/recent', pick: 'posts',
            params: [
                { name: 'from', type: 'date', desc: '시작일 YYYY-MM-DD' },
                { name: 'to', type: 'date', desc: '종료일 YYYY-MM-DD' },
                { name: 'boardId', type: 'int', min: 1, max: 99999, desc: '특정 게시판만 (gw_board_list로 id 확인)' },
                { name: 'limit', type: 'int', min: 1, max: 80, def: 40, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_board_list', mode: 'read', requires: 'gw',
            title: '그룹웨어 게시판 목록',
            desc: '볼 수 있는 게시판 이름과 id 목록. 특정 게시판만 보려면 먼저 이걸로 id를 찾는다.',
            path: '/gw/boards', pick: 'boards', params: []
        },
        {
            id: 'gw_board_post', mode: 'read', requires: 'gw',
            title: '그룹웨어 게시물 본문',
            desc: '게시물 1건의 본문 전체. 발췌만으로 부족할 때만 쓴다. 본문이 이미지뿐이면 bodyNote에 그 사유가 온다.',
            path: '/gw/board/post',
            params: [
                { name: 'boardId', type: 'int', min: 1, max: 99999, req: true, desc: '게시판 id' },
                { name: 'postId', type: 'int', min: 1, max: 9999999, req: true, desc: '게시물 id' }
            ]
        },
        {
            id: 'gw_works_apps', mode: 'read', requires: 'gw',
            title: 'Works 앱(미니 폼) 목록',
            desc: 'IT 렌트·리조트 예약·법인카드 한도증액 등 사내 Works 미니앱 목록과 id. '
                + '특정 앱의 신청 내역을 보려면 먼저 이걸로 appletId를 찾는다.',
            path: '/gw/works/apps', pick: 'apps', params: []
        },
        {
            id: 'gw_works_list', mode: 'read', requires: 'gw',
            title: 'Works 앱 신청 내역',
            desc: 'Works 미니앱 하나의 최근 신청/등록 목록. 앱마다 칸 구성이 달라 응답의 각 항목은 '
                + '그 앱의 실제 칸 이름(한글)을 키로 쓴다 — 고정된 스키마가 아니다. '
                + 'appletId를 모르면 gw_works_apps로 먼저 찾는다.',
            path: '/gw/works/list', pick: 'docs',
            params: [
                { name: 'appletId', type: 'int', min: 1, max: 99999, req: true, desc: 'Works 앱 id (gw_works_apps로 확인)' },
                { name: 'limit', type: 'int', min: 1, max: 60, def: 20, desc: '최대 건수' },
                { name: 'keyword', type: 'text', max: 100, desc: '검색어(제목 등)' }
            ]
        },
        {
            id: 'gw_report_folders', mode: 'read', requires: 'gw',
            title: '그룹웨어 보고 시리즈 목록',
            desc: '부서별 정기/비정기 보고(주간업무보고 등) 시리즈 이름과 folderId 목록. '
                + '특정 보고만 보려면 먼저 이걸로 folderId를 찾는다.',
            path: '/gw/report/folders', pick: 'folders', params: []
        },
        {
            id: 'gw_report_list', mode: 'read', requires: 'gw',
            title: '그룹웨어 보고 목록',
            desc: '최근 제출된 보고(주간업무보고 등) 목록. folderId를 주면 그 시리즈만. '
                + 'folderId를 모르면 gw_report_folders로 먼저 찾는다.',
            path: '/gw/report/list', pick: 'reports',
            params: [
                { name: 'folderId', type: 'int', min: 1, max: 99999, desc: '보고 시리즈 id (gw_report_folders로 확인)' },
                { name: 'limit', type: 'int', min: 1, max: 60, def: 20, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_report_detail', mode: 'read', requires: 'gw',
            title: '그룹웨어 보고 본문',
            desc: '보고 1건의 본문 전체. 발췌만으로 부족할 때만 쓴다. id는 gw_report_list로 찾는다.',
            path: '/gw/report/detail',
            params: [
                { name: 'id', type: 'int', min: 1, max: 9999999, req: true, desc: '보고 id' }
            ]
        },
        {
            id: 'gw_todo_boards', mode: 'read', requires: 'gw',
            title: 'ToDO+ 칸반 보드 목록',
            desc: '내가 속한 ToDO+(칸반) 보드 이름과 id. 카드를 보려면 먼저 이걸로 boardId를 찾는다.',
            path: '/gw/todo/boards', pick: 'boards', params: []
        },
        {
            id: 'gw_todo_items', mode: 'read', requires: 'gw',
            title: 'ToDO+ 카드 목록',
            desc: 'ToDO+ 보드 1개의 카드(할일) 목록, 최신 수정순. boardId를 모르면 gw_todo_boards로 먼저 찾는다.',
            path: '/gw/todo/items', pick: 'items',
            params: [
                { name: 'boardId', type: 'int', min: 1, max: 99999, req: true, desc: '보드 id (gw_todo_boards로 확인)' },
                { name: 'limit', type: 'int', min: 1, max: 80, def: 30, desc: '최대 건수' },
                { name: 'keyword', type: 'text', max: 100, desc: '검색어(카드 제목·칸 이름)' }
            ]
        },
        {
            id: 'gw_calendar', mode: 'read', requires: 'gw',
            title: '그룹웨어 일정',
            desc: '사내 캘린더 일정을 기간으로 조회한다.',
            path: '/gw/events', pick: 'events',
            params: [
                { name: 'from', type: 'date', desc: '시작일 YYYY-MM-DD' },
                { name: 'to', type: 'date', desc: '종료일 YYYY-MM-DD' }
            ]
        },
        {
            id: 'gw_approval_box', mode: 'read', requires: 'gw',
            title: '전자결재 문서함',
            desc: '내 전자결재 문서함을 본다. 기안함/임시저장함/결재함(내가 결재할 차례)/참조열람함.',
            path: '/gw/approval/doclist', pick: 'docs',
            params: [
                { name: 'box', type: 'enum', enum: ['draft', 'tempsave', 'approve', 'viewer', 'all'], def: 'draft',
                  desc: 'draft=내가 기안한 것 / tempsave=임시저장 / approve=내가 결재한·할 것 / viewer=참조·열람 / all=문서함 전부. '
                      + '⚠️ draft 는 **내가 올린 문서만** 보인다 — 문서번호(RD3-2610-050 같은)로 찾을 때는 남이 올린 문서일 수 있으니 반드시 all 을 써라.' },
                { name: 'searchtype', type: 'enum',
                  enum: ['title', 'drafterName', 'drafterDeptName', 'formName', 'docNum', 'activityUserName'],
                  desc: '검색 대상 필드. ⚠️ 엉뚱한 필드로 찾으면 조용히 0건이 온다 — 사내 승인원 문서는 제목이 영문(Customer Approval Sheet...)이라 "승인원"은 title이 아니라 formName으로 찾아야 걸린다. 0건이면 다른 필드로 한 번 더 시도해라.' },
                { name: 'keyword', type: 'text', max: 40, desc: '검색어 (searchtype과 함께 써야 한다)' },
                { name: 'duration', type: 'enum', enum: ['all', '1', '6', '12'], def: 'all', desc: '기간(개월)' },
                { name: 'limit', type: 'int', min: 1, max: 50, def: 20, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_docs', mode: 'read', requires: 'gw',
            title: '문서관리 문서',
            desc: '사내 문서관리(DMS) 문서 목록. 승인/등록 대기 중인 것과 내가 최근 열람한 것.',
            path: '/gw/docs', pick: 'docs',
            params: [
                { name: 'kind', type: 'enum', enum: ['latestread', 'approvewaiting', 'registwaiting', 'favorite'],
                  def: 'latestread', desc: 'latestread=최근 열람 / approvewaiting=승인 대기 / registwaiting=등록 대기 / favorite=즐겨찾기' },
                { name: 'limit', type: 'int', min: 1, max: 50, def: 20, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_asset_list', mode: 'read', requires: 'gw',
            title: '예약 자원 목록',
            desc: '예약할 수 있는 자원(회의실·차량 등)의 이름과 id. 특정 자원만 보려면 먼저 이걸로 id를 찾는다.',
            path: '/gw/assets', pick: 'assets', params: []
        },
        {
            id: 'gw_asset_items', mode: 'read', requires: 'gw',
            title: '예약 자원의 세부 항목',
            desc: '자원 안의 개별 항목(회의실 각 방, 차량 각 대)과 그 itemId. 예약을 만들려면 itemId가 필요하다.',
            path: '/gw/asset/items', pick: 'items',
            params: [
                { name: 'assetId', type: 'int', min: 1, max: 99999, req: true, desc: '자원 id (gw_asset_list로 확인)' }
            ]
        },
        {
            id: 'gw_asset_reservations', mode: 'read', requires: 'gw',
            title: '예약 현황',
            desc: '해당 날짜의 회의실·차량 예약 현황(시간·사용자). 비어 있는 시간을 찾을 때도 이걸 본다.',
            path: '/gw/asset/reservations', pick: 'reservations',
            params: [
                { name: 'date', type: 'date', desc: '날짜 YYYY-MM-DD (기본: 오늘)' },
                { name: 'assetId', type: 'int', min: 1, max: 99999, desc: '특정 자원만 (gw_asset_list로 id 확인)' }
            ]
        },
        {
            id: 'gw_community_feed', mode: 'read', requires: 'gw',
            title: '커뮤니티 최신 글',
            desc: '내가 가입한 사내 커뮤니티의 최신 게시물 피드.',
            path: '/gw/community/feed', pick: 'posts',
            params: [{ name: 'limit', type: 'int', min: 1, max: 50, def: 20, desc: '최대 건수' }]
        },
        {
            id: 'gw_community_list', mode: 'read', requires: 'gw',
            title: '커뮤니티 목록',
            desc: '사내 커뮤니티 목록(이름·멤버수·글수·가입 여부).',
            path: '/gw/communities', pick: 'communities',
            params: [{ name: 'limit', type: 'int', min: 1, max: 50, def: 30, desc: '최대 건수' }]
        },
        {
            id: 'gw_surveys', mode: 'read', requires: 'gw',
            title: '설문',
            desc: '사내 설문 목록. 내가 응답해야 하는 것(todo)과 최근 설문(latest).',
            path: '/gw/surveys', pick: 'surveys',
            params: [
                { name: 'kind', type: 'enum', enum: ['todo', 'latest'], def: 'latest', desc: 'todo=응답 대기 / latest=최근' },
                { name: 'limit', type: 'int', min: 1, max: 50, def: 20, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_webfolder', mode: 'read', requires: 'gw',
            title: '자료실 폴더/파일',
            desc: '사내 자료실의 폴더와 파일 목록. 하위로 들어갈 때는 path에 그 폴더 경로를 넣는다.',
            path: '/gw/webfolder', pick: 'items',
            params: [
                { name: 'path', type: 'text', max: 120, def: '/', desc: '폴더 경로 (기본 루트 /)' },
                { name: 'scope', type: 'enum', enum: ['public', 'user'], def: 'public', desc: 'public=공용 / user=개인' },
                { name: 'limit', type: 'int', min: 1, max: 50, def: 30, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_approval_read', mode: 'read', requires: 'gw',
            title: '전자결재 문서 내용',
            desc: '전자결재 문서 하나를 **문서번호로 열어 내용 전부**를 읽는다 — 제목·입력칸 값·체크된 항목·결재선·첨부 목록. '
                + '"RD3-2610-050 내용 보여줘", "그 기안 뭐라고 썼어?" 같은 질문에 쓴다. '
                + '같은 기안을 새로 만들어 달라는 요청이면 이걸로 먼저 읽어서 내용을 보여주고, 복사 실행은 사람 확인을 거친다.',
            path: '/gw/approval/read', pick: null,
            params: [
                { name: 'docNum', type: 'text', max: 30, desc: '문서번호 (예: RD3-2610-050)' },
                { name: 'docId', type: 'text', max: 20, desc: '문서 id — 문서번호를 모를 때만' }
            ]
        },
        {
            id: 'gw_approval_search', mode: 'read', requires: 'gw',
            title: '전자결재 문서 검색',
            desc: '전자결재 문서를 키워드로 통합검색한다(제목·양식명·기안자 등). '
                + '⚠️ 기본이 **승인원 양식만** 보는 것이라, 승인원이 아닌 문서는 0건으로 나온다 — '
                + '일반 문서를 찾을 땐 onlyApprovalForm=0 을 꼭 같이 줘라. '
                + '그래도 0건이면 gw_approval_box 를 box=all·searchtype=docNum 으로 한 번 더 시도해라.',
            path: '/gw/approval/search', pick: 'items',
            params: [
                { name: 'keyword', type: 'text', max: 40, req: true, desc: '검색어' },
                { name: 'onlyApprovalForm', type: 'enum', enum: ['0', '1'], def: '0',
                  desc: '1이면 제목에 승인원 표시가 있는 문서만 남긴다(승인원 Revision History 판단용). 일반 검색은 0.' }
            ]
        },
        // ── 📇🔔💬 [2026-10-22 신규] 주소록 · 알림 · 쪽지 (전부 읽기) ─────────
        //  조사 기록은 docs/groupware.md 11절. 경로·파라미터는 **번들과 실측으로 확정**했다.
        {
            id: 'gw_contacts', mode: 'read', requires: 'gw',
            title: '사내 주소록 검색',
            desc: '사내 주소록에서 사람을 찾는다 — 이름·직위·부서·회사·이메일·휴대폰·내선번호. '
                + '"박성준 연락처 알려줘", "개발3팀 사람들 이메일", "홍길동 내선번호 뭐야?", '
                + '"그 사람 메일주소 찾아줘" 같은 질문에 쓴다. '
                + 'keyword 는 이름뿐 아니라 부서·회사·이메일에도 걸린다. 비우면 전체(가나다순)다. '
                + '총 건수(total)가 limit 보다 크면 더 있다는 뜻이니, 사람을 특정해야 하면 keyword 를 좁혀서 다시 불러라. '
                + '⚠️ 앱 안에도 자체 Address Book(주소록 탭)이 따로 있다 — 이 도구는 **그룹웨어** 쪽이다.',
            path: '/gw/contacts', pick: 'contacts',
            params: [
                { name: 'keyword', type: 'text', max: 30, def: '',
                  desc: '검색어(이름·부서·회사·이메일). 비우면 전체' },
                { name: 'limit', type: 'int', min: 1, max: 100, def: 20, desc: '최대 건수' },
                { name: 'page', type: 'int', min: 0, max: 50, def: 0, desc: '페이지(0부터)' }
            ]
        },
        {
            id: 'gw_notifications', mode: 'read', requires: 'gw',
            title: '그룹웨어 알림',
            desc: '그룹웨어 알림 목록 — 결재 도착/반려/회수, 게시글 등록, 참조자 등록 같은 소식이다. '
                + '"알림 뭐 왔어?", "놓친 거 있어?", "결재 올 거 있나?", "안 읽은 알림 보여줘", '
                + '"그룹웨어에 새 소식 있어?" 같은 질문에 쓴다. '
                + 'category 로 모듈을 좁힌다: all(전체) · unread(안읽음) · approval(전자결재) · bbs(게시판) · '
                + 'mail · calendar · asset(예약) · docs · survey · community · report · task · todo · works 등. '
                + '실측상 대부분이 approval 이고 mail·calendar 는 0건일 수 있다 — 0건은 "그 모듈 알림이 없다"는 뜻이다. '
                + '⚠️ 목록만 읽는다 — 읽음 처리는 하지 않으니 안심하고 불러도 된다.',
            path: '/gw/notifications', pick: 'notifications',
            params: [
                { name: 'category', type: 'enum',
                  enum: ['all', 'unread', 'approval', 'asset', 'bbs', 'calendar', 'channel',
                         'community', 'docs', 'ehr', 'mail', 'manager', 'openapi', 'report',
                         'survey', 'task', 'todo', 'webfolder', 'works'],
                  def: 'all', desc: '알림 분류' },
                { name: 'limit', type: 'int', min: 1, max: 60, def: 15, desc: '최대 건수' }
            ]
        },
        {
            id: 'gw_notes', mode: 'read', requires: 'gw',
            title: '쪽지 목록',
            desc: '그룹웨어 **쪽지**(메신저 쪽지함) 목록 — 보낸사람·받는사람·제목·본문 미리보기·날짜·읽음여부. '
                + '"쪽지 뭐 왔어?", "쪽지함 보여줘", "안 읽은 쪽지 있어?" 같은 질문에 쓴다. '
                + '⚠️ 메일(gw_mail)과 다른 것이다 — 쪽지는 사내 짧은 알림용이고 보통 건수가 아주 적다. '
                + '서버가 검색어 필터를 지원하지 않아 **최근 목록만** 받아온다 — 특정 쪽지를 찾아야 하면 '
                + '받아온 목록 안에서 골라라. 읽기 전용이다(보내기·삭제 경로는 만들지 않았다).',
            path: '/gw/notes', pick: 'notes',
            params: [
                { name: 'limit', type: 'int', min: 1, max: 50, def: 10, desc: '최대 건수' }
            ]
        },
        // 📋 [2026-10-22] 기안 **양식(문서 종류)** 카탈로그 — 로컬 데이터라 그룹웨어를 안 거친다.
        //    왜 필요한가: 기안 요청은 양식마다 칸이 완전히 다른데, AI 에게 그 목록이 없어서
        //    "어떤 기안 올릴 수 있어?"에 답을 못 하고 양식을 **지어냈다**. 최근 문서를 실제로
        //    읽어 확인한 칸 이름이 js/52 카탈로그에 있으니 그걸 그대로 보여준다.
        {
            id: 'gw_approval_forms', mode: 'read',
            title: '전자결재 기안 양식(문서 종류) 목록',
            desc: '앱이 **칸 단위로 채울 수 있는** 전자결재 기안 양식 목록과, 양식마다 어떤 칸이 있고 '
                + '무엇을 같이 줘야 채워지는지를 돌려준다. '
                + '"어떤 기안 작성할 수 있어?", "기안 양식 뭐 있어?", "프로젝트코드 등록 신청서는 무슨 칸이 있어?", '
                + '"원자재 코드등록 기안에 뭐가 필요해?" 같은 질문에 쓴다. '
                + '사용자가 기안을 만들어 달라고 했는데 어느 양식인지 애매할 때도 이걸로 먼저 목록을 보여주고 고르게 하라. '
                + '⚠️ 여기 없는 양식도 사내에 많다(97개) — 목록에 없으면 "앱이 칸까지 채우지는 못한다"는 뜻이지 '
                + '"그런 양식이 없다"는 뜻이 아니다. 그때는 기존 문서를 틀로 삼아 복사하는 방법을 안내하라. '
                + '칸을 "아직 안 읽음"으로 돌려주는 양식은 칸 목록을 **지어내지 말고** 그대로 모른다고 답하라.',
            local: '_apvDocTypeTool', pick: 'forms',
            params: [
                { name: 'form', type: 'text', max: 40, desc: '특정 양식 이름(일부만도 됨). 비우면 전체 목록 + 양식별 칸 개수' }
            ]
        },
        {
            id: 'qa_unclassified_mail', mode: 'read',
            title: '업무 보관함 미분류 메일 건수',
            // ⚠️ [2026-10-27 실사용 제보] "미분류 메일 몇 건이야?"가 전용 도구가 없어 그룹웨어
            //    안읽은 메일 수(완전히 다른 값)로 잘못 답했다. "미분류"는 이 앱 자체 개념
            //    (업무 보관함 대기 큐 중 프로젝트 매칭이 안 된 것)이라 그룹웨어/SAP에는 없다 —
            //    그룹웨어 메일/캘린더 도구와 절대 헷갈리지 말 것.
            desc: '이 앱의 업무 보관함(메일 자동수집 큐) 중 **프로젝트로 안 걸린(미분류)** 메일 건수와 '
                + '목록 일부를 돌려준다. "미분류 메일 몇 건이야?", "업무 보관함에 미분류 몇 개 있어?" '
                + '같은 질문에 쓴다. **그룹웨어 안읽은 메일 수와는 다른 값이다** — 혼동해서 그룹웨어 '
                + '메일 도구로 답하지 말 것. 메일 서버 탭을 연 적이 없으면 0건으로 나올 수 있다.',
            local: '_qaUnclassifiedMailStatus', pick: 'mails',
            params: []
        }
    ];


    // ── 호출 기록 (Phase 10 학습 신호) ───────────────────────────────
    // 조용히 삼키지 않는다 — 어떤 질문이 어떤 도구로 갔고 성공했는지 남겨야
    // "AI가 엉뚱한 도구를 고른다"를 나중에 시그니처로 묶을 수 있다(CLAUDE.md 1·3·6).
    var LOG_KEY = 'gantt_qa_tool_log_v1';
    var LOG_MAX = 300;

    window._qaLogToolCall = function (question, r) {
        try {
            var arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
            arr.push({ t: Date.now(), q: String(question || '').slice(0, 200),
                       id: r.id, args: r.args || {}, ok: !!r.ok,
                       count: (r.count === undefined ? null : r.count),
                       msg: String(r.message || '').slice(0, 160) });
            if (arr.length > LOG_MAX) arr = arr.slice(-LOG_MAX);
            localStorage.setItem(LOG_KEY, JSON.stringify(arr));
        } catch (e) { /* 저장 실패가 조회를 막으면 안 된다 */ }
        if (!r.ok && window._issueLog) {
            try {
                window._issueLog({ kind: 'qa_tool_fail', tool: r.id,
                                   args: r.args || {}, message: r.message || '',
                                   question: String(question || '').slice(0, 200) });
            } catch (e) { /* 수집기 없거나 꺼져 있을 수 있다 */ }
        }
    };

    window._qaToolLogRead = function () {
        try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
    };

    // 새 localStorage 저장소는 정리 규칙에 등록한다(docs/mail-pipeline.md)
    if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY[LOG_KEY]) {
        window.STORAGE_REGISTRY[LOG_KEY] = {
            label: 'AI 문답 도구 호출 로그', keep: LOG_MAX,
            prune: function () {
                try {
                    var a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
                    if (a.length > LOG_MAX) localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(-LOG_MAX)));
                } catch (e) {}
            }
        };
    }

    // ── 인자 검증 (AI가 준 값을 그대로 URL에 싣지 않는다) ────────────
    var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    window._qaValidateToolArgs = function (tool, raw) {
        var args = {}, notes = [];
        var given = (raw && typeof raw === 'object') ? raw : {};
        // 스키마에 없는 키는 버린다 — AI가 limit=9999, path=... 같은 걸 끼워 넣어도 통하지 않는다
        Object.keys(given).forEach(function (k) {
            var known = (tool.params || []).some(function (p) { return p.name === k; });
            if (!known) notes.push('무시된 인자: ' + k);
        });
        // 값이 규격을 벗어나면 **기본값으로 떨어뜨린다** — 인자를 통째로 빼면
        // 서버 기본값이 적용돼 "사용자가 말한 것과 다른 조회"가 조용히 일어난다.
        var reject = function (name, why) {
            notes.push(why);
            var pp = (tool.params || []).find(function (x) { return x.name === name; });
            if (pp && pp.def !== undefined) args[name] = pp.def;
        };
        for (var i = 0; i < (tool.params || []).length; i++) {
            var p = tool.params[i];
            var v = given[p.name];
            if (v === undefined || v === null || v === '') {
                if (p.req) return { error: '필수 인자 누락: ' + p.name };
                if (p.def !== undefined) args[p.name] = p.def;
                continue;
            }
            if (p.type === 'date') {
                var s = String(v).trim();
                if (!DATE_RE.test(s)) { reject(p.name, '날짜 형식이 아니라 무시: ' + p.name + '=' + s); continue; }
                args[p.name] = s;
            } else if (p.type === 'int') {
                var n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
                if (isNaN(n)) { reject(p.name, '숫자가 아니라 무시: ' + p.name); continue; }
                if (p.min !== undefined && n < p.min) n = p.min;
                if (p.max !== undefined && n > p.max) n = p.max;   // 상한은 조용히 깎는다(과다 조회 방지)
                args[p.name] = n;
            } else if (p.type === 'bool') {
                args[p.name] = (v === true || v === 1 || /^(1|true|yes|y|on)$/i.test(String(v))) ? 1 : 0;
                if (!args[p.name]) delete args[p.name];
            } else if (p.type === 'enum') {
                var hit = (p.enum || []).find(function (e) { return String(e).toLowerCase() === String(v).trim().toLowerCase(); });
                if (!hit) { reject(p.name, '허용값이 아니라 무시: ' + p.name + '=' + v); continue; }
                args[p.name] = hit;
            } else {
                var t = String(v).trim().slice(0, p.max || 100);
                if (t) args[p.name] = t;
            }
        }
        return { args: args, notes: notes };
    };

    // ── 도구 실행 ────────────────────────────────────────────────────
    window._qaToolById = function (id) {
        return (window.QA_TOOLS || []).find(function (t) { return t.id === String(id || '').trim(); }) || null;
    };

    window._qaRunTool = async function (id, rawArgs) {
        var tool = window._qaToolById(id);
        if (!tool) {
            // 💡 [2026-10-21] AI가 **쓰기 도구를 [[TOOL:]]로** 부르는 일이 잦다(실측). 그때 "없는 도구"라고만
            //    하면 다음 턴에도 같은 실수를 반복한다 — 어느 태그를 써야 하는지 알려 준다.
            var w = window._qaWriteToolById && window._qaWriteToolById(id);
            if (w) {
                return { ok: false, id: id,
                         message: '이건 실행(쓰기) 도구다 — 조회 태그 [[TOOL:]]로는 부를 수 없다. '
                                + '필요하면 [[WRITE:' + id + ' {...}]] 로 초안을 내라(사람 확인 뒤 실행된다).' };
            }
            return { ok: false, id: id, message: '없는 도구입니다: ' + id };
        }
        // 🔒 읽기 전용 가드 — 쓰기 도구는 이 루프로 절대 실행하지 않는다
        if (tool.mode !== 'read') return { ok: false, id: id, message: '읽기 전용 루프에서는 실행할 수 없는 도구입니다: ' + id };
        if (!tool.local && String(tool.path || '').charAt(0) !== '/') return { ok: false, id: id, message: '도구 경로가 잘못됐습니다.' };

        var v = window._qaValidateToolArgs(tool, rawArgs);
        if (v.error) return { ok: false, id: id, message: v.error };

        // 🗂 로컬 카탈로그 도구 — 앱이 이미 들고 있는 데이터라 네트워크를 안 탄다.
        //    함수 이름은 **레지스트리(데이터)에만** 있다. AI가 임의 전역 함수를 부를 수는 없다.
        if (tool.local) {
            var fn = window[tool.local];
            if (typeof fn !== 'function') {
                // 조용히 빈 결과를 주지 않는다 — 스크립트가 안 실린 건 "데이터가 없다"와 다른 일이다.
                return { ok: false, id: id, args: v.args, notes: v.notes,
                         message: '로컬 도구가 로드되지 않았습니다: ' + tool.local };
            }
            try {
                var ld = await fn(v.args);
                var lrows = tool.pick ? ((ld || {})[tool.pick] || []) : ld;
                return { ok: true, id: id, args: v.args, notes: v.notes, data: ld, rows: lrows,
                         count: Array.isArray(lrows) ? lrows.length : null };
            } catch (e2) {
                return { ok: false, id: id, args: v.args, notes: v.notes,
                         message: (e2 && e2.message) ? e2.message : String(e2) };
            }
        }

        var qs = Object.keys(v.args).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(v.args[k]);
        }).join('&');
        var url = BACKEND + tool.path + (qs ? '?' + qs : '');

        try {
            var res = window._withTimeout
                ? await window._withTimeout(fetch(url), 120000, '도구 호출 시간 초과: ' + id)
                : await fetch(url);
            var d = await res.json();
            if (!d || d.ok === false) {
                return { ok: false, id: id, args: v.args, notes: v.notes, message: (d && d.message) || ('HTTP ' + res.status) };
            }
            var rows = tool.pick ? (d[tool.pick] || []) : d;
            return { ok: true, id: id, args: v.args, notes: v.notes, data: d, rows: rows,
                     count: Array.isArray(rows) ? rows.length : null };
        } catch (e) {
            return { ok: false, id: id, args: v.args, notes: v.notes, message: (e && e.message) ? e.message : String(e) };
        }
    };

    // ── 프롬프트에 실을 도구 설명 ────────────────────────────────────
    window._qaToolsSpec = function () {
        var lines = [];
        (window.QA_TOOLS || []).forEach(function (t) {
            if (t.mode !== 'read') return;
            var ps = (t.params || []).map(function (p) {
                var d = p.name + '(' + p.type + (p.req ? ', 필수' : '') + (p.enum ? ': ' + p.enum.join('|') : '') + ')';
                return d + ' — ' + p.desc;
            });
            lines.push('- `' + t.id + '` : ' + t.title + ' — ' + t.desc);
            if (ps.length) lines.push('    인자: ' + ps.join(' / '));
            else lines.push('    인자: 없음');
        });
        return lines.join('\n');
    };

    // 오늘 날짜를 같이 줘야 "오늘/어제/지난주"를 날짜로 바꿀 수 있다
    function todayStr() {
        var d = new Date();
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    var DOW = ['일', '월', '화', '수', '목', '금', '토'];

    window._qaToolPlanPrompt = function (question, priorHistory) {
        var hist = (priorHistory || []).slice(-4).map(function (m) {
            return (m.role === 'user' ? '사용자: ' : 'AI: ') + String(m.text || '').slice(0, 300);
        }).join('\n');
        return '너는 사내 업무 앱의 질문 라우터다. 아래 **조회 도구**로 사내 시스템에서 실제 데이터를 가져올 수 있다.\n\n'
            + '[오늘] ' + todayStr() + '(' + DOW[new Date().getDay()] + ')\n\n'
            + '[쓸 수 있는 도구]\n' + window._qaToolsSpec() + '\n\n'
            + (hist ? '[최근 대화]\n' + hist + '\n\n' : '')
            + '[사용자 질문]\n' + question + '\n\n'
            + '판단: 이 질문이 위 도구로 **실제 데이터를 가져와야** 답할 수 있는 것인가?\n'
            + '- 그렇다면 다른 말 없이 호출만 출력하라. 형식은 정확히: [[TOOL:도구id {"인자":"값"}]]\n'
            + '  · 한 번에 여러 개를 줄 바꿔 쓸 수 있다(최대 3개).\n'
            + '  · 기간 표현은 **날짜로 바꿔서** 넣어라. "오늘"이면 from과 to를 모두 ' + todayStr() + '로,\n'
            + '    "어제"면 둘 다 전날로, "지난주"면 지난 월요일~일요일로 계산해 넣는다.\n'
            + '  · 인자 이름과 허용값은 위 목록에 있는 것만 쓴다. 모르면 생략해라(기본값이 쓰인다).\n'
            + '- 사내 데이터가 필요 없는 질문(일반 지식, 계산, 이미 대화에 있는 내용)이면\n'
            + '  다른 말 없이 정확히 이 한 줄만 출력: [[NO_TOOL]]\n'
            + '- 설명·인사·사과를 붙이지 마라. 위 두 형식 중 하나만 출력한다.';
    };

    // `[[TOOL:id {json}]]` 파싱 — 모델이 코드블록/따옴표를 섞어 내도 견디게
    var TOOL_RE = /\[\[\s*TOOL\s*:\s*([A-Za-z0-9_]+)\s*(\{[\s\S]*?\})?\s*\]\]/g;

    window._qaParseToolCalls = function (text) {
        var out = [], m;
        TOOL_RE.lastIndex = 0;
        while ((m = TOOL_RE.exec(String(text || '')))) {
            var args = {};
            if (m[2]) {
                try { args = JSON.parse(m[2]); } catch (e) { args = { __parseError: m[2].slice(0, 120) }; }
            }
            out.push({ id: m[1], args: args });
            if (out.length >= 3) break;          // 한 턴에 3개까지
        }
        return out;
    };

    // ── 결과를 AI에게 되먹일 텍스트로 ────────────────────────────────
    function rowsToText(r, limit) {
        var rows = r.rows;
        if (!Array.isArray(rows)) {
            try { return JSON.stringify(rows).slice(0, 3000); } catch (e) { return String(rows).slice(0, 3000); }
        }
        return rows.slice(0, limit || 60).map(function (x, i) {
            var parts = [];
            // 🐛 [2026-10-26 제보, 2026-10-27 재발] id가 안 보여서 AI가 "일정 삭제해줘"에
            //    eventId를 자리번호(1)로 지어냈다(calendarId:1/eventId:1 — 실제 값과 전혀 다름).
            //    처음엔 id/calendarId/boardId만 하드코딩했는데, 그 뒤 itemId(회의실 예약)에서
            //    **똑같은 사고가 재발했다** — "시드니 회의실"의 실제 itemId=22를 못 보고
            //    AI가 또 1을 지어내 예약 API가 500을 돌려줬다. 특정 키 이름을 계속 추가하는
            //    대신, **"...Id"로 끝나는 키는 전부** 자동으로 보여준다(id류는 계속 늘어난다
            //    — calendarId/boardId/itemId/assetId/eventId/postId/reservationId...).
            if (x.id !== undefined && x.id !== null && x.id !== '') parts.push('id:' + x.id);
            Object.keys(x).sort().forEach(function (k) {
                if (k === 'id' || !/Id$/.test(k)) return;
                if (x[k] === undefined || x[k] === null || x[k] === '') return;
                parts.push(k + ':' + x[k]);
            });
            var gotDate = ['at', 'date', 'createdAt', 'start', 'dueDate'].some(function (k) { if (x[k]) { parts.push(String(x[k]).slice(0, 16).replace('T', ' ')); return true; } return false; });
            var gotPerson = ['from', 'sender', 'writer', 'drafterName', 'creator', 'reporter'].some(function (k) { if (x[k]) { parts.push(String(x[k])); return true; } return false; });
            var gotCtx = ['boardName', 'folder', 'formName', 'calendar', 'category', 'dept'].some(function (k) { if (x[k]) { parts.push('(' + x[k] + ')'); return true; } return false; });
            var gotTitle = ['subject', 'title', 'name'].some(function (k) { if (x[k]) { parts.push(String(x[k])); return true; } return false; });
            if (x.members) parts.push('👤' + x.members);
            if (x.seen === false) parts.push('[안읽음]');
            // 🧩 [2026-10-26, Works 등] 제목/작성자/맥락(위 세 그룹) 중 **사람이 "이게 뭔지" 알 수 있는
            //    것이 하나도 안 걸렸으면** 그 행의 나머지 키를 전부 압축해서 보여준다.
            //    ⚠️ [2026-10-27 실사용 제보] 원래는 "id류 말고 아무것도 안 걸렸을 때만"이었다 —
            //    예약 조회(asset/item/user)처럼 **날짜만** 고정 키에 걸리는 데이터는 이 조건에서
            //    제외돼("뭔가 걸렸다"고 오판) 사람이 "id:100288 — 2026-10-29 00:00"처럼 **어느
            //    방을 누가 예약했는지도 모르는 줄**만 받았다. 날짜 하나 걸린 걸로는 "식별됐다"고
            //    치지 않는다 — 제목/작성자/맥락 중 하나는 있어야 한다.
            if (!gotPerson && !gotCtx && !gotTitle) {
                var known = { id: 1, preview: 1, summary: 1, body: 1, bodyNote: 1 };
                if (gotDate) { ['at', 'date', 'createdAt', 'start', 'dueDate'].forEach(function (k) { known[k] = 1; }); }
                Object.keys(x).forEach(function (k) {
                    if (known[k] || /Id$/.test(k) || x[k] === undefined || x[k] === null || x[k] === '') return;
                    var v = x[k];
                    if (typeof v === 'object') return;      // 배열/객체는 건너뛴다(노이즈)
                    parts.push(k + ':' + String(v).slice(0, 80));
                });
            }
            var head = (i + 1) + '. ' + parts.join(' ');
            var body = x.preview || x.summary || x.body || x.bodyNote || '';
            return body ? head + '\n   ' + String(body).slice(0, 300) : head;
        }).join('\n');
    }

    window._qaToolResultsText = function (results) {
        return results.map(function (r) {
            var t = window._qaToolById(r.id);
            var head = '[' + r.id + (t ? ' — ' + t.title : '') + ' / 인자 '
                + (Object.keys(r.args || {}).length ? JSON.stringify(r.args) : '없음') + ']';
            if (!r.ok) return head + '\n조회 실패: ' + r.message + '\n(실패를 "데이터가 없다"는 뜻으로 단정하지 마라.)';
            var meta = [];
            if (r.count !== null) meta.push(r.count + '건');
            if (r.data && r.data.from) meta.push(r.data.from + (r.data.to ? ' ~ ' + r.data.to : ''));
            if (r.data && r.data.unreadTotal) meta.push('메일함 안읽음 총 ' + r.data.unreadTotal + '건');
            if (r.data && r.data.unclassifiedCount !== undefined) meta.push('미분류 총 ' + r.data.unclassifiedCount + '건');
            if (r.notes && r.notes.length) meta.push(r.notes.join('; '));
            if (r.count === 0) return head + ' ' + meta.join(' · ') + '\n결과 0건 — 그 기간/조건에 자료가 없다.';
            return head + ' ' + meta.join(' · ') + '\n' + rowsToText(r, 60);
        }).join('\n\n');
    };

    window._qaToolAnswerPrompt = function (question, results) {
        return '아래는 사내 시스템에서 **방금 조회한 실제 데이터**다.\n\n'
            + window._qaToolResultsText(results) + '\n\n'
            + '[사용자 질문]\n' + question + '\n\n'
            + '요청: 위 데이터만 근거로 한국어로 간결하게 답하라.\n'
            + '- 업무 주제별로 묶고, 내 답장·조치가 필요해 보이는 것을 앞에 둔다.\n'
            + '- 각 항목은 한 줄. 보낸이/작성자는 괄호로 붙인다.\n'
            + '- 광고·스팸리포트·자동알림은 맨 끝에 한 줄로 묶는다.\n'
            + '- **데이터에 없는 내용을 추측해 보태지 마라.** 0건이면 없다고 답한다.\n'
            + '- 조회 실패가 있으면 그 사실을 한 줄로 밝힌다.\n'
            + '- 표는 만들지 말고 글머리표로만 답하라.';
    };

    // ── 에이전트 루프 (다단계 추론) ──────────────────────────────────
    // 단일턴이 아니다. 매 턴 **지금까지 본 것**을 주고 다음 행동을 고르게 한다:
    //   · 더 조회해야 하면  → `[[TOOL:id {json}]]`  (여러 개 가능)
    //   · 쓰기가 필요하면   → `[[WRITE:id {json}]]` (실행 안 함, 사람 확인으로)
    //   · 충분하면          → 그냥 답변 글
    // 이게 "매크로"와 "추론"을 가르는 지점이다 — 조회 결과를 보고 판단이 바뀐다.
    window._qaToolStepPrompt = function (question, history, steps, priorHistory) {
        var hist = (priorHistory || []).slice(-4).map(function (m) {
            return (m.role === 'user' ? '사용자: ' : 'AI: ') + String(m.text || '').slice(0, 250);
        }).join('\n');
        var done = steps.length
            ? '\n[지금까지 조회한 것과 그 결과]\n' + window._qaToolResultsText(steps) + '\n'
            : '';
        var writeSpec = window._qaWriteToolsSpec ? window._qaWriteToolsSpec() : '';
        return '너는 사내 업무 앱의 에이전트다. 아래 도구로 사내 시스템을 **직접 조회**할 수 있다.\n\n'
            + '[오늘] ' + todayStr() + '(' + DOW[new Date().getDay()] + ')\n\n'
            + '[조회 도구]\n' + window._qaToolsSpec() + '\n'
            + (writeSpec ? '\n[실행 도구 — 초안만 만든다. 사람이 확인해야 실행된다]\n' + writeSpec + '\n' : '')
            + (hist ? '\n[최근 대화]\n' + hist + '\n' : '')
            + '\n[사용자 요청]\n' + question + '\n'
            + done
            + '\n이번 턴에 할 일을 **하나만** 고르고, 그 형식으로만 출력하라.\n'
            + '1) 아직 더 알아봐야 한다 → `[[TOOL:도구id {"인자":"값"}]]` (줄 바꿔 최대 3개)\n'
            + '2) 조회는 충분하고 **실행**이 필요하다 → `[[WRITE:도구id {"인자":"값"}]]` (한 개만)\n'
            + '3) 답할 수 있다 → 태그 없이 한국어 답변만 쓴다\n'
            + '4) 사내 데이터가 필요 없는 질문이다 → `[[NO_TOOL]]` (첫 턴에만)\n\n'
            + '판단 지침:\n'
            + '- 기간 표현은 **날짜로 바꿔** 넣는다("오늘"=' + todayStr() + ').\n'
            + '- **결과를 보고 다음을 정하라.** 예: 회의실을 잡으려면 먼저 그날 예약 현황을 조회해\n'
            + '  비어 있는 시간을 확인한 뒤에 실행 초안을 낸다. 확인 없이 시간을 지어내지 마라.\n'
            + '- id가 필요한데 모르면 목록 도구로 먼저 찾아라(예: 자원 목록 → 항목 목록).\n'
            + '- 조회가 0건이면 "없다"는 뜻이다. 다만 검색 조건이 틀렸을 수 있으면 한 번만 바꿔 재시도하라.\n'
            + '- 필요한 정보가 사용자 요청에 없으면(예: 참석자) 지어내지 말고 **되물어라**(3번 형식).\n'
            + '- 설명·사과를 붙이지 마라.';
    };

    // 반환: null = 도구가 필요 없다(기존 일반 AI 경로로)
    //       { reply, calls }        = 조회해서 답을 만들었다
    //       { draft, calls, reply } = 쓰기 초안을 만들었다(사람 확인 필요)
    window._qaToolLoop = async function (question, opts) {
        opts = opts || {};
        var apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!apiKey) return null;
        var onStep = opts.onStep || function () {};
        var MAX_TURNS = 4, MAX_CALLS = 6;
        var steps = [], calls = [], gwChecked = false, insaChecked = false;

        for (var turn = 1; turn <= MAX_TURNS; turn++) {
            onStep(turn === 1
                ? '🧭 ' + window._t('무엇을 조회해야 할지 판단 중...', 'Deciding what to look up...')
                : '🤔 ' + window._t('조회 결과를 보고 다음을 판단 중... (' + turn + '/' + MAX_TURNS + ')',
                                    'Reasoning over results (' + turn + '/' + MAX_TURNS + ')'));
            var res;
            try {
                res = await window._withTimeout(
                    window.callAiBackend(apiKey,
                        window._qaToolStepPrompt(question, null, steps, opts.priorHistory), {}),
                    60000, window._t('판단 시간 초과', 'Reasoning timed out'));
            } catch (e) {
                console.warn('[AI 도구] 턴 ' + turn + ' 실패:', e && e.message);
                break;
            }
            if (!res || !res.ok) break;
            var text = window._extractGanttQaAiText(res) || '';

            if (turn === 1 && /\[\[\s*NO_TOOL\s*\]\]/.test(text)) return null;

            // ① 쓰기 초안 — 실행하지 않는다
            var writes = window._qaParseWriteCalls ? window._qaParseWriteCalls(text) : [];
            if (writes.length) {
                var draft = window._qaMakeWriteDraft(writes[0].id, writes[0].args);
                var pre = String(text).replace(/\[\[\s*WRITE[\s\S]*?\]\]/g, '').trim();
                return { draft: draft, calls: calls,
                         reply: (pre ? pre + '\n\n' : '') + window._qaWriteDraftText(draft) };
            }

            // ② 추가 조회
            var wanted = window._qaParseToolCalls(text);
            if (!wanted.length) {
                // ③ 태그가 없으면 최종 답변으로 본다
                if (text.trim()) return { reply: text.trim(), calls: calls };
                break;
            }
            if (!gwChecked && wanted.some(function (w) {
                    var t = window._qaToolById(w.id); return t && t.requires === 'gw'; })) {
                gwChecked = true;
                onStep('🔑 ' + window._t('그룹웨어 로그인 상태 확인 중...', 'Checking groupware session...'));
                // [2026-10-20] 끊겨 있으면 저장된 계정으로 **1회만** 자동 로그인한다.
                //   그전까지는 여기서 바로 포기해, 계정을 저장해 뒀는데도 명령마다 사람이
                //   🔑을 눌러야 했다. 재시도 금지 가드는 _gwEnsureLogin(js/36) 안에 있다 —
                //   실패를 반복하면 CAPTCHA가 뜨고 사내 계정이 잠기기 때문이다.
                //   게이트가 없으면(js/36 미로드) 통과시킨다 — 어차피 도구 호출이 실패하며
                //   백엔드가 제 사유를 돌려주므로, 여기서 조용히 막는 것보다 낫다.
                var _gwGate = window._gwEnsureLogin ? await window._gwEnsureLogin(onStep) : { ok: true };
                if (!_gwGate.ok) return { reply: _gwGate.message, calls: calls };
            }
            // 🧑‍💼 [2026-10-21] 인사관리도 같은 선검사가 필요하다. 없이 뒀더니 세션이 풀린 뒤
            //    "메뉴를 화면에서 찾지 못했습니다"라는 **엉뚱한 사유**로 실패했다(실사용 제보) —
            //    진짜 원인은 로그인이 풀려 로그인 화면이 떠 있던 것이었다.
            //    재시도 금지 가드는 _insaEnsureLogin(js/36) 안에 있다(한 번 실패하면 안 때린다).
            if (!insaChecked && wanted.some(function (w) {
                    var t = window._qaToolById(w.id); return t && t.requires === 'insa'; })) {
                insaChecked = true;
                onStep('🔑 ' + window._t('인사관리 로그인 상태 확인 중...', 'Checking HR session...'));
                var _insaGate = window._insaEnsureLogin ? await window._insaEnsureLogin(onStep) : { ok: true };
                if (!_insaGate.ok) return { reply: _insaGate.message, calls: calls };
            }
            for (var i = 0; i < wanted.length && calls.length < MAX_CALLS; i++) {
                var tl = window._qaToolById(wanted[i].id);
                onStep('🔎 ' + window._t((tl ? tl.title : wanted[i].id) + ' 조회 중...',
                                         'Running ' + wanted[i].id + '...'));
                var r = await window._qaRunTool(wanted[i].id, wanted[i].args);
                steps.push(r);
                calls.push({ id: r.id, args: r.args || {}, ok: r.ok,
                             count: r.count, message: r.message || '' });
                if (window._qaLogToolCall) window._qaLogToolCall(question, r);
            }
            if (calls.length >= MAX_CALLS) break;
        }

        if (!steps.length) return null;

        // 턴을 다 썼으면 지금까지 본 것으로 결론을 낸다 — **조회 결과는 반드시 보여준다**
        onStep('✍️ ' + window._t('조회 결과를 정리하는 중...', 'Summarizing...'));
        var reply = '';
        try {
            var ans = await window._withTimeout(
                window.callAiBackend(apiKey, window._qaToolAnswerPrompt(question, steps), {}),
                60000, window._t('답변 생성 시간 초과', 'Answer timed out'));
            if (ans && ans.ok) {
                var t2 = window._extractGanttQaAiText(ans);
                if (t2 && t2.trim()) reply = t2.trim();
            }
        } catch (e) { /* 아래 폴백 */ }
        if (!reply) {
            reply = '⚠️ ' + window._t('AI 요약은 실패했습니다 — 조회한 원자료를 그대로 보여드립니다.',
                                       'AI summary failed — raw results below.')
                  + '\n\n```\n' + window._qaToolResultsText(steps).slice(0, 4000) + '\n```';
        }
        return { reply: reply, calls: calls };
    };

    // 사용자에게 "무엇을 어떤 인자로 불렀는지" 그대로 보여준다(블랙박스 방지)
    window._qaToolCallsFooter = function (calls) {
        if (!calls || !calls.length) return '';
        var items = calls.map(function (c) {
            var t = window._qaToolById(c.id);
            var a = Object.keys(c.args || {}).map(function (k) { return k + '=' + c.args[k]; }).join(', ');
            return (c.ok ? '✅' : '⚠️') + ' ' + (t ? t.title : c.id)
                 + (a ? ' (' + a + ')' : '')
                 + (c.ok ? (c.count !== null && c.count !== undefined ? ' → ' + c.count + '건' : '') : ' → ' + c.message);
        });
        return '\n\n---\n🛠 ' + window._t('조회한 것', 'Looked up') + ': ' + items.join(' · ');
    };
})();
