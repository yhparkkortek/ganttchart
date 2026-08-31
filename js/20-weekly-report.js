    // ====================================================
    // 📅 주간 업무 보고 (신규 기능 — 기존 코드와 분리된 블록)
    // ====================================================
    // ── 날짜 유틸 ─────────────────────────────────────────
    function wrGetWeekRange(baseDate) {
        // 월요일 00:00 ~ 금요일 23:59:59 기준 주간 범위
        const d = new Date(baseDate);
        const day = d.getDay(); // 0=일 ... 6=토
        const diffToMon = (day === 0) ? -6 : (1 - day);
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
        mon.setHours(0,0,0,0);
        const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
        fri.setHours(23,59,59,999);
        return { start: mon.getTime(), end: fri.getTime() };
    }
    function wrFormatMD(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const yy = String(d.getFullYear()).slice(-2);
        return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} '${yy}`;
    }
    // 💡 PPT 출력 전용: 년도 제외 (화면 표시는 년도 포함 유지)
    function _pptFormatMD(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }
    function wrGetWeekNumber(ts) {
        const d = new Date(ts);
        const start = new Date(d.getFullYear(), 0, 1);
        const days = Math.floor((d - start) / 86400000);
        return Math.ceil((days + start.getDay() + 1) / 7);
    }
    function wrTaskName(row) {
        if (!row) return "";
        if (row._level === 0) return row._origDev || "";
        if (row._level === 1) return row._origT1 || "";
        if (row._level === 2) return row._origT2 || "";
        if (row._level === 3) return row._origT3 || "";
        if (row._level === 4) return row._origT4 || "";
        return "";
    }

    // 베이스 색상 1개 → 진하게/연하게 자동 파생 (hex 입력, hex 출력)
    function wrDeriveColors(baseHex) {
        baseHex = (baseHex || '19C3D6').replace('#', '');
        const r = parseInt(baseHex.substr(0,2),16), g = parseInt(baseHex.substr(2,2),16), b = parseInt(baseHex.substr(4,2),16);
        const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255;
        let h, s, l = (max+min)/2;
        const d = max-min;
        if (d === 0) { h = 0; s = 0; }
        else {
            s = l > 0.5 ? d/(2-max-min) : d/(max+min);
            if (max === r/255) h = ((g/255-b/255)/d + (g<b?6:0));
            else if (max === g/255) h = ((b/255-r/255)/d + 2);
            else h = ((r/255-g/255)/d + 4);
            h *= 60;
        }
        function hslToHex(h, s, l) {
            l = Math.max(0, Math.min(1, l));
            const c = (1 - Math.abs(2*l-1)) * s;
            const x = c * (1 - Math.abs((h/60) % 2 - 1));
            const m = l - c/2;
            let rr,gg,bb;
            if (h < 60) [rr,gg,bb]=[c,x,0]; else if (h<120) [rr,gg,bb]=[x,c,0];
            else if (h<180) [rr,gg,bb]=[0,c,x]; else if (h<240) [rr,gg,bb]=[0,x,c];
            else if (h<300) [rr,gg,bb]=[x,0,c]; else [rr,gg,bb]=[c,0,x];
            const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
            return (toHex(rr)+toHex(gg)+toHex(bb)).toUpperCase();
        }
        return {
            base:  hslToHex(h, s, l),
            dark:  hslToHex(h, Math.min(1, s+0.05), Math.max(0, l-0.22)),   // 진하게
            light: hslToHex(h, Math.max(0.15, s-0.3), Math.min(0.97, l+0.42)), // 연하게(배경)
            tint:  hslToHex(h, Math.max(0.25, s-0.15), Math.min(0.88, l+0.28))  // 표 헤더 배경 - 기준색이 또렷이 보이는 농도
        };
    }

    // 💡 [2026-08-30 통합] 별도 "🎨 PPT 색상" 피커(구 window.wrPptBaseColor 값)를 없애고, 로고 팔레트에서
    //    지금 실제 적용 중인 테마 색(없으면 기본 청록과 같은 계열인 19C3D6)을 그대로 PPT 기준색으로 쓴다
    //    — exportWeeklyReportPPT() 호출부에서 window._cpLiveAppliedHex를 직접 참조(아래 wrDeriveColors 호출부 참고).

    window.projectMeta = window.projectMeta || {
        프로젝트코드: "",
        프로젝트명: "",
        PN_모델명: "",
        기구담당자: "",
        FW담당자: "",
        고객사: "",      // 💡 신규: Summary 탭에서 프로젝트 단위로 입력 (기존 행 데이터의 고객 컬럼은 그대로 둠)
        모델명: "",      // 💡 신규
        인치: "",         // 💡 신규
        고객모델명: "",
        KTKPN: "",
        KTK모델명: "",
        프로젝트담당자: "",
        HW담당자: "",
        Module담당자: "",
        TSP담당자: "",
        메일키워드: "",   // 💡 신규: 메일 자동수집·분석 시 이 프로젝트로 매칭할 별칭/약어, 쉼표 구분
        완료여부: ""      // 💡 신규: "" = 진행중, "완료" = 완료된 프로젝트 (프로젝트 불러오기 목록 구분 표시 + 메일 자동매칭 제외용)
    };
    // 💡 기존에 저장된 파일에는 위 키들이 없을 수 있으므로 누락 시 빈 값으로 보강
    ['고객사', '모델명', '인치', '고객모델명', 'KTKPN', 'KTK모델명', '프로젝트담당자', 'HW담당자', 'Module담당자', 'TSP담당자', '메일키워드', '완료여부'].forEach(function(k) {
        if (window.projectMeta[k] === undefined) window.projectMeta[k] = "";
    });

    // ↓↓↓ 여기에 새로 추가 ↓↓↓
    function wrExtractAssignee(contentStr) {
        if (!contentStr) return "";
        // 대괄호 안/밖 모두에서 "A → B" 형태를 찾되, 화살표 좌우가 '발신'/'수신' 라벨 그 자체인 경우만 제외
        const matches = [...contentStr.matchAll(/([^\n\[\]→]{2,40}?)\s*(?:→|->)\s*([^\n\[\]→]{2,40}?)(?=[\]\n]|$)/g)];
        for (const m of matches) {
            const from = m[1].trim(), to = m[2].trim();
            if (!from || !to) continue;
            if (from === '발신' && to === '수신') continue;   // [발신→수신] 라벨만 제외
            return `${from}→${to}`;
        }
        return "";
    }

    function wrExtractIssue(contentStr) {
        if (!contentStr) return { issue: "", fix: "" };
        const issueM = contentStr.match(/\[문제점\]([^\n\[]*)/);
        const fixM   = contentStr.match(/\[대책\]([^\n\[]*)/);
        return { issue: issueM ? issueM[1].trim() : "", fix: fixM ? fixM[1].trim() : "" };
    }
    
    // 상세내용 표시용: [문제점]/[대책] 줄은 하단 표에서 이미 보여주므로 본문에서는 제거
    function wrStripIssueLines(contentStr) {
        if (!contentStr) return "";
        return contentStr
            .split('\n')
            .filter(line => !/^\[문제점\]/.test(line.trim()) && !/^\[대책\]/.test(line.trim()))
            .join('\n')
            .trim();
    }
    // ↑↑↑ 여기까지 추가 ↑↑↑

    function wrOverlaps(rowStart, rowEnd, rangeStart, rangeEnd) {
        if (!rowStart && !rowEnd) return false;
        const s = rowStart || rowEnd;
        const e = rowEnd || rowStart;
        return s <= rangeEnd && e >= rangeStart;
    }

    // ── 이번주/다음주 분류 ────────────────────────────────
    window.wrBaseDate = window.wrBaseDate || new Date();   // 주차 이동의 기준 날짜 (기본값: 오늘)

    // 💡 [2026-08-21][WBS 레벨 필터] Weekly Report에 표시할 업무를 L0~L4 중 선택한 레벨로만 좁힘. 기본값 L3/L4.
    window.wrState = window.wrState || { levelFilter: [3, 4] };
    // (Gantt 차트 상단의 LEVEL(WBS) 필터와 동일한 filter-group/filter-label/btn 스타일을 그대로 사용)
    window.wrSyncLevelFilterUI = function() {
        const group = document.getElementById('wr-level-filter-group');
        if (!group) return;
        const arr = window.wrState.levelFilter || [];
        group.querySelectorAll('.btn[data-level]').forEach(function(btn) {
            btn.classList.toggle('active', arr.indexOf(Number(btn.dataset.level)) !== -1);
        });
        const label = document.getElementById('wr-level-all-label');
        if (label) label.classList.toggle('active', arr.length === 5);
        // 💡 [수정] Weekly Report는 기본값 자체가 "전체(All)"가 아니라 L3/L4라서, Gantt와 같은 기준으로
        //    "전체가 아니면 강조"를 적용하면 평소에도 계속 파란 배경으로 보여 Gantt WBS 버튼(평소엔
        //    흰 바탕, 마우스 올릴 때만 파란 바탕)과 다르게 보였음 — 강조 없이 항상 기본 action-btn
        //    모양(흰 바탕/파란 글씨 → 호버 시 파란 바탕/흰 글씨)만 쓰도록 되돌림.
    };
    window.wrToggleLevel = function(level) {
        const arr = window.wrState.levelFilter;
        const idx = arr.indexOf(level);
        if (idx === -1) arr.push(level); else arr.splice(idx, 1);
        window.wrSyncLevelFilterUI();
        if (window.showWeeklyReport) window.showWeeklyReport();
    };
    // LEVEL(WBS) 라벨 클릭 — 전체(0~4) 선택 ↔ 직전 선택 상태 토글 (Gantt 필터 라벨과 동일한 동작)
    window.wrToggleLevelAll = function() {
        const cur = window.wrState.levelFilter || [];
        if (cur.length === 5) {
            window.wrState.levelFilter = (window._wrLevelFilterPrev && window._wrLevelFilterPrev.length) ? window._wrLevelFilterPrev.slice() : [3, 4];
        } else {
            window._wrLevelFilterPrev = cur.slice();
            window.wrState.levelFilter = [0, 1, 2, 3, 4];
        }
        window.wrSyncLevelFilterUI();
        if (window.showWeeklyReport) window.showWeeklyReport();
    };

    window.wrClassifyTasks = function() {
        const thisWeek = wrGetWeekRange(window.wrBaseDate);
        const nextWeekBase = new Date(window.wrBaseDate); nextWeekBase.setDate(nextWeekBase.getDate() + 7);
        const nextWeek = wrGetWeekRange(nextWeekBase);

        const thisList = [];
        const nextList = [];

        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i];
            if (!row) continue;
            // 리프 노드만: 다음 행이 없거나, 다음 행의 레벨이 현재보다 깊지 않으면(=자식 없음) 채택
            const myLevel = (typeof row._level === 'number') ? row._level : 4;
            const nextRow = globalData[i + 1];
            const nextLevel = (nextRow && typeof nextRow._level === 'number') ? nextRow._level : -1;
            const isLeaf = !(nextRow && nextLevel > myLevel);
            if (!isLeaf) continue;
            // 💡 [WBS 레벨 필터] 선택한 레벨(기본 L3/L4)에 해당하는 업무만 주간보고서에 표시
            if (window.wrState.levelFilter && window.wrState.levelFilter.indexOf(myLevel) === -1) continue;
            const s = row._calcStartTs, e = row._calcPlanTs;
            const name = wrTaskName(row);
            if (!name) continue;
            const dateLabel = `(${wrFormatMD(s)}~${wrFormatMD(e)})`;

            if (wrOverlaps(s, e, thisWeek.start, thisWeek.end)) {
                thisList.push({ idx: i, row, text: `${name} ${dateLabel}` });
            } else if (wrOverlaps(s, e, nextWeek.start, nextWeek.end)) {
                nextList.push({ idx: i, row, text: `${name} ${dateLabel}` });
            }
        }
        return { thisWeek, nextWeek, thisList, nextList, thisWeekNo: wrGetWeekNumber(thisWeek.start), nextWeekNo: wrGetWeekNumber(nextWeek.start) };
    };

        // ↓↓↓ 여기에 새로 추가 ↓↓↓
    const WR_MILESTONE_KEYWORDS = ['RFQ','NPI','KICK OFF','PROTO A','PROTO B','PROTO DR','RELIABILITY','신뢰성','TOOLING','CERTIFICATION','인증','ES','E3','PP','DVR','P0','MP'];
    function wrIsMilestone(name) {
        if (!name) return false;
        const upper = name.toUpperCase();
        // 단어 경계 기준 매칭: 키워드가 알파벳/숫자에 붙어 있지 않고 독립된 토큰일 때만 인정
        // (한글 키워드는 단어경계가 없어 그냥 포함 여부로 검사)
        return WR_MILESTONE_KEYWORDS.some(kw => {
            const kwUpper = kw.toUpperCase();
            if (/^[가-힣]+$/.test(kw)) return upper.includes(kwUpper);
            const re = new RegExp(`(?<![A-Z0-9])${kwUpper.replace(/[().]/g, '\\$&')}(?![A-Z0-9])`);
            return re.test(upper);
        });
    }
    // ↑↑↑ 여기까지 추가 ↑↑↑
        
    // ── 0레벨 진척 타임라인 데이터 ───────────────────────
    window.wrGetLevel0Timeline = function() {
        const items = [];
        let minTs = Infinity, maxTs = -Infinity;
        for (let i = 1; i < globalData.length; i++) {
            const row = globalData[i];
            if (!row || row._level !== 0) continue;
            const s = row._calcStartTs, e = row._calcPlanTs;
            if (!s && !e) continue;
            const name = wrTaskName(row) || `(이름없음 #${i})`;
            items.push({ idx: i, name, start: s || e, end: e || s });
            if (s) minTs = Math.min(minTs, s);
            if (e) maxTs = Math.max(maxTs, e);
        }
        if (items.length === 0 || minTs === Infinity) return { items: [], minTs: null, maxTs: null };
        return { items, minTs, maxTs };
    };

    function wrRenderTimeline() {
        const tl = window.wrGetLevel0Timeline();
        if (tl.items.length === 0) return '<div style="color:#999; padding:10px 0;">' + (window._currentLang === 'en' ? 'No date set on Level 0 items — timeline unavailable.' : '0레벨 항목에 날짜가 없어 타임라인을 표시할 수 없습니다.') + '</div>';
        const span = Math.max(1, tl.maxTs - tl.minTs);
        const sorted = tl.items.slice().sort(function(a, b) { return a.start - b.start; });

        const MIN_GAP = 8;
        const positions = sorted.map(function(it) { return ((it.start - tl.minTs) / span) * 100; });
        for (let pass = 0; pass < 5; pass++) {
            for (let i = 1; i < positions.length; i++) {
                if (positions[i] - positions[i-1] < MIN_GAP) {
                    const mid = (positions[i] + positions[i-1]) / 2;
                    positions[i-1] = mid - MIN_GAP / 2;
                    positions[i]   = mid + MIN_GAP / 2;
                }
            }
            positions[0] = Math.max(0, positions[0]);
            positions[positions.length-1] = Math.min(100, positions[positions.length-1]);
        }

        const parts = sorted.map(function(it, i) {
            const dotPct    = ((it.start - tl.minTs) / span) * 100;
            const bubblePct = positions[i];
            const isAbove   = i % 2 === 0;
            const cls       = isAbove ? 'above' : 'below';
            return '<div class="sum-tl-dot" data-idx="' + i + '" style="left:' + dotPct + '%; cursor:pointer;" onclick="window.sumTlBringToFront(' + i + ', \'wr-level0-timeline\')"></div>'
                 + '<div class="sum-tl-bubble ' + cls + '" data-idx="' + i + '" data-dot-pct="' + dotPct + '" data-bubble-pct="' + bubblePct + '" data-above="' + (isAbove ? '1' : '0') + '" style="left:' + bubblePct + '%;" onclick="window.sumTlBringToFront(' + i + ', \'wr-level0-timeline\')">'
                 + escapeHtml(it.name) + '<br><span class="sum-tl-date">' + wrFormatMD(it.start) + '</span></div>';
        }).join('');

        let todayPart = '';
        const nowTs = new Date().getTime();
        if (nowTs >= tl.minTs && nowTs <= tl.maxTs) {
            const todayPct = ((nowTs - tl.minTs) / span) * 100;
            todayPart = '<div class="sum-tl-today-dot" style="left:' + todayPct + '%;"></div>';
        }

        const selWeek = wrGetWeekRange(window.wrBaseDate);
        let selMarker = '';
        if (selWeek.start >= tl.minTs && selWeek.start <= tl.maxTs) {
            const selPct = ((selWeek.start - tl.minTs) / span) * 100;
            selMarker = '<div style="position:absolute; top:0; left:' + selPct + '%; width:10px; height:10px; background:#e63946; border:2px solid #fff; border-radius:50%; transform:translate(-50%,-50%); z-index:3; box-shadow:0 1px 3px rgba(0,0,0,0.3);" title="현재 선택된 주 (' + wrFormatMD(selWeek.start) + '~' + wrFormatMD(selWeek.end) + ')"></div>';
        }

        return '<div id="wr-level0-timeline">'
             +   '<div class="sum-tl-wrap" style="position:relative;">'
             +     '<svg class="sum-tl-svg" style="position:absolute; left:56px; top:0; width:calc(100% - 112px); height:100%; overflow:visible; pointer-events:none; z-index:3;"></svg>'
             +     '<div class="sum-tl-inner"><div class="sum-tl-line-track"></div>' + parts + todayPart + selMarker + '</div>'
             +   '</div>'
             + '</div>';
    }

    // ── 신규 컬럼 입력 UI 포함 리스트 렌더 ───────────────
    function wrRenderEditableList(list) {
        if (list.length === 0) return '<div style="color:#999;">' + (window._currentLang === 'en' ? 'No items.' : '해당 항목 없음') + '</div>';
        return list.map((t) => {
            const rawContent = colIdx.content !== -1 ? (t.row[colIdx.content] || "").toString() : "";
            const assignee = wrExtractAssignee(rawContent);
            const contentStr = wrStripIssueLines(rawContent);
            const _wrMailBtn = t.row._mailRaw ? `<button onclick="window.showGanttMailRaw(${t.idx}); event.stopPropagation();" style="font-size:11px; padding:3px 10px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; margin-top:6px;">📧 ${window._currentLang === 'en' ? 'View Mail Source' : '원문 보기'}</button>` : '';
            return `
                <div class="wr-print-item" style="border:1px solid #eee; border-radius:6px; padding:10px 12px; margin-bottom:8px;">
                    <div style="font-weight:bold; font-size:16px; margin-bottom:4px;">${escapeHtml(t.text)}${assignee ? ` <span style="color:#6f42c1; font-weight:normal; font-size:11px;">[${escapeHtml(assignee)}]</span>` : ''}</div>
                    <div style="font-size:12px; color:#444; white-space:pre-line; line-height:1.3;">${escapeHtml(contentStr).replace(/\r/g, '').replace(/(\n[ \t]*){2,}/g, '\n')}</div>
                    ${_wrMailBtn}
                </div>`;
        }).join('');
    }

    // 문제점/대책 표: 상세내용에 [문제점]이 있는 행만 모음
    function wrRenderIssueTable(allList) {
        const rows = [];
        const seenTaskIdx = new Set();
        allList.forEach(t => {
            if (seenTaskIdx.has(t.idx)) return;   // 같은 행(태스크)이 두 번 집계되는 경우만 제외
            seenTaskIdx.add(t.idx);
            const contentStr = colIdx.content !== -1 ? (t.row[colIdx.content] || "").toString() : "";
            const { issue, fix } = wrExtractIssue(contentStr);
            if (!issue) return;
            const assignee = wrExtractAssignee(contentStr);
            rows.push({ task: t.text, issue, fix, assignee, dateLabel: `${wrFormatMD(t.row._calcStartTs)}~${wrFormatMD(t.row._calcPlanTs)}` });
        });
        const _wiEn = window._currentLang === 'en';
        if (rows.length === 0) return '<div style="color:#999;">' + (_wiEn ? 'No issues this week.' : '이번 주 문제점/이슈 없음') + '</div>';
        const body = rows.map(r => `
            <tr>
                <td style="padding:8px; border:1px solid #e0e0e0;"><div style="font-weight:bold; font-size:11px; color:#555; margin-bottom:3px;">${escapeHtml(r.task)}</div>${escapeHtml(r.issue)}</td>
                <td style="padding:8px; border:1px solid #e0e0e0;">${escapeHtml(r.fix || '-')}</td>
                <td style="padding:8px; border:1px solid #e0e0e0; white-space:nowrap;">${r.dateLabel}</td>
                <td style="padding:8px; border:1px solid #e0e0e0; white-space:nowrap;">${escapeHtml(r.assignee || '-')}</td>
            </tr>`).join('');
        return `
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead><tr style="background:#f4f6f8;">
                    <th style="padding:8px; border:1px solid #e0e0e0;">${_wiEn ? 'Issues' : '문제점 및 Issue'}</th>
                    <th style="padding:8px; border:1px solid #e0e0e0;">${_wiEn ? 'Action' : '대책'}</th>
                    <th style="padding:8px; border:1px solid #e0e0e0;">${_wiEn ? 'Schedule' : '추진일정'}</th>
                    <th style="padding:8px; border:1px solid #e0e0e0;">${_wiEn ? 'Owner' : '담당자'}</th>
                </tr></thead>
                <tbody>${body}</tbody>
            </table>`;
    }

    window.wrShiftWeek = function(direction) {
        if (direction === 0) {
            window.wrBaseDate = new Date();
        } else {
            const d = new Date(window.wrBaseDate);
            d.setDate(d.getDate() + direction * 7);
            window.wrBaseDate = d;
        }
        window.showWeeklyReport();   // 팝업을 같은 기준으로 다시 그림
    };

    window.wrAutoActivateNearest = function() {
        const tl = window.wrGetLevel0Timeline();
        if (!tl || !tl.items.length) return;
        const sorted = tl.items.slice().sort(function(a, b) { return a.start - b.start; });
        const baseTs = window.wrBaseDate ? window.wrBaseDate.getTime() : new Date().getTime();
        let nearestIdx = 0, minDiff = Infinity;
        sorted.forEach(function(it, i) {
            const diff = Math.abs(it.start - baseTs);
            if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
        });
        window.sumTlBringToFront(nearestIdx, 'wr-level0-timeline');
    };

