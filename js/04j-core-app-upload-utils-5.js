// [분리됨] 원본: js/04-core-app.js 의 9663~11058행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 파일 업로드 및 유틸리티 로직 5/5
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
                'auto-login-toggle-btn': '🔴 자동로그인 OFF',
                'alarm-toggle-btn':  '🟢 자동알람 ON',
                'alarm-settings-menu-btn': '⚙️ 자동알람 설정',
                'holiday-btn':       '🗓️ 휴일 등록',
                'alarm-send-all-btn':'📧 일괄 발송',
                'mail-btn':'🤖 AI 업무 분석',
                'project-select-btn': '🔃 프로젝트 선택',
                'work-filter-btn':    '🎛️ 업무필터 ▾',
                'schedule-tools-btn': '🛠️ 일정 도구',
                'gantt-ai-search-btn':'🔍 AI검색',
                'ai-menu-btn':        '🤖 AI 도구',
                'ai-summary-menu-btn':'🤖 AI 요약',
                'ai-qa-menu-btn':     '💬 AI 문답',
                'ai-summary-title':   'AI 요약',
                'gantt-qa-title':     'AI 문답',
                'inbox-modal-title-text': 'AI 업무 보관함',
                'priority-config-title': '우선순위 점수 설정',
                'mail-auto-config-title': '메일 자동배치 설정',
                'ai-summary-prompt-title': 'AI 요약 — 프롬프트 편집',
                'ps-prompt-log-title': 'AI 요약 — 프롬프트 변경 이력',
                'ps-improve-comment-title': '어떤 부분이 문제였나요?',
                'ps-improve-title': 'AI 프롬프트 개선 제안 (프로젝트 요약)',
                'gantt-qa-improve-comment-title': '어떤 부분이 문제였나요?',
                'gantt-qa-improve-title': 'AI 프롬프트 개선 제안 (AI 문답)',
                'gantt-qa-prompt-title': 'AI 문답 — 프롬프트 편집',
                'gantt-qa-prompt-log-title': 'AI 문답 — 프롬프트 변경 이력',
                'ai-tools-settings-title': 'AI 분석 설정',
                'my-team-title': '내 팀 설정',
                'prompt-improve-title': 'AI 프롬프트 개선 제안',
                'prompt-log-title': '프롬프트 변경 이력',
                'inbox-ai-chat-title': 'AI 분석 근거 문의',
                'ms-reanalyze-title': '프로젝트 매칭 재분석 요청',
                'npw-title': '새 프로젝트 등록',
                'ai-mail-view-title': '📧 원본 메일',
                'pc-add-title': '🖥️ 패널 추가',
                'pc-spec-title': '🖥️ 패널 스펙',
                // 💡 ep-add-title/ep-pinmap-title/ep-spec-title은 여기 넣지 않음 — 열 때마다 부품
                // 종류·모델명이 들어간 동적 제목(예: "🔌 KTS320DPS01")으로 다시 채워지는데, 여기 넣으면
                // toggleLang()이 그 동적 내용을 이 고정 라벨로 덮어써버림(22e-summary-mctable-core4.js
                // ep-pinmap-title/ep-spec-title 참고). 그 함수들이 이미 열 때마다 _en을 다시 읽어
                // 알아서 새로 그리므로 별도 등록 불필요.
                'ai-analysis-settings-btn': '🤖 AI 분석 설정',
                // 💡 [2026-09-12 신규] AI 요약 프롬프트 편집 모달은 최초 1회만 innerHTML을 그려서
                // (기존 모달이 있으면 재사용) 이후 언어를 토글해도 이 버튼들 텍스트는 안 바뀌고
                // 있었음 — id로 등록해 toggleLang()이 매번 다시 맞춰주도록 함.
                'ai-summary-history-btn':      '🕒 이력',
                'ai-summary-unlock-btn':       '🔒 수정하기',
                'ai-summary-save-btn':         '저장',
                'ai-summary-reset-btn':        '🔄 기본값으로 초기화',
                'ai-summary-batch-improve-btn':'🤖 일괄개선',
                'gantt-qa-history-btn':        '🕒 이력',
                'gantt-qa-prompt-unlock-btn':  '🔒 수정하기',
                'gantt-qa-prompt-save-btn':    '저장',
                'gantt-qa-prompt-reset-btn':   '🔄 기본값으로 초기화',
                'gantt-qa-batch-improve-btn':  '🤖 일괄개선',
                'ps-prompt-log-clear-btn':       '🗑️ 이력 삭제',
                'ps-prompt-log-close-btn':       '닫기',
                'gantt-qa-prompt-log-clear-btn': '🗑️ 이력 삭제',
                'gantt-qa-prompt-log-close-btn': '닫기',
                'ai-summary-open-prompt-btn':    '✏️ 프롬프트',
                'gantt-qa-open-prompt-btn':      '📝 프롬프트',
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
                'cal-view-month-btn': '월',
                'cal-view-week-btn':  '주',
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
                // 💡 [2026-09-12 신규] 전수 점검(2차)에서 발견된 미번역 항목들
                'my-team-prefix':          '내 팀:',
                'mail-auto-config-menu-btn': '📬 메일 자동배치 설정',
                'sum-materials-note':      '(메일 분석 시 참고 자료로 활용 · 체크박스는 "분석용", 그 옆 － 버튼은 자유추가 행 삭제)',
                'sum-photo-note':          '(최대 2장 · JPEG 압축 저장 · PPT 슬라이드 1 삽입)',
                'photo-num-1':             '사진 1',
                'photo-num-2':             '사진 2',
                'photo-add-text':          '클릭하여 추가',
                'ms-email-server-btn':     '⚙️ 이메일 서버 설정',
                'mail-multi-project-label':'🔀 다른 프로젝트로 배분',
                'mail-multi-dist-btn':     '📤 선택 프로젝트 배분',
                'mail-multi-project-hint': 'Ctrl(⌘)+클릭으로 여러 프로젝트 선택 가능 · 선택한 프로젝트를 열면 수신 대기 알림이 표시됩니다',
                'topic-diagnosis-btn':     '🔬 AI 진단',
                'topic-profile-gen-btn':   '📊 토픽 프로파일 생성',
                'mac-interval-10': '10분', 'mac-interval-15': '15분', 'mac-interval-30': '30분', 'mac-interval-60': '60분',
                'schedule-rule-loading':   '불러오는 중...',
                'alarm-modal-send-btn':    '📧 즉시 발송',
                'alarm-modal-close-btn':   '닫기',
            },
            // 💡 [2026-09-11 신규] data-i18n-placeholder 속성이 붙은 input의 placeholder 번역 —
            //    data-i18n(textContent 전용)과 별도 맵. toggleLang()에서 함께 처리.
            i18nPlaceholder: {
                'addr-search': '🔍 검색 (이름/부서/직함/이메일/전화 등)',
                'tg-token': 'BotFather에서 발급받은 Token',
                'tg-chatid': '본인 Chat ID (숫자)',
                'as-d-custom': '예: 20',
                'nm-title': '공지 제목',
                'nm-body': '발송할 공지 내용',
                'nm-d-custom': '예: 14',
                'sum-purpose': '예: LNW UK / 유럽 시장 판매 / S32 신규 Cabinet 개발',
                'sum-volume': '예: 약 20,000대/년',
                'sum-mp-date': '예: 2027년 5월 납품 예정',
                'sum-customer': '예: LNW',
                'sum-customer-model': '예: STELLAR32',
                'sum-project-code': '예: G2608OB',
                'sum-project-name': '예: LNW>S32>LOWER',
                'sum-ktk-pn-model': '예: 502574_MVD>KTS320DPS01,LNW',
                'sum-mail-keywords': '예: S32, STELLAR, 에스삼투 (쉼표로 구분)',
                'sum-background': '예: LNW UK 신규 개발 Cabinet / 유럽시장 진출, 신규 수주 확보를 통한 제품 포트폴리오 확장...',
                'sum-pm': '예: 박용훈',
                'sum-mech': '예: 서경인',
                'sum-hw': '예: 조익현,조재준',
                'sum-fw': '예: 최종석',
                'sum-module': '예: 김태홍',
                'sum-tsp': '예: 김진권,노태헌',
                'sum-lcm': '예: 홍길동',
                'sum-slimming': '예: 홍길동',
                'sum-cutting': '예: 홍길동',
                'sum-tooling': '예: 홍길동',
                'mc-add-unit-input': '예: BTN',
                'mail-content-input': '메일 본문을 여기에 붙여넣으세요...',
                'ms-keyword-body': 'RFQ, 견적',
                'mac-filter-subject-input': '예: [광고]',
                'mac-filter-noreply-input': '예: noreply',
                'mac-filter-domain-input': '예: spam-mailer.com',
            },
            // 💡 [2026-09-12 신규] readonly 역할 라벨 <input value="...">는 textContent가 안 먹히고
            //    placeholder/title도 아니라서 이 세 맵(i18n/i18nPlaceholder/i18nTitle) 어디에도
            //    안 걸렸었음 — 전용 data-i18n-value 속성 + 맵 신설.
            i18nValue: {
                'sum-pm-label':       '프로젝트 담당자 *',
                'sum-mech-label':     '기구 담당자',
                'sum-hw-label':       'H/W 담당자',
                'sum-fw-label':       'F/W 담당자',
                'sum-module-label':   'BLU 담당자',
                'sum-tsp-label':      'TSP 담당자',
                'sum-lcm-label':      'LCM 담당자',
                'sum-slimming-label': 'Slimming 담당자',
                'sum-cutting-label':  'Cutting 담당자',
                'sum-tooling-label':  'Tooling 담당자',
            },
            i18nTitle: {
                "color-palette-view": "🎨 컬러 팔레트 보기",
                "drive-sync-issue-hint": "💡 구글 동기화에 문제가 있는 경우 키보드의 [CTRL + F5]를 눌러주세요. | Shift+클릭: 계정 전환",
                "drive-restore-backup": "드라이브 Backups 폴더의 이전 저장본으로 복원 (최근 7일)",
                "new-project-clear": "현재 화면을 비우고 새 프로젝트를 시작합니다",
                "drive-delete-project": "구글 드라이브의 프로젝트 파일을 영구 삭제합니다 (관리자 비밀번호 필요)",
                "ai-summary-risk-hint": "지연/임박 업무·최근 변경이력을 AI가 요약해서 리스크와 액션을 짚어줍니다",
                "gantt-qa-hint": "이 프로젝트 데이터에 대해 자유롭게 질문하고 AI 답변을 받습니다",
                "ai-context-len-hint": "AI 요약·AI 문답이 업무 상세내용/답변을 읽을 때 최대 몇 자까지 참고할지 설정합니다",
                "auto-login-hint": "켜두면 새로고침·새 탭에서 예전에 연동했던 계정으로 조용히(팝업 없이) 자동 재연동을 시도합니다. 실패해도 지금처럼 [드라이브 연동하기]를 누르면 됩니다.",
                "my-team-hint": "이 컴퓨터(브라우저)가 속한 팀 — 로그인 이름을 주소록과 대조해 자동 추정되며, 여기서 직접 바꿀 수 있습니다. 앞으로 AI 메일 매칭 범위 제한 등에 사용될 예정입니다.",
                "smtp-settings-hint": "SMTP·자동발송·참조인 설정",
                "mail-collect-settings-hint": "수집주기·우선순위점수·중요키워드·초기화",
                "admin-pw-change-hint": "삭제/보안 동작에 쓰이는 관리자 비밀번호를 변경합니다",
                "new-user-setup-hint": "새 사용자 추가 2단계 — ① Google Cloud '대상(테스트 사용자)' 페이지에서 추가 → ② Google Drive에서 프로젝트 폴더 공유 권한 부여. 클릭하면 두 페이지가 새 탭으로 열립니다.",
                "open-other-project-hint": "클릭하면 다른 프로젝트를 열 수 있습니다 (저장 안 한 변경사항이 있으면 먼저 물어봅니다)",
                "lang-toggle-hint": "한글/영어 전환",
                "sidebar-toggle-hint": "메뉴 접기/펴기",
                "select-all": "전체 선택/해제",
                "wbs-major": "대분류",
                "wbs-sub1": "소분류1",
                "wbs-sub2": "소분류2",
                "wbs-detail": "세부업무",
                "wbs-subtask": "하위업무",
                "alarm-or-notice-hint": "Alarm(D-day 알람) / Notice(반복 공지) 중 선택",
                "send-all-including-past": "과거 미발송분 포함 전체 발송",
                "refresh": "새로고침",
                "close": "닫기",
                "email-select-all": "이메일 전체 선택/해제",
                "tg-select-all": "텔레그램 전체 선택/해제",
                "recipient-delete-all": "수신자 전체 삭제",
                "filter-wbs-status-hint": "LEVEL(WBS) · 업무상태 · 개발단계 필터",
                "plan-save-compare-hint": "계획 저장·비교 · 선택 구간 재계산 · 날짜순 정렬",
                "search-bar-toggle-hint": "검색 바 표시/숨김 (Ctrl+Shift+F)",
                "row-menu-hint": "클릭: 메뉴 / Ctrl·Shift 클릭: 여러 행 선택",
                "col-sort-hint": "클릭하면 정렬(다시 클릭하면 오름차순/내림차순 반복)",
                "eol-hint": "EOL로 표시하면 '프로젝트 불러오기' 목록에서 흐리게 구분 표시되고, [설정 → 메일 자동배치 설정]에서 끄지 않는 한 새 메일 자동매칭 대상에서도 제외됩니다. MP(EC)는 메일 분석 생성 임시 프로젝트 — 메일 자동매칭 포함, 완료 처리 시 EOL로 전환하세요.",
                "date-unit-cycle-hint": "클릭하면 일/주/개월 단위로 순환 전환됩니다",
                "start-date-required-hint": "필수 입력 — 새 프로젝트 등록 시 Gantt Chart의 시작일 기준(anchor)으로 사용되어 전체 일정이 자동 계산됩니다",
                "start-date-anchor-hint": "프로젝트 시작일(필수) — Gantt Chart 시작일로 사용되어 새 프로젝트 등록 시 전체 일정이 여기서부터 자동 계산됩니다 (한 번 클릭: 달력에서 선택 / 더블클릭: 직접 입력)",
                "date-click-hint": "한 번 클릭: 달력에서 선택 / 더블클릭: 직접 입력",
                "mail-keyword-hint": "메일 자동수집·분석 시 이 프로젝트로 매칭할 별칭/약어. 쉼표로 구분 (예: S32, 에스삼투, STELLAR)&#10;&#10;⚠️ 사람 이름은 넣지 마세요 — 그 사람이 보내는 모든 메일이 내용과 무관하게 이 프로젝트로 자동 매칭됩니다(서명란에 항상 본인 이름이 들어가기 때문). 주소록에 등록된 이름은 매칭 시 자동으로 제외되지만, 안전하게 처음부터 넣지 않는 걸 권장합니다.",
                "role-label-fixed": "역할 이름은 고정되어 있어 수정할 수 없습니다 (다른 기능에서 이 이름으로 참조합니다)",
                "pn-trust-check": "체크하면 AI가 이 PN 언급을 &quot;이 프로젝트가 맞다&quot;는 신뢰 신호로 사용. 여러 프로젝트가 같이 쓰는 공용 부품은 체크하지 마세요(오매칭 위험).",
                "photo-add": "클릭하여 사진 추가",
                "delete": "삭제",
                "col-rename-mvd": "클릭해서 열 이름을 바꿀 수 있습니다 (예: MVD)",
                "col-rename-tvd": "클릭해서 열 이름을 바꿀 수 있습니다 (예: TVD)",
                "col-rename-tpr": "클릭해서 열 이름을 바꿀 수 있습니다 (예: TPR)",
                "revision-add-hint": "새 리비전 추가 (금액이 입력된 리비전 기준 다음 번호로 이동 — 금액 없는 빈 리비전은 실수로 여러 번 눌러도 건너뛰지 않고 재사용됨)",
                "revision-cycle-hint": "클릭할 때마다 금액이 입력된 리비전끼리 순환 (완전히 새 리비전은 ➕로 추가)",
                "amount-delete-all": "금액 전체 삭제",
                "etc-row-hint": "💡 ITEM 칸에 'etc.'를 입력한 행이 그룹의 마지막 행이 됩니다 — 이 지점에서 TYPE 구분과 SUBTOTAL이 계산됩니다.",
                "spec-lib-hint": "스펙표가 등록된 부품 종류만 목록에 나타납니다(나머지는 추후 등록 예정)",
                "ics-sync-hint": "ICS 내보내기 · Google 자동 동기화 — 둘 다 여기서",
                "ref-excel-auto-hint": "구글 드라이브에 연동되어 있으면, 참조 엑셀을 자동으로 가져와 바로 화면에 반영합니다",
                "dist-send-hint": "매칭 확정 + 날짜 확정된 대기 항목을 한 번에 각 프로젝트로 전송 (예전에 쌓인 대기 항목 정리용)",
                "dist-cleanup-hint": "완료(배치됨/전송됨) 항목의 저장된 메일 원문을 지우고, 너무 많이 쌓였으면 오래된 항목을 정리해 저장 공간을 확보합니다.",
                "topic-diagnosis-hint": "오매칭 패턴을 AI로 분석하여 토픽 프로파일의 오염 원인을 진단하고 수정안을 제시합니다.",
                "topic-profile-gen-hint": "현재 프로젝트의 간트 업무를 AI로 분석하여 키워드·토픽 프로파일을 저장합니다. 이후 메일 분석 정확도가 향상됩니다.",
                "topic-profile-view-hint": "클릭하면 저장된 토픽 프로파일을 열람합니다",
                "topic-profile-view": "저장된 토픽 프로파일 열람",
                "ai-prompt-edit-hint": "3개 탭 공용 AI 분석 프롬프트 수정",
                "dblclick-collapse-hint": "더블클릭하면 접힙니다",
                "task-inbox-hint": "현재 프로젝트가 아닌 업무를 보관함에 담아두고, 나중에 다른 프로젝트에 배치합니다.",
                "color-picker-hint": "직접 선택 (클릭하면 색상 선택기가 열립니다)",
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
                'auto-login-toggle-btn': '🔴 Auto Sign-in OFF',
                'alarm-toggle-btn':  '🟢 Auto Alarm ON',
                'alarm-settings-menu-btn': '⚙️ Auto Alarm Settings',
                'holiday-btn':       '🗓️ Holiday Setup',
                'alarm-send-all-btn':'📧 Batch Send',
                'mail-btn':'🤖 AI Analysis',
                'project-select-btn': '🔃 Select Project',
                'work-filter-btn':    '🎛️ Task Filter ▾',
                'schedule-tools-btn': '🛠️ Schedule Tools',
                'gantt-ai-search-btn':'🔍 AI Search',
                'ai-menu-btn':        '🤖 AI Tools',
                'ai-summary-menu-btn':'🤖 AI Summary',
                'ai-qa-menu-btn':     '💬 AI Q&A',
                'ai-summary-title':   'AI Summary',
                'gantt-qa-title':     'AI Q&A',
                'inbox-modal-title-text': 'AI Task Inbox',
                'priority-config-title': 'Priority Score Settings',
                'mail-auto-config-title': 'Mail Auto-Placement Settings',
                'ai-summary-prompt-title': 'AI Summary — Edit Prompt',
                'ps-prompt-log-title': 'AI Summary — Prompt History',
                'ps-improve-comment-title': 'What was the problem?',
                'ps-improve-title': 'AI Prompt Improvement Suggestion (Project Summary)',
                'gantt-qa-improve-comment-title': 'What was the problem?',
                'gantt-qa-improve-title': 'AI Prompt Improvement Suggestion (AI Q&A)',
                'gantt-qa-prompt-title': 'AI Q&A — Edit Prompt',
                'gantt-qa-prompt-log-title': 'AI Q&A — Prompt History',
                'ai-tools-settings-title': 'AI Analysis Settings',
                'my-team-title': 'My Team',
                'prompt-improve-title': 'AI Prompt Improvement Suggestion',
                'prompt-log-title': 'Prompt History',
                'inbox-ai-chat-title': 'Ask about AI matching basis',
                'ms-reanalyze-title': 'Project Match Re-analysis Request',
                'npw-title': 'Register New Project',
                'ai-mail-view-title': '📧 Original mail',
                'pc-add-title': '🖥️ Add Panel',
                'pc-spec-title': '🖥️ Panel Spec',
                'ai-analysis-settings-btn': '🤖 AI Analysis Settings',
                'ai-summary-history-btn':      '🕒 History',
                'ai-summary-unlock-btn':       '🔒 Edit',
                'ai-summary-save-btn':         'Save',
                'ai-summary-reset-btn':        '🔄 Reset to Default',
                'ai-summary-batch-improve-btn':'🤖 Batch Improve',
                'gantt-qa-history-btn':        '🕒 History',
                'gantt-qa-prompt-unlock-btn':  '🔒 Edit',
                'gantt-qa-prompt-save-btn':    'Save',
                'gantt-qa-prompt-reset-btn':   '🔄 Reset to Default',
                'gantt-qa-batch-improve-btn':  '🤖 Batch Improve',
                'ps-prompt-log-clear-btn':       '🗑️ Delete History',
                'ps-prompt-log-close-btn':       'Close',
                'gantt-qa-prompt-log-clear-btn': '🗑️ Delete History',
                'gantt-qa-prompt-log-close-btn': 'Close',
                'ai-summary-open-prompt-btn':    '✏️ Prompt',
                'gantt-qa-open-prompt-btn':      '📝 Prompt',
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
                'cal-view-month-btn': 'Month',
                'cal-view-week-btn':  'Week',
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
                'my-team-prefix':          'My Team:',
                'mail-auto-config-menu-btn': '📬 Mail Auto-Placement Settings',
                'sum-materials-note':      '(Used as reference during mail analysis · the checkbox means "for analysis", the － button next to it removes a freely-added row)',
                'sum-photo-note':          '(Up to 2 · saved as compressed JPEG · inserted as 1 PPT slide)',
                'photo-num-1':             'Photo 1',
                'photo-num-2':             'Photo 2',
                'photo-add-text':          'Click to add',
                'ms-email-server-btn':     '⚙️ Email Server Settings',
                'mail-multi-project-label':'🔀 Distribute to other projects',
                'mail-multi-dist-btn':     '📤 Distribute to selected projects',
                'mail-multi-project-hint': 'Ctrl(⌘)+click to select multiple projects · opening a selected project shows a pending-arrival notice',
                'topic-diagnosis-btn':     '🔬 AI Diagnosis',
                'topic-profile-gen-btn':   '📊 Generate Topic Profile',
                'mac-interval-10': '10 min', 'mac-interval-15': '15 min', 'mac-interval-30': '30 min', 'mac-interval-60': '60 min',
                'schedule-rule-loading':   'Loading...',
                'alarm-modal-send-btn':    '📧 Send Now',
                'alarm-modal-close-btn':   'Close',
            },
            i18nPlaceholder: {
                'addr-search': '🔍 Search (name/dept/title/email/phone, etc.)',
                'tg-token': 'Token issued by BotFather',
                'tg-chatid': 'Your Chat ID (numeric)',
                'as-d-custom': 'e.g. 20',
                'nm-title': 'Notice title',
                'nm-body': 'Notice content to send',
                'nm-d-custom': 'e.g. 14',
                'sum-purpose': 'e.g. LNW UK / European market sales / S32 new Cabinet development',
                'sum-volume': 'e.g. approx. 20,000 units/year',
                'sum-mp-date': 'e.g. Delivery expected May 2027',
                'sum-customer': 'e.g. LNW',
                'sum-customer-model': 'e.g. STELLAR32',
                'sum-project-code': 'e.g. G2608OB',
                'sum-project-name': 'e.g. LNW>S32>LOWER',
                'sum-ktk-pn-model': 'e.g. 502574_MVD>KTS320DPS01,LNW',
                'sum-mail-keywords': 'e.g. S32, STELLAR, ESSAMTU (comma-separated)',
                'sum-background': 'e.g. LNW UK new Cabinet development / entering the European market, expanding product portfolio through new orders...',
                'sum-pm': 'e.g. Yonghun Park',
                'sum-mech': 'e.g. Kyungin Seo',
                'sum-hw': 'e.g. Ikhyun Cho, Jaejun Cho',
                'sum-fw': 'e.g. Jongseok Choi',
                'sum-module': 'e.g. Taehong Kim',
                'sum-tsp': 'e.g. Jinkwon Kim, Taeheon Noh',
                'sum-lcm': 'e.g. Gildong Hong',
                'sum-slimming': 'e.g. Gildong Hong',
                'sum-cutting': 'e.g. Gildong Hong',
                'sum-tooling': 'e.g. Gildong Hong',
                'mc-add-unit-input': 'e.g. BTN',
                'mail-content-input': 'Paste the mail body here...',
                'ms-keyword-body': 'RFQ, Quote',
                'mac-filter-subject-input': 'e.g. [AD]',
                'mac-filter-noreply-input': 'e.g. noreply',
                'mac-filter-domain-input': 'e.g. spam-mailer.com',
            },
            i18nValue: {
                'sum-pm-label':       'Project Owner *',
                'sum-mech-label':     'Mechanical',
                'sum-hw-label':       'H/W',
                'sum-fw-label':       'F/W',
                'sum-module-label':   'BLU',
                'sum-tsp-label':      'TSP',
                'sum-lcm-label':      'LCM',
                'sum-slimming-label': 'Slimming',
                'sum-cutting-label':  'Cutting',
                'sum-tooling-label':  'Tooling',
            },
            i18nTitle: {
                "color-palette-view": "🎨 View color palette",
                "drive-sync-issue-hint": "💡 If Google sync has an issue, press [CTRL + F5]. | Shift+Click: switch account",
                "drive-restore-backup": "Restore a previous save from the Drive Backups folder (last 7 days)",
                "new-project-clear": "Clears the current screen and starts a new project",
                "drive-delete-project": "Permanently deletes the project file on Google Drive (admin password required)",
                "ai-summary-risk-hint": "AI summarizes delayed/upcoming tasks and recent changes to flag risks and actions",
                "gantt-qa-hint": "Ask anything about this project's data and get an AI answer",
                "ai-context-len-hint": "Sets the max characters AI Summary/AI Q&A will read from task details/answers",
                "auto-login-hint": "When on, silently (no popup) re-links the previously used account on refresh/new tab. If it fails, just click [Link Drive] as usual.",
                "my-team-hint": "The team this computer (browser) belongs to — auto-guessed by matching the login name against the address book, and can be changed here directly. Will later be used to scope AI mail matching, etc.",
                "smtp-settings-hint": "SMTP / auto-send / CC settings",
                "mail-collect-settings-hint": "Collection interval, priority score, key keywords, reset",
                "admin-pw-change-hint": "Changes the admin password used for delete/security actions",
                "new-user-setup-hint": "2 steps to add a new user — ① Add on the Google Cloud 'Audience (test users)' page → ② Grant project folder sharing permission on Google Drive. Clicking opens both pages in new tabs.",
                "open-other-project-hint": "Click to open another project (you'll be asked first if there are unsaved changes)",
                "lang-toggle-hint": "Switch Korean/English",
                "sidebar-toggle-hint": "Collapse/expand menu",
                "select-all": "Select/deselect all",
                "wbs-major": "Major category",
                "wbs-sub1": "Sub-category 1",
                "wbs-sub2": "Sub-category 2",
                "wbs-detail": "Detail task",
                "wbs-subtask": "Subtask",
                "alarm-or-notice-hint": "Choose between Alarm (D-day alert) / Notice (recurring notice)",
                "send-all-including-past": "Send all, including past unsent items",
                "refresh": "Refresh",
                "close": "Close",
                "email-select-all": "Select/deselect all emails",
                "tg-select-all": "Select/deselect all Telegram",
                "recipient-delete-all": "Delete all recipients",
                "filter-wbs-status-hint": "Filter by LEVEL(WBS) · task status · dev stage",
                "plan-save-compare-hint": "Save/compare plan · recalculate selected range · sort by date",
                "search-bar-toggle-hint": "Show/hide search bar (Ctrl+Shift+F)",
                "row-menu-hint": "Click: menu / Ctrl·Shift click: select multiple rows",
                "col-sort-hint": "Click to sort (click again to toggle ascending/descending)",
                "eol-hint": "Marking EOL shows it dimmed in the 'Load Project' list, and it's also excluded from new-mail auto-matching unless turned off in [Settings → Mail Auto-Registration Settings]. MP(EC) is a temporary project created by mail analysis — it's included in mail auto-matching, so switch it to EOL once completed.",
                "date-unit-cycle-hint": "Click to cycle through day/week/month units",
                "start-date-required-hint": "Required — used as the anchor start date for the Gantt Chart when registering a new project, so the whole schedule is calculated automatically",
                "start-date-anchor-hint": "Project start date (required) — used as the Gantt Chart start date, so the whole schedule is calculated from here when registering a new project (click once: pick from calendar / double-click: type manually)",
                "date-click-hint": "Click once: pick from calendar / Double-click: type manually",
                "mail-keyword-hint": "Aliases/abbreviations to match to this project during automatic mail collection/analysis. Comma-separated (e.g. S32, ESSAMTU, STELLAR)&#10;&#10;⚠️ Do not put a person's name here — every mail that person sends will be auto-matched to this project regardless of content (since their name always appears in the signature). Names registered in the address book are auto-excluded from matching, but it's safer not to add them in the first place.",
                "role-label-fixed": "Role names are fixed and cannot be edited (other features reference this name)",
                "pn-trust-check": "When checked, AI treats a mention of this PN as a trust signal that &quot;this is the right project.&quot; Do not check this for shared parts used by multiple projects (risk of mismatching).",
                "photo-add": "Click to add a photo",
                "delete": "Delete",
                "col-rename-mvd": "Click to rename this column (e.g. MVD)",
                "col-rename-tvd": "Click to rename this column (e.g. TVD)",
                "col-rename-tpr": "Click to rename this column (e.g. TPR)",
                "revision-add-hint": "Add a new revision (moves to the next number based on revisions that have an amount entered — an empty revision with no amount is reused, so accidental repeated clicks won't skip numbers)",
                "revision-cycle-hint": "Each click cycles through revisions that have an amount entered (add a brand-new revision with ➕)",
                "amount-delete-all": "Delete all amounts",
                "etc-row-hint": "💡 A row with 'etc.' entered in the ITEM cell becomes the last row of the group — TYPE grouping and SUBTOTAL are calculated at this point.",
                "spec-lib-hint": "Only part types with a registered spec table appear in the list (the rest are to be registered later)",
                "ics-sync-hint": "ICS export · Google auto-sync — both here",
                "ref-excel-auto-hint": "If linked to Google Drive, the reference Excel is fetched automatically and reflected on screen right away",
                "dist-send-hint": "Send all match-confirmed + date-confirmed pending items to their projects at once (for clearing out old pending items)",
                "dist-cleanup-hint": "Clears the saved raw mail text of completed (placed/sent) items, and if too many have accumulated, cleans up old items to free up storage space.",
                "topic-diagnosis-hint": "Uses AI to analyze mismatch patterns, diagnose the cause of topic profile contamination, and suggest a fix.",
                "topic-profile-gen-hint": "Analyzes the current project's Gantt tasks with AI and saves a keyword/topic profile. This improves mail analysis accuracy afterward.",
                "topic-profile-view-hint": "Click to view the saved topic profile",
                "topic-profile-view": "View saved topic profile",
                "ai-prompt-edit-hint": "Edit the AI analysis prompt shared by the 3 tabs",
                "dblclick-collapse-hint": "Double-click to collapse",
                "task-inbox-hint": "Stores a task that isn't for the current project in the inbox, to place it in another project later.",
                "color-picker-hint": "Pick directly (clicking opens the color picker)",
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

        // auto-login-toggle-btn 상태 언어 동기화
        if (window.refreshAutoLoginButton) window.refreshAutoLoginButton(window.isAutoLoginEnabled && window.isAutoLoginEnabled());

        // mail-process-toggle-btn 상태 언어 동기화
        if (window.refreshMailProcessButton) window.refreshMailProcessButton();

        // data-i18n 속성 기반 번역
        const i18nMap = LANG[window._currentLang].i18n || {};
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (i18nMap[key] !== undefined) el.textContent = i18nMap[key];
        });

        // 🐛 [2026-09-11 신규] data-i18n-placeholder 속성 기반 placeholder 번역 (예: 주소록 검색창)
        const i18nPlaceholderMap = LANG[window._currentLang].i18nPlaceholder || {};
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (i18nPlaceholderMap[key] !== undefined) el.placeholder = i18nPlaceholderMap[key];
        });

        // 🐛 [2026-09-11 신규] data-i18n-title 속성 기반 title(툴팁) 번역
        const i18nTitleMap = LANG[window._currentLang].i18nTitle || {};
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            if (i18nTitleMap[key] !== undefined) el.title = i18nTitleMap[key];
        });

        // 🐛 [2026-09-12 신규] data-i18n-value 속성 기반 번역 — readonly <input value="…"> 라벨은
        // textContent가 안 먹히고 placeholder/title도 아니라서 위 세 맵 어디에도 안 걸림(예: Summary
        // 탭의 "기구 담당자"/"TSP 담당자" 등 역할 라벨). id로 다른 기능에서 참조되긴 하지만 .value를
        // 직접 읽어 쓰는 곳은 없음을 확인 — 표시 문구만 언어에 맞게 갱신.
        const i18nValueMap = LANG[window._currentLang].i18nValue || {};
        document.querySelectorAll('[data-i18n-value]').forEach(el => {
            const key = el.dataset.i18nValue;
            if (i18nValueMap[key] !== undefined) el.value = i18nValueMap[key];
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
            // 💡 [2026-09-12 신규] "외부 도메인 발송 허용" 섹션 — sec-server/email/messenger처럼
            // _asLabels 제네릭 루프에 안 넣고 여기 id로 바로 등록(이 헤더는 이미 고정 id를 갖고 있어
            // previousElementSibling 탐색이 필요 없음). 예전엔 이 항목 자체가 어느 맵에도 없었음.
            'sec-domain-label':        { ko:'🌐 외부 도메인 발송 허용',            en:'🌐 Allow External Domains' },
        };
        Object.entries(_asIdTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });

        // [외부 도메인 발송 허용] 설명 문단 — <b> 태그가 섞여 있어 textContent가 아니라 innerHTML로 교체
        const _domainDesc = document.getElementById('sec-domain-desc');
        if (_domainDesc) _domainDesc.innerHTML = _en
            ? '📌 <b>@kortek.co.kr</b> is always allowed to send. Other domains are <b style="color:#e03131;">blocked</b> by default — only checked domains will receive mail/messenger alarms.<br>(A safeguard to prevent alarms reaching outsiders until this is fully stabilized)'
            : '📌 <b>@kortek.co.kr</b>은 항상 발송됩니다. 그 외 도메인은 기본적으로 <b style="color:#e03131;">차단</b>되며, 체크한 도메인만 메일/메신저 알람이 발송됩니다.<br>(안정화 전까지 외부인에게 알람이 나가는 것을 막기 위한 안전장치)';

        // [알람설정 섹션 접기/펼치기 화살표] 현재 열림 상태 유지하며 언어만 갱신
        ['sec-server','sec-email','sec-messenger','sec-domain'].forEach(sid => {
            const sec   = document.getElementById(sid);
            const arrow = document.getElementById(sid + '-arrow');
            if (!sec || !arrow) return;
            const open = sec.style.display !== 'none';
            arrow.textContent = open ? (_en ? '▼ Collapse' : '▼ 접기') : (_en ? '▶ Expand' : '▶ 펼치기');
        });

        // [메일 자동배치 설정] 팝업 — 이 모달 전체가 언어 전환 대응이 아예 없었음(전수 점검 2차에서
        // 발견). 실제 텍스트 맵/갱신 로직은 15c-mail-server-tab-2.js의 _macRefreshLang()에 있음
        // (모달을 처음 열 때도 같은 함수를 호출해서 "영문 모드에서 처음 여는" 경우도 커버).
        if (window._macRefreshLang) window._macRefreshLang();

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
            'nm-recip-add-btn':     { ko:'+ 수신자 추가',        en:'+ Add Recipient' },
            // 💡 [2026-09-12] "발송 방식" 섹션 — 라디오 2개(D-day 기준/기간·반복)와 그 안의 "기간·반복"
            // 하위 필드(날짜/기간/특정 날짜/시작일/종료일/며칠마다/발송 시각/+추가) 전체가 쌍둥이
            // 모달인 Alarm Schedule(as-*)만 먼저 고쳐지고 이쪽(nm-*)은 빠져있던 것을 뒤늦게 발견해 보완.
            'nm-lbl-sendmethod':       { ko:'발송 방식',    en:'Send Method' },
            'nm-mode-dday-label':      { ko:'D-day 기준',   en:'Based on D-day' },
            'nm-mode-recur-label':     { ko:'기간·반복',     en:'Date Range/Recurring' },
            'nm-lbl-date':             { ko:'날짜',         en:'Date' },
            'nm-datemode-range-label': { ko:'기간',         en:'Date Range' },
            'nm-datemode-specific-label': { ko:'특정 날짜',  en:'Specific Dates' },
            'nm-lbl-start':            { ko:'시작일',       en:'Start' },
            'nm-lbl-end':              { ko:'종료일',       en:'End' },
            'nm-lbl-interval':         { ko:'며칠마다',      en:'Every N days' },
            'nm-lbl-specific-date':    { ko:'날짜',         en:'Date' },
            'nm-add-specific-btn':     { ko:'+ 추가',       en:'+ Add' },
            'nm-lbl-sendtime':         { ko:'발송 시각',     en:'Send Time' },
            'nm-sec-content-label': { ko:'📝 공지 내용',          en:'📝 Notice Content' },
            'nm-sec-send-label':    { ko:'📤 발송 방식',          en:'📤 Send Method' },
            'nm-sec-recip-label':   { ko:'👥 수신 대상',          en:'👥 Recipients' },
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

        // [알람 일정(Alarm Schedule) 모달] — 공지 등록(nm-*)과 구조가 완전히 동일한 쌍둥이 모달인데
        // (섹션 1: 업무 정보/공지 내용, 섹션 2: 발송 방식, 섹션 3: 수신 대상), nm-*만 위에서 번역되고
        // as-*는 어디에도 등록된 적이 없어서 통째로 미번역이었음(사용자 스크린샷으로 발견).
        const _asTexts = {
            'as-sec-info-label':        { ko:'📋 업무 정보',          en:'📋 Task Info' },
            'as-lbl-title':             { ko:'제목',                 en:'Title' },
            'as-lbl-content':           { ko:'내용',                 en:'Content' },
            'as-mailraw-btn':           { ko:'📧 메일 원문 보기',      en:'📧 View Original Mail' },
            'as-sec-send-label':        { ko:'📤 발송 방식',          en:'📤 Send Method' },
            'as-lbl-sendmethod':        { ko:'발송 방식',            en:'Send Method' },
            'as-mode-dday-label':       { ko:'D-day 목록',           en:'D-day List' },
            'as-mode-recur-label':      { ko:'기간·반복',            en:'Date Range/Recurring' },
            'as-lbl-alarmtiming':       { ko:'알람 시점',             en:'Alarm Timing' },
            'as-lbl-direct':            { ko:'직접 입력:',            en:'Custom:' },
            'as-lbl-daysbefore':        { ko:'일 전',                en:'days before' },
            'as-add-custom-btn':        { ko:'+ 추가',               en:'+ Add' },
            'as-lbl-date':              { ko:'날짜',                 en:'Date' },
            'as-datemode-range-label':  { ko:'기간',                 en:'Date Range' },
            'as-datemode-specific-label': { ko:'특정 날짜',           en:'Specific Dates' },
            'as-lbl-start':             { ko:'시작일',               en:'Start' },
            'as-lbl-end':               { ko:'종료일',               en:'End' },
            'as-lbl-interval':          { ko:'며칠마다',              en:'Every N days' },
            'as-lbl-specific-date':     { ko:'날짜',                 en:'Date' },
            'as-add-specific-btn':      { ko:'+ 추가',               en:'+ Add' },
            'as-lbl-sendtime':          { ko:'발송 시각',             en:'Send Time' },
            'as-delete-rule-btn':       { ko:'🗑️ 이 업무의 기간·반복 예약 해제', en:'🗑️ Remove this task\'s date-range/recurring schedule' },
            'as-sec-recip-label':       { ko:'👥 수신 대상',          en:'👥 Recipients' },
            'as-recip-mode-default-label': { ko:'기본수신',           en:'Default' },
            'as-recip-mode-custom-label':  { ko:'개별수신',           en:'Custom' },
            'as-recip-add-btn':         { ko:'+ 수신자 추가',         en:'+ Add Recipient' },
            'as-reset-btn':             { ko:'기본값으로',            en:'Reset to Default' },
            'as-save-btn':              { ko:'저장',                 en:'Save' },
            'as-close-btn':             { ko:'닫기',                 en:'Close' },
        };
        Object.entries(_asTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        // [알람 일정 모달] 섹션 접기/펼치기 화살표 — 펼쳐진 적 없으면 기본 "▶ 펼치기"가 그대로
        // 남아있는데, 이건 _toggleAlarmSection()이 클릭될 때만 언어를 반영하기 때문 — 클릭 전에도
        // 맞는 언어로 보이도록 여기서 한 번 더 맞춰준다(공지 등록의 nm-sec-*도 같은 한계가 있었음).
        ['as-sec-info','as-sec-send','as-sec-recip','nm-sec-content','nm-sec-send','nm-sec-recip'].forEach(sid => {
            const sec   = document.getElementById(sid);
            const arrow = document.getElementById(sid + '-arrow');
            if (!sec || !arrow) return;
            const open = sec.style.display !== 'none';
            arrow.textContent = open ? (_en ? '▼ Collapse' : '▼ 접기') : (_en ? '▶ Expand' : '▶ 펼치기');
        });

        // [Notice 탭] 빈 상태 메시지
        const _noticeEmpty = document.getElementById('notice-empty-msg');
        if (_noticeEmpty) _noticeEmpty.textContent = _en ? 'No notices registered. Click [+ Add Notice] to add one.' : '등록된 공지가 없습니다. [+ 공지 등록] 버튼을 눌러 추가하세요.';

        // [Notice 탭] "예약 발송 규칙" 섹션 — 헤더/컬럼명 정적 텍스트 + 이미 불러온 데이터가 있으면
        // renderScheduleRuleTable()을 다시 호출해 행 내용(종류/날짜/시간/툴팁)까지 즉시 갱신
        const _srTexts = {
            'schedule-rule-section-label': { ko:'⏰ 예약 발송 규칙 (기간·반복 — 서버가 직접 스케줄을 돕니다)', en:'⏰ Scheduled Sending Rules (Date Range/Recurring — the server handles the schedule itself)' },
            'schedule-rule-refresh-btn':   { ko:'🔄 새로고침', en:'🔄 Refresh' },
            'schedule-rule-th-status':     { ko:'상태', en:'Status' },
            'schedule-rule-th-title':      { ko:'제목', en:'Title' },
            'schedule-rule-th-type':       { ko:'종류', en:'Type' },
            'schedule-rule-th-date':       { ko:'날짜', en:'Date' },
            'schedule-rule-th-time':       { ko:'시간', en:'Time' },
            'schedule-rule-th-action':     { ko:'액션', en:'Action' },
        };
        Object.entries(_srTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        if (window._scheduleRules !== undefined && window.renderScheduleRuleTable) window.renderScheduleRuleTable();

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
        // [Summary 탭] "프로젝트 상태" select — title 툴팁 + 옵션(DV/MP(EC)/EOL) 텍스트
        const _sumStatusSel = document.getElementById('sum-project-status');
        if (_sumStatusSel) {
            _sumStatusSel.title = _en
                ? 'EOL: grays out in project list and excludes from mail auto-matching. MP(EC): mail-analysis temp project — included in matching. Click cycles DV→EOL→MP(EC)→DV.'
                : "EOL로 표시하면 '프로젝트 불러오기' 목록에서 흐리게 구분 표시되고, 새 메일 자동매칭 대상에서도 제외됩니다. MP(EC)는 메일 분석 임시 프로젝트로 매칭 포함. 클릭: DV→EOL→MP(EC) 순환.";
            const _sumStatusOpts = _sumStatusSel.options;
            if (_sumStatusOpts[0]) _sumStatusOpts[0].textContent = _en ? '🔵 DV' : '🔵 DV';
            if (_sumStatusOpts[1]) _sumStatusOpts[1].textContent = _en ? '🟢 MP(EC)' : '🟢 MP(EC)';
            if (_sumStatusOpts[2]) _sumStatusOpts[2].textContent = _en ? '🔴 EOL' : '🔴 EOL';
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

        // [AI 문답 모달] 정적 UI (2026-09-07 신설) — 열려있는 상태로 언어 전환해도 즉시 반영
        const _qaDesc = document.getElementById('gantt-qa-desc');
        if (_qaDesc) _qaDesc.textContent = _en
            ? 'Answers based on the currently open project\'s Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · Address Book (name/dept/title) data. (Conversation content isn\'t saved — only the question text is kept, anonymously, to power the "Frequently asked" suggestions)'
            : '현재 열려있는 프로젝트의 Gantt · Summary · Customer SPEC · M.C Table · Elec Parts · 주소록(이름/부서/직함) 데이터를 근거로 답변합니다. (대화 내용 자체는 저장되지 않으며, 질문 문구만 "자주 묻는 질문" 추천에 쓰입니다)';
        const _qaDelayNotice = document.getElementById('gantt-qa-delay-notice');
        if (_qaDelayNotice) _qaDelayNotice.textContent = _en
            ? '⏱️ Some questions may take a bit longer to answer — if so, we\'ll keep you posted on screen.'
            : '⏱️ 질문에 따라 답변이 조금 늦어질 수 있어요 — 그럴 땐 화면에 진행 상황을 안내해드려요.';
        const _qaTargetLabel = document.getElementById('gantt-qa-target-label');
        if (_qaTargetLabel) _qaTargetLabel.textContent = _en ? '📂 Target' : '📂 질문 대상';
        // 드롭다운은 선택된 값을 잃지 않도록 옵션 텍스트만 다시 채움(재조회 없이 즉시 반영)
        const _qaSel = document.getElementById('gantt-qa-target-project');
        if (_qaSel && window._ganttQaPopulateProjectSelect) window._ganttQaPopulateProjectSelect();
        // 💡 [2026-09-12 신규] "자주 쓰는 질문" 행 — 위 "질문 대상"과 동일한 패턴으로 라벨/옵션 재반영
        const _qaFreqLabel = document.getElementById('gantt-qa-freq-label');
        if (_qaFreqLabel) _qaFreqLabel.textContent = _en ? '💡 Frequently used' : '💡 자주 쓰는 질문';
        const _qaFreqSel = document.getElementById('gantt-qa-freq-select');
        if (_qaFreqSel && window._ganttQaPopulateFreqSelect) window._ganttQaPopulateFreqSelect();
        const _qaOpenBtn = document.getElementById('gantt-qa-target-open-btn');
        if (_qaOpenBtn) {
            _qaOpenBtn.textContent = _en ? '🔓 Open' : '🔓 열기';
            _qaOpenBtn.title = _en
                ? 'Open this project (switch the current tab to it) and ask exactly as if it were already open'
                : '이 프로젝트를 열어서(현재 탭이 이 프로젝트로 전환됨) 실제로 열람 중인 것과 동일한 조건으로 질문합니다';
        }
        const _qaInput = document.getElementById('gantt-qa-input');
        if (_qaInput && !_qaInput.value) {
            const _qaTarget = window._ganttQaTargetProject;
            _qaInput.placeholder = _qaTarget
                ? (_en ? `Ask about [${_qaTarget.label}]... (Enter=Send, Shift+Enter=New line)` : `[${_qaTarget.label}] 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)`)
                : (_en ? 'Ask about this project... (Enter=Send, Shift+Enter=New line)' : '이 프로젝트에 대해 질문해보세요... (Enter=전송, Shift+Enter=줄바꿈)');
        }
        const _qaSendBtn = document.getElementById('gantt-qa-send-btn');
        if (_qaSendBtn) _qaSendBtn.textContent = _en ? 'Send' : '전송';
        const _qaClearBtn = document.getElementById('gantt-qa-clear-btn');
        if (_qaClearBtn) {
            _qaClearBtn.innerHTML = _en ? 'Clear<br>Chat' : '대화<br>삭제';
            _qaClearBtn.title = _en ? 'Clear all messages in the current chat' : '현재 대화 내용을 모두 지웁니다';
        }
        // 🎙️ [2026-09-08 신규] 음성 챗 버튼 — 🔊/🔇는 아이콘 그대로 title만, 음성문답/글자문답은
        //    현재 모드(_ganttQaVoiceMode)에 맞는 문구까지 함께 다시 그려야 하므로 각자의 갱신 함수를 재사용
        if (window._ganttQaUpdateVoiceBtn) window._ganttQaUpdateVoiceBtn();
        if (window._ganttQaUpdateMicBtn) window._ganttQaUpdateMicBtn();

        // [AI 분석 설정] 나머지 4개 그룹(모델선택/글자수/기간설정/학습로그) — 실제 텍스트 맵은
        // 04i-core-app-upload-utils-4.js의 _aiSettingsRefreshLang()에 있음(모달과 같은 파일에 둬서
        // 모달을 처음 열 때도 같은 함수로 커버 가능하게 함).
        if (window._aiSettingsRefreshLang) window._aiSettingsRefreshLang();

        // [AI 분석 설정] "📉 AI 요청 크기 제한" 섹션 (2026-09-07 신설)
        const _reqsizeTexts = {
            'ai-set-sec-reqsize-label': {
                ko: '📉 AI 요청 크기 제한 (무료 등급 대응)', en: '📉 AI Request Size Limits (free-tier)'
            },
            'ai-qa-max-tasks-label': { ko: '💬 AI 문답 최대 참고 업무 건수', en: '💬 AI Q&A — Max referenced tasks' },
            'ai-qa-max-tasks-hint': {
                ko: '권장값: 300건 (기본값) — Groq 등 크기 제한이 낮은 제공사라면 50~100건대로 줄이는 걸 권장합니다.',
                en: 'Recommended: 300 (default) — for providers with lower size limits (e.g. Groq), consider lowering to 50~100.'
            },
            'ai-qa-max-other-tasks-label': { ko: '🌐 다른 프로젝트 조회 시 최대 업무 건수', en: '🌐 Other-project lookup — Max tasks' },
            'ai-qa-max-other-tasks-hint': { ko: '권장값: 200건 (기본값)', en: 'Recommended: 200 (default)' },
        };
        Object.entries(_reqsizeTexts).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        const _reqsizeDescs = {
            'ai-qa-max-tasks-desc': {
                ko: 'AI 문답이 현재 프로젝트 업무 목록을 프롬프트에 담을 때 최대 몇 건까지 포함할지 정합니다. 업무가 많은 프로젝트에서 "요청 크기 초과" 오류가 나면 이 값을 줄여보세요(초과분은 건수만 알리고 생략됩니다).',
                en: 'Sets the max number of tasks from the current project included in the AI Q&A prompt. If you see a "request too large" error on a project with many tasks, try lowering this (the excess is summarized as a count only).'
            },
            'ai-qa-max-other-tasks-desc': {
                ko: 'AI 문답에서 "질문 대상"으로 다른 프로젝트를 골랐을 때(또는 AI가 스스로 다른 프로젝트를 조회할 때), 그 프로젝트의 업무 목록을 몇 건까지 포함할지 정합니다.',
                en: 'Sets the max number of tasks included when AI Q&A looks at another project — either one you pick as "Target", or one the AI looks up on its own.'
            },
        };
        Object.entries(_reqsizeDescs).forEach(([id, t]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? t.en : t.ko;
        });
        const _reqsizeResetBtns = ['ai-qa-max-tasks-reset-btn', 'ai-qa-max-other-tasks-reset-btn'];
        _reqsizeResetBtns.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = _en ? '🔄 Reset' : '🔄 기본값';
        });
        const _reqsizeNotice = document.getElementById('ai-set-reqsize-notice');
        if (_reqsizeNotice) _reqsizeNotice.innerHTML = _en
            ? `⚠️ <b>Free-tier constraint notice</b> — Free-tier limits vary by AI provider and can change without notice, so the console for each provider is the most accurate source. There are broadly two kinds of limits:<br>
               · <b>Count-based (quota)</b> — a cap on requests per day/minute (e.g. Gemini). Once hit, it clears after some time.<br>
               · <b>Size-based (TPM etc.)</b> — a cap on tokens per single request (e.g. Groq's free tier). On a project with many tasks, AI Summary/Q&A prompts can exceed this cap and <b>keep failing no matter how long you wait</b> — lower the values below or switch provider to fix it.<br>
               · OpenAI has no free tier at all (a card is required).`
            : `⚠️ <b>무료 등급 제약 안내</b> — AI 제공사마다 무료로 쓸 수 있는 범위가 다르고 수시로 바뀔 수 있어, 정확한 수치는 각 콘솔에서 확인하는 게 가장 정확합니다. 알려진 제약 종류는 크게 두 가지입니다:<br>
               · <b>횟수형(quota)</b> — 하루/분당 몇 번까지만 요청 가능(예: Gemini). 한도에 걸리면 시간이 지나야 풀립니다.<br>
               · <b>크기형(TPM 등)</b> — 요청 1건의 토큰 수 자체에 상한(예: Groq 무료 등급). 업무가 많은 프로젝트에서 AI 요약·문답을 돌리면 프롬프트가 이 상한을 넘어 <b>기다려도 계속 실패</b>합니다 — 아래 값을 줄이거나 다른 제공사로 바꿔야 풀립니다.<br>
               · OpenAI는 무료 등급이 아예 없습니다(카드 등록 필요).`;

        // [내 팀] "미설정" 플레이스홀더 갱신 (팀이 이미 인식된 경우엔 팀명 그대로 유지)
        if (window._updateMyTeamLabel) window._updateMyTeamLabel();

        // [업무 보관함 모달] 헤더 번역
        // 💡 [2026-08-25] childNodes[0]만 바꾸는 이유 — 이 span 안엔 ℹ️ 도움말 아이콘(nested span)이
        //    같이 들어있어서, textContent를 통째로 덮으면 그 아이콘/툴팁까지 같이 사라진다.
        // 🐛 [2026-09-12 버그수정] childNodes[0]은 nested span(id=inbox-modal-title-text) *앞*의
        //    순수 이모지 텍스트 노드일 뿐인데, 예전엔 여기다 "AI Task Inbox" 전체 문구까지 넣고
        //    있어서 — 바로 옆 nested span도 'ui' 맵의 'inbox-modal-title-text' 항목으로 별도 갱신되며
        //    같은 문구를 다시 그려 "AI Task InboxAI Task Inbox"처럼 중복 표시되고 있었다. 이모지만
        //    남기고, 실제 제목 문구는 아래 nested span(= uiMap 'inbox-modal-title-text')에게 맡긴다.
        const _ibxTitle = document.getElementById('inbox-modal-title');
        if (_ibxTitle) _ibxTitle.childNodes[0].textContent = '📦 ';
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
        // 💡 [2026-09-07 신규 버튼] "🧹 저장공간 정리" — 09-07에 새로 추가됐는데 이 정적 버튼 라벨 자체는
        //    toggleLang() 등록이 빠져있었음(클릭 시 뜨는 확인창/토스트는 처음부터 이미 이중언어였음).
        const _ibxCleanupBtn = document.getElementById('inbox-cleanup-storage-btn');
        if (_ibxCleanupBtn) {
            _ibxCleanupBtn.textContent = _en ? '🧹 Clean Up Storage' : '🧹 저장공간 정리';
            _ibxCleanupBtn.title = _en
                ? 'Clears the stored mail source from completed (placed/sent) items, and trims old items if too many have piled up, to free storage space.'
                : '완료(배치됨/전송됨) 항목의 저장된 메일 원문을 지우고, 너무 많이 쌓였으면 오래된 항목을 정리해 저장 공간을 확보합니다.';
        }

        const _ibxSubTexts = {
            'inbox-subqueue-header':     { ko:'📬 미분류 / 신규발신자 / 자동폐기', en:'📬 Unclassified / New Senders / Auto-discarded' },
            'inbox-unmatched-label':     { ko:'📭 미분류',              en:'📭 Unclassified' },
            'inbox-newsender-label':     { ko:'👤 신규발신자',          en:'👤 New Sender' },
            'inbox-discarded-label':     { ko:'🗑 자동폐기',            en:'🗑 Discarded' },
            'inbox-unmatched-unit':      { ko:'건',                     en:'' },
            'inbox-newsender-unit':      { ko:'건',                     en:'' },
            'inbox-discarded-unit':      { ko:'건',                     en:'' },
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

        // [Gantt #검색 바] 이미 열려있는 상태에서 언어 전환 시 즉시 반영
        if (window._gsRefreshLang) window._gsRefreshLang();

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

        // [최소화된 모달 타스크바 칩] 위에서 각 모달 제목을 전부 갱신한 뒤 마지막에 호출 — 페이지
        // 로드 시 자동 최소화되는 모달(AI 문답/AI 요약 등)의 칩 라벨이 최소화 당시 언어로 고정되는
        // 문제 수정 (js/19-shared-modal-drag.js 참고).
        if (window._refreshMinimizedChipLabels) window._refreshMinimizedChipLabels();
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
        if (!globalData || globalData.length < 2) { alert(window._t('Gantt 데이터가 없습니다.', 'No Gantt data.')); return; }
        const level0Rows = [];
        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i];
            if (row && row._level === 0 && row._calcStartTs) {
                level0Rows.push({ name: (row._origDev || '').toString().trim(), startTs: row._calcStartTs });
            }
        }
        if (level0Rows.length === 0) { alert(window._t('시작일이 있는 0레벨 업무를 찾을 수 없습니다.', 'Could not find a level-0 task with a start date.')); return; }

        const result = deriveMilestoneDatesFromLevel0(level0Rows);
        if (!result || result.error) {
            alert(window._t(
                '0레벨 업무 중 "' + (result ? result.missing.join('", "') : '') + '"을(를) 찾을 수 없습니다. 업무명을 확인해주세요.',
                'Could not find the level-0 task "' + (result ? result.missing.join('", "') : '') + '". Please check the task name.'
            ));
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
        alert(window._t('Gantt 0레벨 업무 기준으로 실적 일정이 반영되었습니다.', 'Actual dates were synced from the Gantt level-0 tasks.') + (planSynced
            ? window._t('\n(저장된 "최초 계획(킥오프)" 기준으로 계획 일정도 함께 반영했습니다)', '\n(Plan dates were also synced from the saved "initial plan (kickoff)")')
            : window._t('\n(저장된 "최초 계획(킥오프)"이 없어 계획 일정은 그대로 두었습니다 — 신규 프로젝트 등록 시에만 자동 저장됩니다)', '\n(No saved "initial plan (kickoff)" — plan dates were left unchanged; it is only auto-saved when a new project is registered)')));
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
        }).catch(err => { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; alert(window._t("번역 중 오류가 발생했습니다.", "An error occurred during translation.")); });
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
        }).catch(err => { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; alert(window._t("번역 중 오류가 발생했습니다.", "An error occurred during translation.")); });
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

