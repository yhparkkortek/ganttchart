// [분리됨] 원본: js/04-core-app.js 의 4468~5785행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 파일 업로드 및 유틸리티 로직 1/5
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
        // 💡 [2026-08-31 신규] 지연/예정 마감 둘 다 기준일 기준 ±이 기간(기본 21일, [🤖 AI 도구 > ⚙️ 설정
        //    > 📅 AI 요약 기간 설정]에서 조절)까지만 담음 — 예전엔 예정 마감이 D-7로 하드코딩,
        //    지연은 기간 제한 없이(지연일수 큰 순 상위 15건)라서 프롬프트 지침에 "±21일 분석"이라고
        //    적어도 실제 데이터 자체가 그 범위를 담고 있지 않아 반영되지 않는 문제가 있었음.
        // 💡 "검색 범위(rangeDays)"와 "임박(긴급) 여부"는 서로 다른 개념 — rangeDays 안에 있는 예정
        //    마감 중에서도 urgentDays 이내인 것만 따로 urgent:true로 표시해서, AI가 "범위 내 전체"와
        //    "그중 특히 급한 것"을 구분해 다룰 수 있게 함.
        const rangeDays = window.getAiSummaryRangeDays ? window.getAiSummaryRangeDays() : window._AI_SUMMARY_RANGE_DAYS_DEFAULT;
        const urgentDays = window.getAiUrgentDays ? window.getAiUrgentDays() : window._AI_URGENT_DAYS_DEFAULT;

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
                if (-diffDays <= rangeDays) delayed.push({ idx: x.idx, task: label, assignee: assignee, startDate: startRaw, dueDate: planRaw, overdueDays: -diffDays, detail: detail, detailAnswer: detailAnswer, mailExcerpt: mailExcerpt, sender: mailPeople.sender, receiver: mailPeople.receiver });
            } else if (diffDays <= rangeDays) {
                dueSoon.push({ idx: x.idx, task: label, assignee: assignee, startDate: startRaw, dueDate: planRaw, dDay: diffDays, urgent: diffDays <= urgentDays, detail: detail, detailAnswer: detailAnswer, mailExcerpt: mailExcerpt, sender: mailPeople.sender, receiver: mailPeople.receiver });
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
            recentLogs: recentLogs,
            rangeDays: rangeDays,
            urgentDays: urgentDays
        };
    };

    // 💡 위 데이터를 AI 프롬프트로 변환 — 파싱 안정성을 위해 구조화된 JSON으로만 답하도록 명시적으로 요청
    // 💡 [2026-08-24 신규] 메일분석 프롬프트(getSystemPrompt/_msBuildDefaultPrompt)와 완전히 동일한
    //    트릭 재사용: 진짜 파라미터로 부르면 진짜 프롬프트가 나오고, 플레이스홀더 "문자열"을 그대로
    //    파라미터 자리에 넣어서 부르면 그 문자열이 그대로 본문에 박힌 "편집용 템플릿"이 나온다.
    //    한 함수로 "실제 프롬프트 생성"과 "편집 기본값 생성"을 둘 다 해결.
    window._buildProjectSummaryPromptFromData = function(customer, model, pm, totalTasks, countDone, countProgress, countPending, countDelay, delayedList, dueSoonList, recentLogs, rangeDays, urgentDays) {
        return `당신은 프로젝트 관리 보조 AI입니다. 아래 Gantt 프로젝트 현황 데이터를 보고, 실무자가 한눈에 파악할 수 있는 간단한 프로젝트 분석 보고서를 작성하세요.

[기준 정보]
- 오늘 날짜: \${todayDate}

[프로젝트]
- 고객사/모델: ${customer} ${model}
- PM: ${pm}
- 전체 업무 수: 총 ${totalTasks}건 (완료 ${countDone} / 진행 ${countProgress} / 대기 ${countPending} / 지연 ${countDelay})

[지연 업무 목록 (최근 ${rangeDays}일 이내)]
${delayedList}

[예정 마감 목록 (향후 ${rangeDays}일 이내 — 🔴 표시는 그중 특히 임박한 D-${urgentDays} 이내 건)]
${dueSoonList}

[최근 변경 이력]
${recentLogs}

[지침]
- 🔒 상세내용 필수 반영(업무명·날짜만 보고 뭉뚱그려 판단 금지): 위 목록의 각 줄에 "내용:"(상세내용) / "대응:"(담당자 답변) / "원문메일:"(관련 메일 발췌)이 붙어 있으면 반드시 그 내용을 읽고, 실제로 무슨 이슈·원인·진행 상황인지 파악해서 총평/업무 요약/리스크/액션추천에 반영하세요. "지연되었으니 위험함"처럼 날짜·지연일수만 근거로 한 뭉뚱그린 판단 대신, 왜 지연/임박됐는지·무엇이 막혀 있는지를 상세내용에서 찾아 구체적으로 설명하세요. 해당 필드가 아예 없는 업무만 날짜·상태 정보로 판단하세요.
- **기간 집중 분석**: 기준 날짜(\${todayDate})를 중심으로 과거 ${rangeDays}일 및 향후 ${rangeDays}일 이내에 해당하는 업무, 마감일, 최근 변경사항을 집중 분석하여 요약하세요. (위 두 목록은 이미 이 범위로 필터링되어 있습니다)
- 단순 시스템상의 장기 지연보다는 현재 프로젝트 진행에 실질적인 타격을 주는 임박 마감 및 최근 변경 이력에 주목하세요.
- **🔴 표시 우선순위**: [예정 마감 목록]에서 🔴 표시가 붙은 항목은 D-${urgentDays} 이내로 특히 임박한 마감이니 리스크/액션추천에서 우선적으로 다루고, 🔴가 없는 나머지(범위 내이지만 아직 여유 있는 건)는 참고 수준으로만 다루세요.
- **데이터 일치 및 엄격 준수**: 리스크 및 액션추천 작성 시 제공된 데이터에 존재하는 업무 ID, 업무명, 담당자명을 변형 없이 그대로 인용하세요.
- 액션추천은 PM 포함, 데이터에 명시된 해당 담당자/부서가 즉시 실행할 수 있는 행동으로 작성하세요.
- 📌 업무 번호 인용 필수: 특정 업무를 가리킬 때는 위 목록의 각 줄 맨 앞에 있는 "#G숫자"를 반드시 그대로 포함해서 언급하세요(예: "#G98 업무는..."). 이 번호를 클릭하면 실제 업무로 이동하는 기능이 있으니, 번호 없이 업무명만 쓰지 마세요.

다음 JSON 형식으로만 답하세요 (JSON 외 추가 텍스트 금지):
{
  "신호등": "🟢 또는 🟡 또는 🔴 중 하나만 선택 (전체 지연 비율과 심각도 기준으로 판단)",
  "총평": "한 문장 총평",
  "업무 요약": [
    "기준 날짜(±${rangeDays}일) 범위 내 주요 진행/변경된 업무 요약",
    "향후 ${rangeDays}일 내 추진 예정 항목 요약 (🔴 임박 항목 우선 언급)"
  ],
  "리스크": ["#G98 업무는 ~해서 위험함(왜 위험한지 포함)"],
  "액션추천": ["담당자명(또는 부서명): #G98 업무를 ~하세요"]
}

※ 업무 요약, 리스크, 액션추천은 각각 최대 5개까지 작성하며, 근거 데이터가 부족한 항목은 빈 배열([])로 반환하세요.
총평/업무 요약/리스크/액션추천에서 특정 업무의 일정을 언급할 때는 위 목록의 "기간:" 표시(예: 8/26~8/27)를 그대로 쓰세요. YYYY-MM-DD로 풀어쓰지 마세요.`;
    };

    // 💡 코드 기본값(진짜 로직) — "🔄 기본값으로 초기화" 버튼이 참조. localStorage 상태와 무관하게
    //    항상 이 값이 "진짜 코드 기본 템플릿"임(자기순환 방지, getSystemPrompt와 동일한 이유).
    window._defaultProjectSummaryPromptTemplate = window._buildProjectSummaryPromptFromData(
        '${customer}', '${model}', '${pm}', '${totalTasks}', '${countDone}', '${countProgress}', '${countPending}', '${countDelay}', '${delayedList}', '${dueSoonList}', '${recentLogs}', '${rangeDays}', '${urgentDays}'
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
                let line = `- ${x.urgent ? '🔴 ' : ''}#G${x.idx} ${x.task} (담당:${x.assignee}, 기간:${range}, D-${x.dDay})`;
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
        // 💡 [2026-08-31 신규] 지연/예정 마감 조회 범위(기본 21일, [🤖 AI 도구 > ⚙️ 설정]에서 조절) — 사용자가
        //    프롬프트를 직접 고쳐서 "${rangeDays}"를 넣으면(또는 기본 템플릿의 "D-${rangeDays} 이내"
        //    라벨처럼) 실제 설정값이 그대로 반영됨. 이 토큰 자체는 예전 프롬프트(이 기능 이전에 저장된
        //    커스텀 프롬프트)에는 없을 수 있는데, 그 경우도 rep()이 안전하게 아무것도 안 바꾸고 넘어감.
        result = rep(result, '${rangeDays}', d.rangeDays != null ? d.rangeDays : (window.getAiSummaryRangeDays ? window.getAiSummaryRangeDays() : window._AI_SUMMARY_RANGE_DAYS_DEFAULT));
        // 💡 [2026-08-31 신규] "검색 범위(rangeDays)"와 "임박(긴급) 기준(urgentDays)"은 서로 다른 개념 —
        //    예정 마감 목록은 rangeDays 범위 전체를 담되, 그중 urgentDays 이내인 건만 🔴로 표시(위
        //    dueSoonText 렌더링 참고). 프롬프트에서 "${urgentDays}"를 쓰면 이 기준값이 그대로 반영됨.
        result = rep(result, '${urgentDays}', d.urgentDays != null ? d.urgentDays : (window.getAiUrgentDays ? window.getAiUrgentDays() : window._AI_URGENT_DAYS_DEFAULT));
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
            if (window.showToast) window.showToast('🤖 AI 요약을 생성했습니다.', 'info');
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
        // 💡 [2026-09-03 신규/수정] 각 <li>에 onclick(_aiToggleLineRefs) + hover 하이라이트 추가.
        //    "기간:X~Y" 중복 제거도 여기서 — AI 요약 JSON 텍스트도 배지와 중복될 수 있음.
        const _liHover = "this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.12)':'rgba(44,95,138,0.04)';";
        const _liOut   = "this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.07)':'';";
        const _liClick = "window._aiToggleLineRefs(this, event);";
        const _liStyle = `margin-bottom:4px; cursor:pointer; border-radius:3px; transition:background .12s; list-style-position:outside;`;
        const _processLiText = function(x) {
            // AI 요약 텍스트도 "기간:X/Y~X/Y" 중복 제거
            return window._linkifyTaskRefs(escapeHtml(x).replace(/,?\s*기간:\d+\/\d+(?:~\d+\/\d+)?/g, ''));
        };
        const riskHtml = (r.리스크 && r.리스크.length)
            ? '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.리스크.map(function(x) { return `<li style="${_liStyle}" onmouseover="${_liHover}" onmouseout="${_liOut}" onclick="${_liClick}">${_processLiText(x)}</li>`; }).join('') + '</ul>'
            : '<div style="color:#999; font-size:12px;">특별한 리스크가 감지되지 않았습니다.</div>';
        const actionHtml = (r.액션추천 && r.액션추천.length)
            ? '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.액션추천.map(function(x) { return `<li style="${_liStyle}" onmouseover="${_liHover}" onmouseout="${_liOut}" onclick="${_liClick}">${_processLiText(x)}</li>`; }).join('') + '</ul>'
            : '<div style="color:#999; font-size:12px;">추천 액션이 없습니다.</div>';
        // 💡 [2026-08-31 신규] "업무 요약" — 기본 프롬프트엔 없는 선택적 항목이라, 커스텀 프롬프트를
        // 안 쓰는 사람에겐 이 값이 항상 빈 배열이다. 그런 경우 리스크/액션추천처럼 "없습니다" 문구를
        // 굳이 보여주지 않고 섹션 자체를 통째로 생략한다(안 쓰는 기능이 빈 칸으로 계속 보이면 어색함).
        const taskSummaryHtml = (r.업무요약 && r.업무요약.length)
            ? '<div style="margin-bottom:14px;"><div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">📋 업무 요약</div>'
                + '<ul style="margin:0; padding-left:18px; font-size:12.5px;">' + r.업무요약.map(function(x) { return `<li style="${_liStyle}" onmouseover="${_liHover}" onmouseout="${_liOut}" onclick="${_liClick}">${_processLiText(x)}</li>`; }).join('') + '</ul></div>'
            : '';

        body.innerHTML = `
        <div id="ai-summary-report-content">
            <div style="font-size:11px; color:#999; margin-bottom:12px;">생성 시각: ${genStr}</div>
            <div style="display:flex; align-items:center; gap:10px; padding:14px; background:#f8f9fa; border-radius:8px; margin-bottom:14px;">
                <span style="font-size:28px;">${r.신호등 || '🟡'}</span>
                <span style="font-size:13px; font-weight:bold; color:#333; cursor:pointer; border-radius:3px; padding:1px 2px; transition:background .12s;" onmouseover="this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.12)':'rgba(44,95,138,0.04)';" onmouseout="this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.07)':'';" onclick="window._aiToggleLineRefs(this, event);">${window._linkifyTaskRefs(escapeHtml(r.총평 || '').replace(/,?\s*기간:\d+\/\d+(?:~\d+\/\d+)?/g, ''))}</span>
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
            <div id="ai-summary-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:360px;">
                <div id="ai-summary-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 요약</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.openProjectSummaryPromptModal()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" title="이 리포트를 만들 때 AI에게 보내는 프롬프트(지시문)를 팀 공용으로 편집합니다" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s;">✏️ 프롬프트</button>
                        <button onclick="document.getElementById('ai-summary-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
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
            <div id="ai-summary-prompt-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="ai-summary-prompt-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ AI 요약 — 프롬프트 편집</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button onclick="event.stopPropagation(); window.showPsPromptLogs()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s, border-color .15s;">🕒 이력</button>
                        <button onclick="document.getElementById('ai-summary-prompt-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
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
                    <button id="ai-summary-save-btn" onclick="window.saveProjectSummaryPromptFromModal()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">저장</button>
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