// ── 팝업 표시 ─────────────────────────────────────────
    window.showWeeklyReport = function() {
        window.wrSyncLevelFilterUI(); // 💡 [드롭다운화] 탭을 열 때마다 트리거 버튼 강조 상태를 현재 필터와 맞춤
        const data = window.wrClassifyTasks();
        const _wrEn = window._currentLang === 'en';

        const container = document.getElementById('weekly-report-page');
        if (!container) return;

        const SKY_C = '#2c5f8a', SKY_TINT = '#eef6f7', BORDER_C = '#cfe3e5';

        // 💡 주간업무 보고 타이틀과 프로젝트 정보 패널을 완전히 삭제했습니다.
        const wrWeekLabel = document.getElementById('wr-week-label');
        if (wrWeekLabel) wrWeekLabel.textContent = `${wrFormatMD(data.thisWeek.start)} ~ ${wrFormatMD(data.thisWeek.end)} (${data.thisWeekNo}W)`;

        // 💡 [인쇄 페이지 나눔] 각 섹션에 wr-print-block 클래스를 붙여서, 인쇄 시 이 블록 중간이 아니라
        //    블록과 블록 사이의 "적당한 위치"에서만 페이지가 나뉘도록 함 (아래 print CSS와 짝)
        container.innerHTML = `
            <div>
                <div class="wr-print-block" style="margin-bottom:14px; border:1px solid ${BORDER_C}; border-radius:4px; overflow:hidden;">
                    <div style="background:${SKY_TINT}; padding:8px; text-align:center; font-weight:bold; font-size:16px; color:#2c5f8a;">${_wrEn ? 'Development Progress' : '개발 진척 현황'}</div>
                    <div style="padding:12px; background:#fff;">${wrRenderTimeline()}</div>
                </div>

                <div style="display:flex; gap:10px; margin-bottom:14px; align-items:stretch;">
                    <div class="wr-print-block" style="flex:1; display:flex; flex-direction:column; background:#fff; border:1px solid ${BORDER_C}; border-radius:4px; overflow:hidden;">
                        <div style="background:${SKY_TINT}; padding:8px; text-align:center; font-weight:bold; font-size:16px; color:#2c5f8a;">${_wrEn ? `Key Achievements (${data.thisWeekNo}W)` : `주요 실적 (${data.thisWeekNo}W)`}</div>
                        <div style="padding:12px; background:#fff; flex:1;">${wrRenderEditableList(data.thisList)}</div>
                    </div>
                    <div class="wr-print-block" style="flex:1; display:flex; flex-direction:column; background:#fff; border:1px solid ${BORDER_C}; border-radius:4px; overflow:hidden;">
                        <div style="background:${SKY_TINT}; padding:8px; text-align:center; font-weight:bold; font-size:16px; color:#2c5f8a;">${_wrEn ? `Upcoming Plans (${data.nextWeekNo}W)` : `추진 계획 (${data.nextWeekNo}W)`}</div>
                        <div style="padding:12px; background:#fff; flex:1;">${wrRenderEditableList(data.nextList)}</div>
                    </div>
                </div>

                <div class="wr-print-block" style="border:1px solid ${BORDER_C}; border-radius:4px; overflow:hidden;">
                    <div style="background:${SKY_TINT}; padding:8px; text-align:center; font-weight:bold; font-size:16px; color:#2c5f8a;">${_wrEn ? 'Issues & Actions' : '문제점 및 Issue'}</div>
                    <div style="background:#fff;">${wrRenderIssueTable([...data.thisList, ...data.nextList])}</div>
                </div>
            </div>`;
        setTimeout(function() { window.wrAutoActivateNearest(); }, 0);
    };
  // 💡 [2026-08-30 되돌림] PPT 출력이 항상 "지금 화면 테마"를 자동으로 쓰도록 했었는데, 기본값(청록
  // 계열 #19c3d6)은 그대로 두고 싶다는 요청 — 대신 출력할 때마다 "기본 테마 색상 / 현재 테마 색상"
  // 중 고르게 한다. 다른 3지선다 모달(_showSaveChoiceModal 등)과 같은 톤으로 재사용 가능한 모달을 새로 만듦.
  window._showPptColorChoiceModal = function() {
      return new Promise(function(resolve) {
          const _en = window._currentLang === 'en';
          let modal = document.getElementById('ppt-color-choice-modal');
          if (!modal) {
              modal = document.createElement('div');
              modal.id = 'ppt-color-choice-modal';
              modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,0.35); align-items:center; justify-content:center;';
              document.body.appendChild(modal);
          }
          const curHex = window._cpLiveAppliedHex || '#19c3d6';
          modal.innerHTML = `
              <div onclick="event.stopPropagation()" style="background:#fff; border-radius:10px; width:min(420px, 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:22px 24px;">
                  <div style="font-size:15px; font-weight:bold; color:#333; margin-bottom:14px;">🎨 ${_en ? 'Which theme color should the PPT use?' : 'PPT에 어떤 테마 색상을 쓸까요?'}</div>
                  <div style="display:flex; flex-direction:column; gap:8px;">
                      <button id="pcc-default" onmouseover="this.style.background='#eef6f7';" onmouseout="this.style.background='#fff';" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#fff; border:1px solid #cfe3e5; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s; text-align:left;">
                          <span style="width:18px; height:18px; border-radius:50%; background:#19c3d6; flex-shrink:0; border:1px solid #ddd;"></span>
                          <span>${_en ? 'Default theme color' : '기본 테마 색상 출력'}</span>
                      </button>
                      <button id="pcc-current" onmouseover="this.style.background='#eef6f7';" onmouseout="this.style.background='#fff';" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#fff; border:1px solid #cfe3e5; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s; text-align:left;">
                          <span style="width:18px; height:18px; border-radius:50%; background:${curHex}; flex-shrink:0; border:1px solid #ddd;"></span>
                          <span>${_en ? 'Current theme color' : '현재 테마 색상 출력'}</span>
                      </button>
                  </div>
                  <div style="display:flex; justify-content:flex-end; margin-top:14px;">
                      <button id="pcc-cancel" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer; transition:background .15s;">${_en ? 'Cancel' : '취소'}</button>
                  </div>
              </div>`;
          modal.style.display = 'flex';
          function done(v) { modal.style.display = 'none'; resolve(v); }
          document.getElementById('pcc-default').onclick = function() { done('default'); };
          document.getElementById('pcc-current').onclick = function() { done('current'); };
          document.getElementById('pcc-cancel').onclick = function() { done('cancel'); };
          modal.onclick = function() { done('cancel'); };
      });
  };
  window.exportWeeklyReportPPT = async function() {
        if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로드에 실패했습니다. 새로고침 후 다시 시도해주세요.'); return; }

        const _pptColorChoice = await window._showPptColorChoiceModal();
        if (_pptColorChoice === 'cancel') return;
        const _pptChosenHex = _pptColorChoice === 'current' ? (window._cpLiveAppliedHex || '#19c3d6') : '#19c3d6';

        const data = window.wrClassifyTasks();
        const tl = window.wrGetLevel0Timeline();
        const allList = [...data.thisList, ...data.nextList];

        const issueRows = [];
        const seenTaskIdx = new Set();
        allList.forEach(t => {
            if (seenTaskIdx.has(t.idx)) return;
            seenTaskIdx.add(t.idx);
            const contentStr = colIdx.content !== -1 ? (t.row[colIdx.content] || "").toString() : "";
            const { issue, fix } = wrExtractIssue(contentStr);
            if (!issue) return;
            const assignee = wrExtractAssignee(contentStr);
            const issueWithTask = `[${t.text}]\n${issue}`;
            issueRows.push([issueWithTask, fix || '-', `${_pptFormatMD(t.row._calcStartTs)}~${_pptFormatMD(t.row._calcPlanTs)}`, assignee || '-']);
        });

        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
        pptx.layout = 'WIDE';

        // ── 공통 상수 & 헬퍼 (슬라이드 1·2 공유) ──────────────────────────────
        const C = wrDeriveColors(_pptChosenHex.replace('#', ''));
        const SKY = C.base, SKY_DARK = C.dark;
        const BORDER = 'A6A6A6';
        const BORDER_W = 0.75;
        const HEAD_FS = 14;
        const GAP = 0.1;
        const sectW  = (12.5 - GAP) / 2;
        const col2X  = 0.4 + sectW + GAP;

        const metaCustomer = window.getSummaryCustomer();
        const metaModel    = window.getSummaryModel();
        const metaInch     = window.getSummaryInch();
        const projTitle    = [metaCustomer, metaModel, metaInch].filter(Boolean).join(' > ') || '주간 업무 보고';
        const pm           = window.projectMeta || {};
        const metaHw       = pm.프로젝트담당자 || '-';
        const metaMech     = pm.기구담당자 || '-';
        const metaFw       = pm.FW담당자 || '-';
        const pCode        = pm.프로젝트코드 || '-';
        const pName        = pm.프로젝트명 || projTitle;
        // 💡 [2026-08-27 버그 수정] KTK PN_모델명은 화면에선 하나로 합쳐 입력받지만 내부적으로
        //    KTKPN(맨 앞 6자리)과 KTK모델명(그 뒤 전부)으로 나눠 저장된다(첫 "_"까지만 KTKPN) — 콤마로
        //    여러 PN을 나열한 값(예: "502574_A,502573_B")은 KTK모델명에 "A,502573_B"까지 통째로 들어가고
        //    맨 앞 "502574_"는 KTKPN에만 남는다. 여기서 KTK모델명만 읽으면 그 앞자리가 PPT에서 빠져
        //    보였던 것 — sum-ktk-pn-model에 채우는 것과 동일하게 KTKPN+'_'+KTK모델명으로 되돌려 합친다.
        const ktkModelName = [pm.KTKPN, pm.KTK모델명].filter(Boolean).join('_') || '-';

        // getMsDate: "2026-05-29" → "26.05.29" (슬라이드 1·2 공통 사용)
        // ── 💡 이미지 간격/여백 — 여기서 자유롭게 조절 ─────────────────
        const IMG_GAP  = 0.05;   // 이미지↔이미지 사이 간격 (인치, 0.05 ≈ 5px)
        const IMG_MARG = 0.08;   // 이미지↔박스 내부 여백 (인치)

        const getMsDate = (stage) => {
            const el = document.querySelector(`#sum-milestone-body input[data-stage="${stage}"]`);
            return el && el.value ? el.value.substring(2).replace(/-/g, '.') : '-';
        };
        const getMsDateRaw = (stage) => {
            const el = document.querySelector(`#sum-milestone-body input[data-stage="${stage}"]`);
            return el ? el.value : '';
        };

        // 슬라이드 공통 헤더 (타이틀 + 담당자 표 + 구분선 + 모델 정보 행)
        const addSlideHeader = (sl) => {
            sl.addText(projTitle, { x: 0.4, y: 0.2, w: 7.5, h: 0.55, fontSize: 25, bold: true, color: SKY, fontFace: 'Malgun Gothic' });
            sl.addTable(
                [[{ text: 'H/W(통합 PL)', options: { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS-2, align: 'center' } },
                  { text: '기구',         options: { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS-2, align: 'center' } },
                  { text: 'F/W',          options: { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS-2, align: 'center' } }],
                 [{ text: metaHw }, { text: metaMech }, { text: metaFw }]],
                { x: 9.0, y: 0.15, w: 3.9, h: 0.6, fontSize: 10, align: 'center', valign: 'middle',
                  border: { type: 'solid', color: BORDER, pt: BORDER_W }, colW: [1.3, 1.3, 1.3] }
            );
            sl.addShape(pptx.ShapeType.rect, { x: 0.4, y: 0.85, w: 12.5, h: 0.04, fill: { color: SKY } });
            sl.addTable(
                [[{ text: pCode,        options: { fontSize: 14, color: '000000', bold: true, fill: { color: '#FFFAF0' }, align: 'center' } },
                  { text: pName,        options: { fontSize: 14, color: '000000', bold: true, align: 'left' } },
                  { text: ktkModelName, options: { fontSize: 14, color: '000000', bold: true, align: 'left' } }]],
                // 💡 프로젝트 코드 25% / 프로젝트 명칭 25% / KTK PN_모델명 50% (전체 폭 12.5" 기준)
                { x: 0.4, y: 1.0, w: 12.5, h: 0.4, border: { type: 'solid', color: BORDER, pt: BORDER_W }, colW: [3.125, 3.125, 6.25], valign: 'middle' }
            );
        };

        // ════════════════════════════════════════════════════════════════════
        // 슬라이드 1 : 프로젝트 개요
        // ════════════════════════════════════════════════════════════════════
        {
            const s1 = pptx.addSlide();
            s1.background = { color: 'FFFFFF' };
            addSlideHeader(s1);

            const LX = 0.4,  LW = 7.5;   // 좌측 컬럼 (gap 0.1"로 축소)
            const RX = 8.0,  RW = 4.93;  // 우측 컬럼 (슬라이드 우측까지 채움)
            const CY    = 1.50;           // 컨텐츠 시작 Y (프로젝트 정보 행 바로 아래)
            const BOX_H = 7.3 - CY;      // 박스 높이 (하단 여백 0.2")
            const PAD   = 0.13;           // 박스 내부 패딩

            // ── 좌/우 컬럼 테두리 박스 ──────────────────────────────────
            s1.addShape(pptx.ShapeType.rect, { x: LX, y: CY, w: LW, h: BOX_H, fill: { color: 'FFFFFF' }, line: { color: BORDER, width: BORDER_W } });
            s1.addShape(pptx.ShapeType.rect, { x: RX, y: CY, w: RW, h: BOX_H, fill: { color: 'FFFFFF' }, line: { color: BORDER, width: BORDER_W } });

            // ── 과제개요 텍스트 ───────────────────────────────────────────
            const gradeChar = (pCode || '').replace(/\s/g, '').slice(-1).toUpperCase();
            const gradeStr  = ({ A:'A등급', B:'B등급', C:'C등급', D:'D등급', E:'E등급' }[gradeChar]) || gradeChar || '-';

            const startFmt = getMsDate('기획Start'), praFmt = getMsDate('PRA');
            const startRaw = getMsDateRaw('기획Start'), praRaw = getMsDateRaw('PRA');
            let devMonths = '-';
            if (startRaw && praRaw) {
                const a = new Date(startRaw), b = new Date(praRaw);
                if (!isNaN(a) && !isNaN(b)) { const m = (b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth(); if (m>0) devMonths=m; }
            }
            const memberKeys = ['기구담당자','HW담당자','FW담당자','Module담당자','TSP담당자','LCM담당자','Slimming담당자','Cutting담당자','Tooling담당자'];
            const extraCount = memberKeys.filter(k => pm[k] && String(pm[k]).trim()).length;
            const devDtStr   = (startFmt !== '-' && praFmt !== '-') ? `${startFmt} ~ ${praFmt} (개발기간 ${devMonths}개월)` : '-';

            s1.addText([
                { text: '✓ 과제개요', options: { bold: true } }, { text: ` : ${pm.프로젝트명 || projTitle}\n` },
                { text: '✓ 과제구분', options: { bold: true } }, { text: ` : ${gradeStr}\n` },
                { text: '✓ 개발일정', options: { bold: true } }, { text: ` : ${devDtStr}\n` },
                { text: '✓ 투입자원', options: { bold: true } }, { text: ` : ${metaHw} 외 ${extraCount}명  (개발비용 : T.B.D)` },
            ], { x: LX+PAD, y: CY+PAD, w: LW-PAD*2, h: 1.0, fontSize: 9.5, color: '333333', fontFace: 'Malgun Gothic', valign: 'top', lineSpacingMultiple: 1.35 });

            // ── 제품 사진 ─────────────────────────────────────────────────
            const imgs  = ((window.tabData || {}).productImages || []).filter(Boolean);
            const imgY  = CY + 1.15, imgH = BOX_H - 1.15 - PAD;
            const MGAP  = 0.08;   // 이미지↔이미지, 이미지↔박스 여백

            const IMGAP = IMG_GAP;    // 상단 공통 상수 참조
            const IMARG = IMG_MARG;   // 상단 공통 상수 참조

            // 이미지 영역 테두리 박스
            const iBoxX = LX + PAD, iBoxW = LW - PAD*2;
            s1.addShape(pptx.ShapeType.rect, { x: iBoxX, y: imgY, w: iBoxW, h: imgH, fill: { color: 'F8F8F8' }, line: { color: 'CCCCCC', width: 0.75 } });

            // 비율 유지 + 슬롯 중앙 배치 헬퍼
            const fitSlot = (imgEntry, sx, sy, sw, sh) => {
                const src = (typeof imgEntry === 'string') ? imgEntry : imgEntry.data;
                const iw  = imgEntry && imgEntry.w ? imgEntry.w : null;
                const ih  = imgEntry && imgEntry.h ? imgEntry.h : null;
                const ax = sx + IMARG, ay = sy + IMARG, aw = sw - IMARG*2, ah = sh - IMARG*2;
                if (iw && ih) {
                    const ratio  = iw / ih;
                    const aRatio = aw / ah;
                    let dw, dh;
                    if (ratio > aRatio) { dw = aw; dh = aw / ratio; }
                    else               { dh = ah; dw = ah * ratio; }
                    s1.addImage({ data: src, x: ax + (aw-dw)/2, y: ay + (ah-dh)/2, w: dw, h: dh });
                } else {
                    s1.addImage({ data: src, x: ax, y: ay, w: aw, h: ah, sizing: { type: 'contain', w: aw, h: ah } });
                }
            };

            if (imgs.length === 0) {
                s1.addText('제품 사진\n(Summary 탭에서 등록)', { x: iBoxX, y: imgY + imgH/2 - 0.3, w: iBoxW, h: 0.6, fontSize: 10, color: 'AAAAAA', align: 'center' });
            } else if (imgs.length === 1) {
                fitSlot(imgs[0], iBoxX, imgY, iBoxW, imgH);
            } else {
                // 2장: 왼쪽 33% / 오른쪽 67%
                const sw1 = (iBoxW - IMGAP) * 0.33;
                const sw2 = iBoxW - sw1 - IMGAP;
                fitSlot(imgs[0], iBoxX,          imgY, sw1, imgH);
                fitSlot(imgs[1], iBoxX+sw1+IMGAP, imgY, sw2, imgH);
            }

            // ── 우측: 개발 Concept ────────────────────────────────────────
            const bsRows   = ((window.tabData || {}).briefSpec || []);
            const getBsVal = (kw) => { const r = bsRows.find(r => r.type && r.type.toLowerCase().replace(/\s/g,'').includes(kw.toLowerCase().replace(/\s/g,''))); return r ? (r.modelA||r.modelB||r.modelC||'') : ''; };
            const rOpt = { fontFace: 'Malgun Gothic', valign: 'top' };
            let rY = CY + PAD;   // 박스 상단 패딩

            s1.addText('❖  개발  Concept', { x: RX+PAD, y: rY, w: RW-PAD*2, h: 0.28, fontSize: 11, bold: true, color: '333333', ...rOpt });
            rY += 0.28;
            s1.addText(
                `- ${metaCustomer||'고객명'} _ ${pm.고객모델명||pm.모델명||'고객 모델명'}\n` +
                `- ${metaInch||'XX'}" _ ${getBsVal('resolution')||getBsVal('nativeresolution')||'해상도'}\n` +
                `- Brightness : ${getBsVal('luminance')||getBsVal('brightness')||''}`,
                { x: RX+PAD+0.08, y: rY, w: RW-PAD*2-0.08, h: 0.64, fontSize: 9.5, color: '555555', ...rOpt, lineSpacingMultiple: 1.3 }
            );
            rY += 0.80;

            // ── 우측: 제품 SPEC ───────────────────────────────────────────
            s1.addText('❖  제품  SPEC', { x: RX+PAD, y: rY, w: RW-PAD*2, h: 0.28, fontSize: 11, bold: true, color: '333333', ...rOpt });
            rY += 0.28;
            const SPEC_TYPES = [
                'Video input', 'Panel', 'Native Resolution', 'Viewing Angle (typ.)',
                'White Luminance', 'Color Temperature(K)', 'Contrast Ratio',
                'Color Gamut', 'Thickness of Glass', 'Casing'
            ];
            const specLines = SPEC_TYPES.map(key => {
                const row = bsRows.find(r => r.type && r.type.trim().toLowerCase() === key.toLowerCase());
                const val = row ? (row.modelA || row.modelB || row.modelC || '') : '';
                return `- ${key}${val ? ' : ' + val : ''}`;
            });
            const specTxt = specLines.join('\n');
            const specH   = SPEC_TYPES.length * 0.195 + 0.1;   // 10항목 × 0.195" = 1.95"
            s1.addText(specTxt, { x: RX+PAD+0.08, y: rY, w: RW-PAD*2-0.08, h: specH, fontSize: 9.5, color: '555555', ...rOpt, lineSpacingMultiple: 1.28 });
            rY += specH + 0.2;   // 간격 0.21"로 확보

            // ── 우측: 제품 특징 ───────────────────────────────────────────
            s1.addText('❖  제품  특징', { x: RX+PAD, y: rY, w: RW-PAD*2, h: 0.28, fontSize: 11, bold: true, color: '333333', ...rOpt });
            rY += 0.28;
            const bgTxt = ((window.tabData||{}).summary||{}).background || '';
            const bgH   = Math.min(1.2, Math.max(0.5, (bgTxt.split('\n').length + 1) * 0.20));
            s1.addText(bgTxt || '(내용 없음)', { x: RX+PAD+0.08, y: rY, w: RW-PAD*2-0.08, h: bgH, fontSize: 9.5, color: '555555', ...rOpt, lineSpacingMultiple: 1.28 });
            rY += bgH + 0.1;

            // ── 우측: Key Point ───────────────────────────────────────────
            const kpY = Math.min(Math.max(rY, CY + BOX_H - 0.6), 7.3 - 0.6) - 0.32;
            s1.addText('※  Key Point :', { x: RX+PAD, y: kpY, w: RW-PAD*2, h: 0.28, fontSize: 11, bold: true, color: '333333', ...rOpt });
            s1.addText('- 해당없음', { x: RX+PAD+0.08, y: kpY+0.3, w: RW-PAD*2-0.08, h: 0.25, fontSize: 9.5, color: '555555', ...rOpt });
        }
        // ════════════════════════════════════════════════════════════════════
        // 슬라이드 2 : 주간 업무 보고 (기존 코드)
        // ════════════════════════════════════════════════════════════════════
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };
        addSlideHeader(slide);
        // ── 💡 좌: 개발목표 일정 및 MC (Summary/MC 탭 연동) ──────
        // getMsDate / getMsDateRaw는 상단 공통 상수 블록에서 이미 정의됨
        const startDt = getMsDate('기획Start');

        // ── 실적 일정 (Summary 실적 행) ─────────────────────────────────
        const getMsActual = (stage) => {
            const el = document.querySelector(`#sum-milestone-body-actual input[data-stage="${stage}"]`);
            return el && el.value ? el.value.substring(2).replace(/-/g, '.') : '-';
        };
        const getMsActualRaw = (stage) => {
            const el = document.querySelector(`#sum-milestone-body-actual input[data-stage="${stage}"]`);
            return el ? el.value : '';
        };
        const actStartDt   = getMsActual('기획Start');
        const actProtoDrDt = getMsActual('ProtoDR');
        const actDvrDt     = getMsActual('DVR');
        const actPvrDt     = getMsActual('PRA');

        // ── R1~R5 최초 등록일 (mcChangeLog에서 파생) ────────────────────
        const parseKoDateMs = (str) => {
            const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
            return m ? new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])).getTime() : null;
        };
        const revFirstTs = {};
        ((window.tabData || {}).mcChangeLog || []).forEach(l => {
            if (!l.rev || !l.time) return;
            const ts = parseKoDateMs(l.time);
            if (ts === null) return;
            if (!revFirstTs[l.rev] || ts < revFirstTs[l.rev]) revFirstTs[l.rev] = ts;
        });
        // 💡 R1~무제한 대응: 실제 등장한 리비전(수정이력 + 현재 데이터)을 모두 모아 번호순 정렬
        const _mcAllRevs = Array.from(new Set(
            Object.keys((window.tabData || {}).mcRevisions || {}).concat(Object.keys(revFirstTs)).concat(['R1'])
        )).filter(r => /^R\d+$/.test(r)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
        const _mcAllRevsDesc = _mcAllRevs.slice().reverse();

        // 마일스톤 날짜 이전에 등록된 R 중 가장 늦은(최신) R
        // → 해당 시점까지 존재한 견적 중 최신본 참조
        const closestRev = (rawDate) => {
            if (!rawDate) return null;
            const tgt = new Date(rawDate).getTime();
            if (isNaN(tgt)) return null;
            // 1순위: 마일스톤 날짜 이전 R 중 등록일이 가장 늦은 것
            let best = null, bestTs = -Infinity;
            _mcAllRevs.forEach(r => {
                const ts = revFirstTs[r];
                if (!ts) return;
                // 같은 날짜면 번호 큰 R 우선 (숫자 비교라 R10 > R9도 정확히 처리됨)
                const sameDay = bestTs !== -Infinity && Math.abs(ts - bestTs) < 86400000;
                const rNum = parseInt(r.slice(1), 10), bestNum = best ? parseInt(best.slice(1), 10) : -Infinity;
                if (ts <= tgt && (ts > bestTs || (sameDay && rNum > bestNum))) {
                    bestTs = ts; best = r;
                }
            });
            // 2순위: 이전 R이 없으면(모두 미래) 가장 번호 큰(최신) R 폴백
            if (!best) {
                _mcAllRevsDesc.forEach(r => {
                    if (!best && revFirstTs[r]) best = r;
                });
            }
            // 3순위: 수정이력이 아예 없는 프로젝트(엑셀/드라이브로 데이터를 통째로 불러온 경우 등)는
            //         시점 판단이 불가능하므로, 실제 데이터가 있는 가장 최신 리비전으로 대체 표시
            if (!best) {
                _mcAllRevsDesc.forEach(r => {
                    if (!best) {
                        const rows = ((window.tabData || {}).mcRevisions || {})[r] || [];
                        if (rows.length) best = r;
                    }
                });
            }
            return best;
        };

        // R별 MP MC Total
        const getMpTotal = (rev) => {
            if (!rev) return '-';
            const rows = ((window.tabData || {}).mcRevisions || {})[rev] || [];
            let total = 0;
            rows.forEach(r => {
                const t = String(r.type || '').toUpperCase().replace(/\s/g,'');
                if (!r.type || t === 'SUBTOTAL' || t === 'TOTAL') return;
                const val = parseFloat(String(r.mpCost || '').replace(/[^0-9.-]+/g,''));
                if (!isNaN(val)) total += val;
            });
            return total > 0 ? '$' + total.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
        };

        const actR = {
            start : closestRev(getMsActualRaw('기획Start')),
            proto : closestRev(getMsActualRaw('ProtoDR')),
            dvr   : closestRev(getMsActualRaw('DVR')),
            pvr   : closestRev(getMsActualRaw('PRA')),
        };
        const actMc = {
            start : actR.start ? `${getMpTotal(actR.start)}\n(${actR.start})` : '-',
            proto : actR.proto ? `${getMpTotal(actR.proto)}\n(${actR.proto})` : '-',
            dvr   : actR.dvr   ? `${getMpTotal(actR.dvr)}\n(${actR.dvr})`   : '-',
            pvr   : actR.pvr   ? `${getMpTotal(actR.pvr)}\n(${actR.pvr})`   : '-',
        };
        const protoDrDt = getMsDate('ProtoDR');
        const dvrDt = getMsDate('DVR');
        const pvrDt = getMsDate('PRA');

        // M.C Table에서 MP Cost 총합 자동 계산
        let totalMpCost = 0;
        if (window.tabData && window.tabData.mcTable) {
            window.tabData.mcTable.forEach(r => {
                const t = String(r.type || '').toUpperCase().replace(/\s/g, '');
                if (!r.type || t === 'SUBTOTAL' || t === 'TOTAL') return;
                const val = parseFloat(String(r.mpCost).replace(/[^0-9.-]+/g, ''));
                if (!isNaN(val)) totalMpCost += val;
            });
        }
        const targetMc = totalMpCost > 0 ? '$' + totalMpCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

        const boardY = 1.0 + 0.4 + GAP, boardH = 1.4 + 0.32;
        const goalX = 0.4, goalW = 4.0;
        const tlX = goalX + goalW + GAP, tlW = 12.5 - goalW - GAP;

        const labelColW = 0.45, smallColW = 0.45;
        const dataColW = (goalW - labelColW - smallColW) / 4;
        const goalColW = [labelColW, smallColW, dataColW, dataColW, dataColW, dataColW];

        const titleOpt = { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS, align: 'center', valign: 'middle' };
        const ghOpt = { bold: true, color: '000000', fontSize: 8, align: 'center', valign: 'middle' };
        const glOpt = { bold: true, color: '000000', fontSize: 6.5, align: 'center', valign: 'middle' };

        const titleRowH = 0.32, headRowH = 0.28;
        const dataRowH = (boardH - titleRowH - headRowH) / 4; 
        const goalRowH = [titleRowH, headRowH, dataRowH, dataRowH, dataRowH, dataRowH];
        const goalBoardH = goalRowH.reduce((a, b) => a + b, 0);

        slide.addTable(
            [
                [{ text: '개발 목표', options: { ...titleOpt, colspan: 6 } }],
                [
                    { text: '', options: ghOpt },
                    { text: '구분', options: ghOpt },
                    { text: 'Start', options: ghOpt },
                    { text: 'Proto DR', options: ghOpt },
                    { text: 'DVR', options: ghOpt },
                    { text: 'PRA(PVR)', options: ghOpt },
                ],
                [
                    { text: '목표', options: { ...ghOpt, rowspan: 2 } },
                    { text: '일정', options: glOpt },
                    { text: startDt, options: glOpt }, 
                    { text: protoDrDt, options: glOpt }, 
                    { text: dvrDt, options: glOpt }, 
                    { text: pvrDt, options: glOpt },
                ],
                [
                    { text: '품질', options: glOpt },
                    { text: '공정 : Total 1차년0.2% 2차년0.1% , 시장 : 200 PPM', options: { ...glOpt, colspan: 4, align: 'left' } },
                ],
                [
                    { text: '실적', options: { ...ghOpt, rowspan: 2 } },
                    { text: '일정', options: glOpt },
                    { text: actStartDt,   options: glOpt },
                    { text: actProtoDrDt, options: glOpt },
                    { text: actDvrDt,     options: glOpt },
                    { text: actPvrDt,     options: glOpt },
                ],
                [
                    { text: 'MC', options: glOpt },
                    { text: actMc.start, options: { ...glOpt, fontSize: 5.5 } },
                    { text: actMc.proto, options: { ...glOpt, fontSize: 5.5 } },
                    { text: actMc.dvr,   options: { ...glOpt, fontSize: 5.5 } },
                    { text: actMc.pvr,   options: { ...glOpt, fontSize: 5.5 } },
                ],
            ],
            { x: goalX, y: boardY, w: goalW, h: boardH, rowH: goalRowH, fontSize: 8, align: 'center', valign: 'middle', border: { type: 'solid', color: BORDER, pt: BORDER_W }, colW: goalColW }
        );

       // ── 우: 개발 진척 현황 (역삼각형 줄 분리 + 크기 비례 간격) ──
        slide.addTable(
        [[{ text: '개발 진척 현황', options: titleOpt }]],
        { x: tlX, y: boardY, w: tlW, h: 0.32, colW: [tlW], border: { type: 'solid', color: BORDER, pt: BORDER_W } }
        );
            const goalTableY = boardY + 0.32;
            const goalTableH = goalBoardH - 0.32;
            slide.addShape(pptx.ShapeType.rect, { x: tlX, y: goalTableY, w: tlW, h: goalTableH, fill: { color: 'FFFFFF' }, line: { color: BORDER, width: BORDER_W } });

        // (이 아래부터 if (tl.items.length > 0) { ... } 등 기존 코드는 계속 그대로 유지됩니다)

        if (tl.items.length > 0) {
            const span = Math.max(1, tl.maxTs - tl.minTs);
            const padX = 0.5;
            const lineX = tlX + padX, lineW = tlW - padX * 2;
            const innerTop = goalTableY + 0.08, innerBottom = goalTableY + goalTableH - 0.08;

            const milestones = tl.items.filter(it => wrIsMilestone(it.name));
            const majorItems = milestones.filter(it => /RFQ|PROTO DR|DVR|MP/i.test(it.name)).sort((a, b) => a.start - b.start);
            const minorItems = milestones.filter(it => !/RFQ|PROTO DR|DVR|MP/i.test(it.name));

            const majorPctMap = new Map();
            majorItems.forEach((it) => {
                majorPctMap.set(it, (it.start - tl.minTs) / span);
            });

            // 역삼각형(major) 전용 줄을 위쪽에 분리, 트랙+다이아몬드(minor)는 그 아래 줄
            const triH = 0.195, triW = 0.21;
            const majorLabelH = 0.34;
            const triLabelGap = triH * 0.25;   // 라벨-삼각형 간격을 삼각형 크기에 비례해서 계산          
            const diaR = 0.05, diaLabelGap = diaR * 0.6, minorLabelH = 0.34;   // ← minor 상수 위로 올림

            // 콘텐츠 블록 높이 = (트랙 위: major 라벨+삼각형) + (트랙 아래: minor 라벨)
            const aboveH = majorLabelH + triLabelGap + triH;
            const belowH = 0.08 + diaR + diaLabelGap + minorLabelH;
            const blockH = aboveH + belowH;
            // 박스 안 수직 중앙 정렬 (박스 높이 바뀌어도 자동으로 가운데)
            const trackRowY = goalTableY + Math.max(0.08, (goalTableH - blockH) / 2) + aboveH;

            slide.addShape(pptx.ShapeType.roundRect, { x: lineX, y: trackRowY, w: lineW, h: 0.16, rectRadius: 0.03, fill: { color: 'EFEFEF' }, line: { color: 'D9D9D9', width: 0.75 } });
            const todayTs = Date.now();
            const todayPct = Math.max(0, Math.min(1, (todayTs - tl.minTs) / span));
            slide.addShape(pptx.ShapeType.roundRect, { x: lineX, y: trackRowY + 0.04, w: Math.max(0.05, lineW * todayPct), h: 0.08, rectRadius: 0.04, fill: { color: SKY_DARK } });

            // major: 삼각형은 실제 날짜 위치에 고정, 라벨끼리 겹치면 최소 간격만큼 밀어냄
            const majorLabelW = 1.05; // majorLabelH는 위에서 이미 선언됨 (9831번째 줄) — 재사용
            const majorSorted = majorItems.slice().sort((a, b) => a.start - b.start);
            const minLabelGap = majorLabelW * 1.0; // 💡 라벨 사이에 여백이 남도록 더 넓게
            const majorLabelXs = majorSorted.map((it) => lineX + lineW * majorPctMap.get(it) - majorLabelW / 2);
            for (let pass = 0; pass < 5; pass++) {
                for (let i = 1; i < majorLabelXs.length; i++) {
                    if (majorLabelXs[i] - majorLabelXs[i - 1] < minLabelGap) {
                        const mid = (majorLabelXs[i] + majorLabelXs[i - 1]) / 2;
                        majorLabelXs[i - 1] = mid - minLabelGap / 2;
                        majorLabelXs[i] = mid + minLabelGap / 2;
                    }
                }
            }
            majorSorted.forEach((it, idx) => {
                const pct = majorPctMap.get(it);
                const dotX = lineX + lineW * pct; // 💡 삼각형은 항상 실제 날짜 위치
                slide.addShape(pptx.ShapeType.triangle, {
                    x: dotX - triW / 2, y: trackRowY - triH, w: triW, h: triH,
                    fill: { color: '2B2B2B' }, line: { color: 'FFFFFF', width: 0.75 }, rotate: 180
                });
                const majorExtraLift = 0.06; // 💡 역삼각형 라벨을 위로 살짝 더 띄움
                const labelY = trackRowY - triH - triLabelGap - majorLabelH - majorExtraLift;
                let labelX = majorLabelXs[idx]; // 💡 라벨만 겹침 방지로 조정된 위치
                if (labelX < tlX + 0.08) labelX = tlX + 0.08;
                if (labelX + majorLabelW > tlX + tlW - 0.08) labelX = tlX + tlW - 0.08 - majorLabelW;
                const labelCenterX = labelX + majorLabelW / 2;
                { // 💡 위치가 같아도 항상 2단 꺾은선을 그림
                    const connY = labelY + majorLabelH;      // 라벨 하단 높이
                    const triTopY = trackRowY - triH;        // 삼각형 꼭대기 높이
                    const midY = connY + (triTopY - connY) / 2; // 💡 중간 높이에서 한 번 더 꺾음
                    const lineOpt = { color: SKY_DARK, width: 0.75, dashType: 'dash' }; // 💡 라벨 글자색과 동일
                    // 1단: 마커(dotX)에서 수직으로 중간 높이까지
                    slide.addShape(pptx.ShapeType.line, {
                        x: dotX, y: midY, w: 0.001, h: Math.max(0.001, triTopY - midY), line: lineOpt
                    });
                    // 2단: 중간 높이에서 라벨 중심 x위치까지 수평 이동
                    slide.addShape(pptx.ShapeType.line, {
                        x: Math.min(dotX, labelCenterX), y: midY,
                        w: Math.max(0.001, Math.abs(labelCenterX - dotX)), h: 0.001, line: lineOpt
                    });
                    // 3단: 라벨 중심 x위치에서 수직으로 라벨까지 마무리
                    slide.addShape(pptx.ShapeType.line, {
                        x: labelCenterX, y: connY, w: 0.001, h: Math.max(0.001, midY - connY), line: lineOpt
                    });
                }
                slide.addText(`${it.name}\n${wrFormatMD(it.start)}`, {
                    x: labelX, y: labelY, w: majorLabelW, h: majorLabelH,
                    fontSize: 8.5, bold: true, align: 'center', valign: 'bottom', color: SKY_DARK
                });
            });

            // minor: 트랙 위 다이아몬드, 위/아래 번갈아, 간격은 다이아몬드 크기에 비례
            minorItems.forEach((it, mi) => {
                const pct = (it.start - tl.minTs) / span;
                const dotX = lineX + lineW * pct;
                slide.addShape(pptx.ShapeType.diamond, {
                    x: dotX - diaR, y: trackRowY + 0.08 - diaR, w: diaR * 2, h: diaR * 2,
                    fill: { color: SKY }, line: { color: 'FFFFFF', width: 1 }
                });
                const isUp = mi % 2 === 0;
                const labelW = 0.95, labelH = 0.34;
                let labelY = isUp ? (trackRowY + 0.08 - diaR - diaLabelGap - labelH) : (trackRowY + 0.08 + diaR + diaLabelGap);
                labelY = Math.max(innerTop, Math.min(innerBottom - labelH, labelY));
                let labelX = dotX - labelW / 2;
                if (labelX < tlX + 0.08) labelX = tlX + 0.08;
                if (labelX + labelW > tlX + tlW - 0.08) labelX = tlX + tlW - 0.08 - labelW;
                slide.addText(`${it.name}\n${wrFormatMD(it.start)}`, {
                    x: labelX, y: labelY, w: labelW, h: labelH,
                    fontSize: 8.5, bold: false, align: 'center', valign: isUp ? 'bottom' : 'top', color: SKY_DARK
                });
            });
        } else {
            slide.addText('진척 항목 없음', { x: tlX + 0.2, y: goalTableY + 0.5, w: tlW - 0.4, h: 0.3, fontSize: 10, color: '999999' });
        }
        
// ── 주요 실적 / 추진 계획 (제목+본문이 하나의 표) ──
        // 담당자(발신→수신)·요청/문의 줄은 헤더에 이미 표시되므로 본문에서 제외
        const isAssigneeLine = (line) => {
            const l = line.trim();
            if (!l) return false;
            if (/^\[\s*(요청\s*\/\s*문의|견적요청|문의|요청|발신\s*→\s*수신|발신자\s*→\s*수신자)/.test(l)) return true;
            if (/→/.test(l) && !/^\[\s*(핵심내용|To\s*do|문제점|대책|비고|특이사항|진행|결과|일정)/i.test(l)) return true;
            return false;
        };

        const listToText = (list) => {
            if (!list.length) return '해당 항목 없음';
            return list.map(t => {
                const rawContent = colIdx.content !== -1 ? (t.row[colIdx.content] || "").toString() : "";
                const assignee = wrExtractAssignee(rawContent);
                const contentStr = wrStripIssueLines(rawContent)
                    .split('\n').filter(line => !isAssigneeLine(line)).join('\n').trim();   // ← 추가: 담당자 줄 제외
                const textNoYear = t.text.replace(/\s*'\d{2}(?=[~)])/g, ''); // 💡 PPT에서만 년도 제거
                const header = `✓ ${textNoYear}${assignee ? `  [${assignee}]` : ''}`;
                return contentStr ? `${header}\n${contentStr}\n` : header;
            }).join('\n');
        };

        // 텍스트 줄 수를 추정해서 필요한 높이를 동적으로 계산 (고정 1.75 대신)
        const estimateLines = (text) => text.split('\n').length;
        const thisLines = estimateLines(listToText(data.thisList));
        const nextLines = estimateLines(listToText(data.nextList));
        const maxLines = Math.max(thisLines, nextLines, 4);   // 최소 4줄 보장
        const lineHeightIn = 0.165;   // 10pt 폰트 기준 줄당 높이(인치) 근사값
        const sectionY = goalTableY + goalTableH + GAP, sectionH = 0.3;
        const bodyH = Math.max(1.75, maxLines * lineHeightIn + 0.16);   // 여유 패딩 포함, 최소 1.75 유지
        const sectTitleOpt = { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS, align: 'center', valign: 'middle' };
        const sectBodyOpt = { fontSize: 10, valign: 'top', color: '000000', align: 'left', fontFace: 'Malgun Gothic' };

        slide.addTable(
            [
                [{ text: `주요 실적 (${data.thisWeekNo}W)`, options: sectTitleOpt }],
                [{ text: listToText(data.thisList), options: sectBodyOpt }],
            ],
            { x: 0.4, y: sectionY, w: sectW, h: sectionH + bodyH, rowH: [sectionH, bodyH], colW: [sectW], border: { type: 'solid', color: BORDER, pt: BORDER_W } }
        );

      slide.addTable(
            [
                [{ text: `추진 계획 (${data.nextWeekNo}W)`, options: sectTitleOpt }],
                [{ text: listToText(data.nextList), options: sectBodyOpt }],
            ],
            { x: col2X, y: sectionY, w: sectW, h: sectionH + bodyH, rowH: [sectionH, bodyH], colW: [sectW], border: { type: 'solid', color: BORDER, pt: BORDER_W } }
        );

        // ── 문제점 및 Issue 표 (이미 단일 표 — 행 높이만 보정) ──
        const issueY = sectionY + sectionH + bodyH + GAP;
        const issueHeadOpt = { bold: true, fill: { color: C.tint }, color: '000000', fontSize: HEAD_FS, align: 'center', valign: 'middle' };
        const issueBodyOpt = { fontSize: 10, valign: 'middle', color: '000000' };

        const tableRows = [
            [
                { text: '문제점 및 Issue', options: issueHeadOpt },
                { text: '대책', options: issueHeadOpt },
                { text: '추진일정', options: issueHeadOpt },
                { text: '담당자', options: issueHeadOpt },
            ]
        ];
        if (issueRows.length > 0) {
            issueRows.forEach(r => tableRows.push(r.map((c, i) => ({ text: c, options: { ...issueBodyOpt, align: i === 0 ? 'left' : 'center' } }))));
        } else {
            tableRows.push(['이번 주 문제점/이슈 없음', '-', '-', '-'].map((c, i) => ({ text: c, options: { ...issueBodyOpt, align: i === 0 ? 'left' : 'center' } })));
        }

        const issueColW = [5, 4.5, 1.3, 1.7];
        const issueRowHeights = tableRows.map((_, i) => i === 0 ? 0.35 : 0.42);

        slide.addTable(tableRows, {
            x: 0.4, y: issueY, w: 12.5,
            h: issueRowHeights.reduce((a, b) => a + b, 0),
            rowH: issueRowHeights,
            fontSize: 9,
            colW: issueColW,
            border: { type: 'solid', color: BORDER, pt: BORDER_W },
            autoPage: false
        });

        const fileBase = (window.exportFilenameStr || 'GanttChart') + '_주간보고';
        pptx.writeFile({ fileName: `${fileBase}.pptx` });
    };
