// [분리됨] 원본: js/14-ai-mail-analysis.js 의 2340~3021행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: [Phase 2 / 2.5] 드라이브 배분 원장 + 저장 시 자동 병합
// =========================================================
// 📤 [Phase 2] 드라이브 백그라운드 배분 + 배분 원장(distributions)
// =========================================================
window._distCtx = null;

window.closeInboxDist = function() {
    document.getElementById('inbox-dist-overlay').style.display = 'none';
    // 💡 dist-step2를 안전한 곳으로 옮긴 뒤, 열려있던 카드의 인라인 패널을 접음
    const step2 = document.getElementById('dist-step2');
    if (step2) { step2.style.display = 'none'; document.body.appendChild(step2); }
    if (window._distCtx && window._distCtx.uid) {
        const inlineEl = document.getElementById('inbox-dist-inline-' + window._distCtx.uid);
        if (inlineEl) { inlineEl.style.display = 'none'; inlineEl.innerHTML = ''; }
        const curAutoRow = document.getElementById('inbox-cur-auto-row-' + window._distCtx.uid);
        if (curAutoRow) curAutoRow.style.display = 'flex';
    }
    window._distCtx = null;
};

window.inboxOpenDistribute = async function(uid) {
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert('🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return; }

    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const r = it.task;
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 보관함에 담아주세요.');
        return;
    }

    // 💡 같은 항목에서 다시 누르면 인라인 목록을 접기 (토글)
    const inlineEl = document.getElementById('inbox-dist-inline-' + uid);
    if (!inlineEl) return;
    const alreadyOpen = inlineEl.style.display !== 'none' && inlineEl.dataset.uid === uid;

    // 💡 dist-step2는 여러 항목이 재사용하는 단일 요소라, 다른 항목 슬롯을 비우기 전에
    //    잠시 안전한 곳(body)으로 옮겨둬서 innerHTML='' 처리 때 함께 삭제되지 않게 보호
    const step2 = document.getElementById('dist-step2');
    if (step2) { step2.style.display = 'none'; document.body.appendChild(step2); }

    // 다른 항목에서 열려있던 인라인 목록은 닫기 (+ 그 항목들의 "현재 프로젝트" 자동위치 줄 복원)
    document.querySelectorAll('[id^="inbox-dist-inline-"]').forEach(function(el) {
        el.style.display = 'none'; el.innerHTML = '';
        const otherUid = el.id.replace('inbox-dist-inline-', '');
        const otherRow = document.getElementById('inbox-cur-auto-row-' + otherUid);
        if (otherRow) otherRow.style.display = 'flex';
    });
    if (alreadyOpen) { const r2 = document.getElementById('inbox-cur-auto-row-' + uid); if (r2) r2.style.display = 'flex'; return; }

    // 💡 [다수 프로젝트 선택] selectedFiles: {fileId: fileName} — 체크된(선택된) 모든 대상 파일을 추적.
    //    0개=패널 숨김, 1개=기존 단일모드(L0 수동 지정) 그대로, 2개 이상=자동위치 일괄전송 모드로 전환.
    window._distCtx = { uid: uid, task: JSON.parse(JSON.stringify(r)), taskName: (r['업무명'] || '새 업무'), selectedFiles: {} };
    inlineEl.dataset.uid = uid;
    inlineEl.style.display = 'block';
    // 💡 "다른 프로젝트" 패널이 펼쳐진 동안은 "현재 프로젝트"용 자동위치 줄을 숨겨 중복처럼 안 보이게 함
    const curAutoRow = document.getElementById('inbox-cur-auto-row-' + uid);
    if (curAutoRow) curAutoRow.style.display = 'none';
    const _distEn = window._currentLang === 'en';
    inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#888; font-size:12px;">' + (_distEn ? '📂 Loading project list...' : '📂 프로젝트 목록을 불러오는 중...') + '</div>';

    try {
        // 🐛 [2026-09-07 버그수정] 예전엔 '${SHARED_FOLDER_ID}' in parents로 루트 직속 파일만 찾아서,
        //    팀별 폴더(개발N팀) 도입 이후 그 하위로 이동한 프로젝트들이 목록에서 빠지는 문제가 있었다
        //    ("다른 프로젝트 선택 시 특정 프로젝트만 보임"). 루트+모든 팀 폴더를 병렬 조회하고 비-프로젝트
        //    파일도 동일 기준으로 걸러주는 공용 헬퍼(_listProjectFiles, 04b-core-app-drive-sync.js)를 재사용.
        const files = await window._listProjectFiles();
        inlineEl.innerHTML = '';
        if (!files.length) {
            inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#aaa; font-size:12px;">' + (_distEn ? 'No project files in the shared folder.' : '공용 폴더에 프로젝트 파일이 없습니다.') + '</div>';
            return;
        }

        // 💡 [2026-09-07 UI 개선] "이름만 보고 클릭해야 세부 프로젝트가 보이는" "프로젝트 불러오기"와
        //    같은 방식으로 통일 — 팀(appProperties.team) → 담당자(appProperties.pm) 2단 아코디언.
        //    팀은 기본 펼침(담당자 이름까지는 바로 보임), 담당자는 기본 접힘(파일명은 클릭해야 보임) —
        //    예전엔 담당자 그룹이 기본 펼침이라 파일명이 한 번에 와르르 보여서 "세부 프로젝트 확인"
        //    단계 없이 목록만 길어 보였다.
        const UNASSIGNED_TEAM = _distEn ? 'Unassigned team' : '미지정 팀';
        const UNASSIGNED_PM   = _distEn ? 'Unassigned' : '미지정';
        const _TEAM_PAL = [
            { h:'#cfe6fa', b:'#a5c8f0', t:'#1a4f7a', hv:'#b8d8f0' }, // 1 파랑
            { h:'#c9ecd3', b:'#a8dab8', t:'#1a6640', hv:'#b0dfc0' }, // 2 초록
            { h:'#ffe3b3', b:'#ffc078', t:'#7a4800', hv:'#ffd090' }, // 3 주황
            { h:'#e0d8ff', b:'#b8a9f0', t:'#3a2080', hv:'#cec4ff' }, // 4 보라
            { h:'#ffd6d0', b:'#f0a9a5', t:'#7a2020', hv:'#ffc0b8' }, // 5 빨강
            { h:'#c8f0e8', b:'#80d0c0', t:'#005040', hv:'#b0e8dc' }, // 6 청록
            { h:'#fdf0b0', b:'#f0d060', t:'#604800', hv:'#fbe898' }, // 7 노랑
            { h:'#e8d8f0', b:'#c0a0d8', t:'#501060', hv:'#d8c4e8' }, // 8 자주
            { h:'#d8f0d8', b:'#90d090', t:'#205020', hv:'#c4e8c4' }, // 9 연두
        ];
        function _pal(teamName) {
            if (!teamName || teamName === UNASSIGNED_TEAM) return { h:'#e9ecef', b:'#ced4da', t:'#495057', hv:'#dee2e6' };
            const m = teamName.match(/(\d+)/);
            if (m) return _TEAM_PAL[(parseInt(m[1], 10) - 1) % _TEAM_PAL.length];
            let hsh = 0;
            for (let i = 0; i < teamName.length; i++) hsh = (hsh * 31 + teamName.charCodeAt(i)) & 0xffff;
            return _TEAM_PAL[hsh % _TEAM_PAL.length];
        }

        // 팀 → 담당자 → 파일 2단 맵
        const teamMap = {};
        files.forEach(function(f) {
            const team = (f.appProperties && f.appProperties.team && f.appProperties.team.trim()) || UNASSIGNED_TEAM;
            const pm   = (f.appProperties && f.appProperties.pm   && f.appProperties.pm.trim())   || UNASSIGNED_PM;
            if (!teamMap[team]) teamMap[team] = {};
            if (!teamMap[team][pm]) teamMap[team][pm] = [];
            teamMap[team][pm].push(f);
        });
        const teamNames = Object.keys(teamMap).sort(function(a, b) {
            if (a === UNASSIGNED_TEAM) return 1;
            if (b === UNASSIGNED_TEAM) return -1;
            const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
            const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.localeCompare(b, 'ko');
        });

        // 파일 1건짜리 선택 가능한 행(row) 생성 — 기존 선택 하이라이트/클릭 동작 그대로 유지
        function _makeDistFileRow(f) {
            const d = new Date(f.modifiedTime);
            const div = document.createElement('div');
            div.className = 'dist-file-item';
            // 💡 [2026-08-24 UX 개선] 클릭해서 고른 항목이 "지금 마우스가 올려진 것"과 구분이 안 돼서
            //    선택됐는지 헷갈린다는 피드백 — hover는 옅은 파란색, 선택은 진한 파란색 배경+굵은 테두리
            //    +체크마크로 시각적으로 확실히 다르게 하고, 마우스를 치워도(mouseout) 선택 상태는 유지한다.
            div.style.cssText = 'padding:8px 10px; border:2px solid #ced4da; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#fff; font-size:12px; transition:0.15s;';
            div.innerHTML = '<span style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'
                + '<span class="dist-file-check" style="display:none; color:#1971c2;">✅ </span>📄 ' + escapeHtml(f.name) + '</span>'
                + '<span style="color:#999; white-space:nowrap; margin-left:8px; font-size:11px;">' + d.toLocaleString() + '</span>';
            const checkEl = div.querySelector('.dist-file-check');
            const applyStyle = function() {
                if (div.classList.contains('dist-file-selected')) {
                    div.style.background = '#d0ebff'; div.style.borderColor = '#1971c2';
                    checkEl.style.display = 'inline';
                } else {
                    div.style.background = '#fff'; div.style.borderColor = '#ced4da';
                    checkEl.style.display = 'none';
                }
            };
            div.onmouseover = function() { if (!div.classList.contains('dist-file-selected')) { this.style.background = '#eef6ff'; this.style.borderColor = '#74b3f0'; } };
            div.onmouseout  = applyStyle;
            div.addEventListener('click', function() {
                // 🐛 [다수 프로젝트 선택 업그레이드] 예전엔 여기서 클릭한 항목 외의 모든 선택을 강제
                //    해제해서(=라디오버튼처럼 한 번에 하나만) 여러 프로젝트에 동시 전송할 수 없었다.
                //    이제는 클릭할 때마다 그 항목 하나만 토글(체크박스처럼)하고, 다른 항목의 선택 상태는
                //    그대로 유지한다 — window._distCtx.selectedFiles에 선택된 {fileId: fileName} 전부를
                //    누적하고, 그 개수에 따라 패널 모드를 바꾸는 판단은 _distRefreshStep2()가 맡는다.
                const ctx = window._distCtx;
                if (!ctx) return;
                const nowSelecting = !div.classList.contains('dist-file-selected');
                if (nowSelecting) {
                    div.classList.add('dist-file-selected');
                    ctx.selectedFiles[f.id] = f.name;
                } else {
                    div.classList.remove('dist-file-selected');
                    delete ctx.selectedFiles[f.id];
                }
                applyStyle();
                // 💡 [2026-08-24 UX 개선] "대상 선택 + 전송 실행" 패널(dist-step2)이 항상 목록 맨 끝에
                //    붙어 있어서, 그룹이 여러 개거나 목록이 길면 방금 고른 항목과 실제 조작할 패널이
                //    화면상 멀리 떨어져 "선택은 됐는데 뭘 눌러야 하는지" 헷갈렸다. 클릭한 항목 바로
                //    아래로 옮겨서, 선택 즉시 그 자리에서 이어서 조작할 수 있게 한다.
                const step2El = document.getElementById('dist-step2');
                if (step2El) div.insertAdjacentElement('afterend', step2El);
                window._distRefreshStep2();
            });
            return div;
        }

        teamNames.forEach(function(teamName) {
            const pmMap = teamMap[teamName];
            const teamFileCount = Object.keys(pmMap).reduce(function(sum, k) { return sum + pmMap[k].length; }, 0);
            const pal = _pal(teamName);

            const teamWrap = document.createElement('div');
            teamWrap.style.cssText = 'border:1.5px solid ' + pal.b + '; border-radius:8px; overflow:hidden; margin-bottom:6px;';

            const teamHdr = document.createElement('div');
            teamHdr.style.cssText = 'padding:6px 10px; background:' + pal.h + '; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:12px; color:' + pal.t + '; user-select:none; transition:background .15s;';
            teamHdr.onmouseover = function() { teamHdr.style.background = pal.hv; };
            teamHdr.onmouseout  = function() { teamHdr.style.background = pal.h; };
            const teamArrow = document.createElement('span');
            teamArrow.style.cssText = 'font-size:10px; width:12px; display:inline-block;';
            teamArrow.textContent = '▾'; // 팀 이름은 기본 펼침 — 그 아래 담당자 이름들이 바로 보이게
            const teamLbl = document.createElement('span');
            teamLbl.textContent = '🏢 ' + teamName + ' (' + teamFileCount + ')';
            teamHdr.appendChild(teamArrow); teamHdr.appendChild(teamLbl);

            const teamBody = document.createElement('div');
            teamBody.style.cssText = 'display:flex; flex-direction:column; gap:5px; padding:6px; background:#fafafa;';
            teamHdr.onclick = function() {
                const collapsed = teamBody.style.display === 'none';
                teamBody.style.display = collapsed ? 'flex' : 'none';
                teamArrow.textContent = collapsed ? '▾' : '▸';
            };

            const pmNames = Object.keys(pmMap).sort(function(a, b) {
                if (a === UNASSIGNED_PM) return 1;
                if (b === UNASSIGNED_PM) return -1;
                return a.localeCompare(b, 'ko');
            });

            pmNames.forEach(function(pmName) {
                const pmFiles = pmMap[pmName];
                const pmWrap = document.createElement('div');
                pmWrap.style.cssText = 'border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; background:#fff;';

                const pmHdr = document.createElement('div');
                pmHdr.style.cssText = 'padding:6px 10px; background:#f8f9fa; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:11.5px; color:#555; user-select:none; transition:background .15s;';
                pmHdr.onmouseover = function() { pmHdr.style.background = '#eef0f2'; };
                pmHdr.onmouseout  = function() { pmHdr.style.background = '#f8f9fa'; };
                const pmArrow = document.createElement('span');
                pmArrow.style.cssText = 'font-size:10px; width:12px; display:inline-block;';
                pmArrow.textContent = '▸'; // 💡 담당자 이름만 초기 노출 — 세부 프로젝트(파일)는 클릭해야 펼쳐짐
                const pmLbl = document.createElement('span');
                pmLbl.textContent = '👤 ' + pmName + ' (' + pmFiles.length + ')';
                pmHdr.appendChild(pmArrow); pmHdr.appendChild(pmLbl);

                const pmBody = document.createElement('div');
                pmBody.style.cssText = 'display:none; flex-direction:column; gap:5px; padding:6px;'; // 기본 접힘
                pmHdr.onclick = function() {
                    const collapsed = pmBody.style.display === 'none';
                    pmBody.style.display = collapsed ? 'flex' : 'none';
                    pmArrow.textContent = collapsed ? '▾' : '▸';
                };
                pmFiles.forEach(function(f) { pmBody.appendChild(_makeDistFileRow(f)); });

                pmWrap.appendChild(pmHdr); pmWrap.appendChild(pmBody);
                teamBody.appendChild(pmWrap);
            });

            teamWrap.appendChild(teamHdr); teamWrap.appendChild(teamBody);
            inlineEl.appendChild(teamWrap);
        });

        // 💡 상세 배치 단계(개발단계 선택 + 전송실행)를 팝업이 아니라 이 카드 안으로 이동
        inlineEl.appendChild(document.getElementById('dist-step2'));
    } catch (err) {
        inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#e03131; font-size:12px;">' + (_distEn ? '❌ Failed to load list: please check your Drive connection and permissions.' : '❌ 목록 호출 실패: 드라이브 연동 상태 또는 권한을 확인해주세요.') + '</div>';
    }
};

// 💡 [다수 프로젝트 선택] 선택된 파일 개수에 따라 dist-step2 패널의 모드를 결정한다.
//    0개: 패널 숨김. 1개: 기존 단일모드(L0 수동 지정 가능, inboxDistPickFile 그대로 재사용).
//    2개 이상: 프로젝트마다 개발단계(L0) 구조가 달라 한 화면에서 전부 수동 지정하기 어려우므로,
//    자동위치(시작일 기준) 일괄전송 전용 간소화 패널(dist-step2-multi)로 전환한다.
window._distRefreshStep2 = function() {
    const ctx = window._distCtx;
    const step2 = document.getElementById('dist-step2');
    const single = document.getElementById('dist-step2-single');
    const multi = document.getElementById('dist-step2-multi');
    if (!ctx || !step2) return;
    const ids = Object.keys(ctx.selectedFiles || {});

    if (ids.length === 0) {
        step2.style.display = 'none';
        ctx.fileId = null; ctx.saveData = null; ctx.rows = null;
        return;
    }
    if (ids.length === 1) {
        if (multi) multi.style.display = 'none';
        if (single) single.style.display = '';
        window.inboxDistPickFile(ids[0], ctx.selectedFiles[ids[0]]); // 내부에서 step2.style.display='block' 처리
        return;
    }

    // 2개 이상 — 단일모드에서 쓰던 잔여 상태(fileId 등)는 정리하고 다중모드로 전환
    if (single) single.style.display = 'none';
    ctx.fileId = null; ctx.saveData = null; ctx.rows = null;
    if (multi) {
        multi.style.display = '';
        const countEl = document.getElementById('dist-multi-count');
        const namesEl = document.getElementById('dist-multi-names');
        if (countEl) countEl.textContent = String(ids.length);
        if (namesEl) namesEl.textContent = ids.map(function(id) { return ctx.selectedFiles[id]; }).join(', ');
    }
    step2.style.display = 'block';
};

// 대상 파일 선택 → 내용/시점 확보 → L0 선택 단계 표시
window.inboxDistPickFile = async function(fileId, fileName) {
    const ctx = window._distCtx;
    if (!ctx) return;
    document.getElementById('dist-step2').style.display = 'none';
    try {
        // 💡 [성능] metadata/content 두 호출을 순차 await 하면 alt=media 지연이 그대로 두 번 더해짐 —
        //    서로 독립적인 호출이므로 병렬로 보내 대기 시간을 절반 가까이 줄임
        const [metaResp, contentResp] = await Promise.all([
            gapi.client.drive.files.get({ fileId: fileId, fields: 'modifiedTime', supportsAllDrives: true }),
            gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true })
        ]);
        // 💡 [버그 수정] alt=media는 수 초~수십 초 걸릴 수 있는데, 그동안 사용자가 패널을 닫거나
        //    (closeInboxDist → window._distCtx = null) 다른 업무의 "다른 프로젝트 선택"을 열면
        //    (inboxOpenDistribute → window._distCtx = 새 객체) window._distCtx가 이 요청을 시작할
        //    때와 달라진다. 그 상태로 그대로 진행하면 inboxDistFillL0Select()가 null이거나
        //    엉뚱한 업무의 window._distCtx를 읽어 "Cannot read properties of null (reading 'saveData')"
        //    로 크래시하거나, 최악의 경우 다른 업무의 ctx에 이 파일 데이터를 덮어씀 — 응답이 온 시점에
        //    여전히 같은 요청인지(참조가 동일한지) 확인해서 아니면 조용히 무시
        if (window._distCtx !== ctx) return;
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) {
            alert('⚠️ 대상 파일에 간트 데이터가 없거나 구조를 해석할 수 없습니다.');
            return;
        }
        ctx.fileId = fileId;
        ctx.fileName = fileName;
        ctx.fetchedModifiedTime = metaResp.result.modifiedTime;
        ctx.saveData = saveData;
        ctx.rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        // 💡 저장된 스냅샷의 _calcStartTs를 그대로 믿지 않고, 방금 불러온 데이터로 직접 재계산
        window.computeCalcDatesForRows(ctx.rows.slice(1), ctx.saveData.colIdx);
        window.inboxDistFillL0Select(undefined);
        document.getElementById('dist-target-name').textContent = fileName;
        document.getElementById('dist-step2').style.display = 'block';
    } catch (err) {
        if (window._distCtx !== ctx) return; // 이미 패널을 닫고 나간 뒤라면 에러 알림도 띄우지 않음
        alert('대상 프로젝트 로드 실패: ' + err.message);
    }
};

// 대상 프로젝트의 L0 목록으로 드롭다운 구성 (preferred 값 우선 선택)
window.inboxDistFillL0Select = function(preferred) {
    const ctx = window._distCtx;
    const tCol = ctx.saveData.colIdx;
    const l0s = window.buildL0SectionInfo(ctx.rows, tCol);

    let want = preferred;
    if (want === undefined) want = window.pickL0SectionByDate(l0s, ctx.task['시작일'] || '');

    const sel = document.getElementById('dist-l0-select');
    sel.innerHTML = '<option value="__END__">(맨 끝에 추가)</option>' + l0s.map(function(sec) {
        const range = window.formatYM(sec.startTs) + '~' + window.formatYM(sec.endTs);
        return '<option value="' + escapeHtml(sec.name) + '"' + (sec.name === want ? ' selected' : '') + '>' + escapeHtml(sec.name) + ' 구간 끝 (' + range + ')</option>';
    }).join('');
    sel.onchange = window.distRecomputePreview;
    window.distRecomputePreview();
};

window.distRecomputePreview = function() {
    const ctx = window._distCtx;
    const sel = document.getElementById('dist-l0-select');
    const autoEl = document.getElementById('dist-auto-position');
    const previewEl = document.getElementById('dist-position-preview');
    if (!ctx || !ctx.saveData || !sel || !previewEl) return;
    const info = window.computeL0InsertPos(ctx.rows, ctx.saveData.colIdx, sel.value, ctx.task['시작일'], autoEl ? autoEl.checked : true);
    previewEl.textContent = info.previewLabel;
};

// 충돌 감지 시 최신본 재확보
window.inboxDistReload = async function(prevL0) {
    const ctx = window._distCtx;
    if (!ctx) return false;
    try {
        // 💡 [성능] inboxDistPickFile과 동일하게 병렬 호출
        const [metaResp, contentResp] = await Promise.all([
            gapi.client.drive.files.get({ fileId: ctx.fileId, fields: 'modifiedTime', supportsAllDrives: true }),
            gapi.client.drive.files.get({ fileId: ctx.fileId, alt: 'media', supportsAllDrives: true })
        ]);
        // 💡 대기 중 패널이 닫히거나 다른 업무로 전환됐으면 중단 (동일한 크래시 방지 목적)
        if (window._distCtx !== ctx) return false;
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) { alert('⚠️ 최신본 구조를 해석할 수 없습니다.'); return false; }
        ctx.saveData = saveData;
        ctx.rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        // 💡 여기서도 최신본 기준으로 재계산
        window.computeCalcDatesForRows(ctx.rows.slice(1), ctx.saveData.colIdx);
        ctx.fetchedModifiedTime = metaResp.result.modifiedTime;
        window.inboxDistFillL0Select(prevL0);
        const sel = document.getElementById('dist-l0-select');
        if (prevL0 !== '__END__' && sel.value !== prevL0) {
            alert('⚠️ 최신본에서 선택했던 개발단계 구간이 사라졌습니다.\n구간을 다시 선택한 후 전송해주세요.');
            return false;
        }
        return true;
    } catch (err) {
        if (window._distCtx !== ctx) return false;
        alert('최신본 확보 실패: ' + err.message); return false;
    }
};

// 전송 실행 (attempt: 충돌 자동 재시도 횟수)
window.inboxDistExecute = async function(attempt) {
    const ctx = window._distCtx;
    if (!ctx || !ctx.fileId) return;
    const btn = document.getElementById('dist-exec-btn');
    btn.disabled = true; btn.textContent = '⏳ 전송 중...';
    try {
        const chosenL0 = document.getElementById('dist-l0-select').value;

        // (a) 충돌 검사: 전송 직전 modifiedTime 재확인
        const mResp = await gapi.client.drive.files.get({ fileId: ctx.fileId, fields: 'modifiedTime', supportsAllDrives: true });
        if (mResp.result.modifiedTime !== ctx.fetchedModifiedTime) {
            if ((attempt || 0) >= 2) {
                alert('⚠️ 대상 파일이 계속 갱신되고 있어 전송을 중단했습니다.\n잠시 후 다시 시도해주세요.');
                return;
            }
            alert('⚠️ 대상 파일이 방금 다른 사용자에 의해 갱신되었습니다.\n최신본을 받아 자동 재시도합니다.');
            const ok = await window.inboxDistReload(chosenL0);
            if (!ok) return;
            return await window.inboxDistExecute((attempt || 0) + 1);
        }

        // 행 생성 — 대상 프로젝트의 컬럼 구조(colIdx) 기준
        const tCol = ctx.saveData.colIdx;
        const built = window.buildMailTaskRow(ctx.task, ctx.rows, tCol);
        built.row._알림 = true; // ✅ 배분 업무는 대상 프로젝트에서 D-7/3/1 알림 대상으로 자동 설정

        // L0~4 구간 내 시작일 기준 최적 위치 계산 (자동 미충족 시 구간 끝 fallback)
        const autoEl = document.getElementById('dist-auto-position');
        const posInfo = window.computeL0InsertPos(ctx.rows, tCol, chosenL0, ctx.task['시작일'], autoEl ? autoEl.checked : true);
        const pos = posInfo.pos;
        if (chosenL0 !== '__END__' && tCol.devStage !== -1) {
            built.row[tCol.devStage] = chosenL0;
        }
        ctx.rows.splice(pos, 0, built.row);

        // 배분 원장 + 대상 프로젝트 수정이력 기록
        const nowIso = new Date().toISOString();
        const userName = window.currentUserName || '비로그인 (로컬)';
        ctx.saveData.distributions = ctx.saveData.distributions || [];
        const distUid = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        ctx.saveData.distributions.push({
            uid: distUid, inboxUid: ctx.uid,
            task: JSON.parse(JSON.stringify(ctx.task)),
            taskName: built.taskName, targetL0: chosenL0,
            insertedAt: nowIso, by: userName, source: '업무보관함', processed: false
        });
        ctx.saveData.changeLogs = ctx.saveData.changeLogs || [];
        ctx.saveData.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'), userName: userName,
            rowName: pos, colName: '행 조작', oldVal: '없음',
            newVal: `보관함에서 배분 추가: ${built.taskName}`
        });

        // 직렬화 (saveToGoogleDrive와 동일 규격)
        ctx.saveData.globalData = ctx.rows.map(function(row) {
            let o = { data: Array.from(row) };
            for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
            return o;
        });

        // PATCH 업로드
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert('🔒 구글 인증 토큰이 유실되었습니다. 상단 연동 버튼으로 재로그인 후 시도해주세요.'); return; }
        const boundary = 'inbox_dist_boundary';
        const metadata = { name: ctx.fileName, mimeType: 'application/json' };
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(ctx.saveData)
                   + "\r\n--" + boundary + "--";
        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + ctx.fileId + '?uploadType=multipart&supportsAllDrives=true', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: body
        });
        const file = await resp.json();
        if (resp.ok && file && file.id) {
            window.TaskInbox.setStatus(ctx.uid, '전송됨', { type: '드라이브전송', target: ctx.fileName, distUid: distUid, at: nowIso });
            alert(`🎉 "${built.taskName}" 업무가 [${ctx.fileName}] 프로젝트로 전송되었습니다!\n(${posInfo.previewLabel})\n(📌 알림 자동 설정 · 수정이력/배분원장 기록 완료)`);
            window.closeInboxDist();
            window.renderTaskInbox();
        } else {
            const status = resp.status || (file && file.error ? file.error.code : 0);
            let msg = '업로드 중 오류가 발생했습니다.';
            if (status === 401) msg = '🔒 구글 인증 세션이 만료되었습니다. 상단 연동 버튼으로 재로그인 후 시도해주세요.';
            else if (status === 403) msg = '🚫 공유 폴더의 편집자 권한이 없습니다.';
            else if (file && file.error) msg = `구글 드라이브 에러 (${status}): ${file.error.message}`;
            alert('❌ 전송 실패\n\n' + msg);
        }
    } catch (err) {
        alert('전송 시스템 에러: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = '🚀 전송 실행';
    }
};

// ═══════════════════════════════════════════════════════════
// 🔀 [다수 프로젝트 선택] 업무 1건을 여러 대상 프로젝트에 자동위치(시작일 기준)로 동시 배분하는
//    공용 헬퍼. Task Inbox "다른 프로젝트로 전송" 다중선택(inboxDistExecuteMulti)과, 메일서버 탭
//    "미분류 → 프로젝트 매칭 재분석 요청"의 다수 프로젝트 선택(15b-mail-server-tab-1.js의
//    _msQueueReanalyzeMulti) 양쪽에서 재사용한다 — 같은 "Drive 파일 읽기→행 삽입→PATCH 저장" 로직을
//    두 파일에 중복 구현하지 않기 위함.
//    - task: buildMailTaskRow가 받는 업무 객체(업무명/시작일/완료일/상세내용 등 한글 키)
//    - targets: [{ id: <Drive fileId>, name: <파일명> }, ...]
//    - opts: { inboxUid, source, onProgress(i, n, name) } 전부 선택
//    ⚠️ inboxDistExecute(단일모드)와 달리 "이전에 받아둔 내용이 그새 바뀌었는지" 사전 대조를 하지
//    않는다 — 대상마다 실행 직전에 매번 새로 fetch해서 바로 건축→저장하므로 충돌 창(window) 자체가
//    이미 최소화되어 있고, N개 대상 각각에 재시도 루프까지 넣으면 복잡도만 커진다. 만에 하나 그 짧은
//    순간에 다른 사용자가 같은 파일을 저장했다면 이 배분은 실패로 집계되어 failNames에 남으므로,
//    사용자가 결과를 보고 그 프로젝트만 다시 시도하면 된다.
window.distSendTaskToTargets = async function(task, targets, opts) {
    opts = opts || {};
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) {
        alert('🔒 구글 인증 토큰이 유실되었습니다. 상단 연동 버튼으로 재로그인 후 시도해주세요.');
        return { okNames: [], failNames: (targets || []).map(function(t) { return t.name; }) };
    }

    const okNames = [], failNames = [];
    for (let i = 0; i < targets.length; i++) {
        const fileId = targets[i].id, fileName = targets[i].name;
        if (opts.onProgress) opts.onProgress(i + 1, targets.length, fileName);
        try {
            const [metaResp, contentResp] = await Promise.all([
                gapi.client.drive.files.get({ fileId: fileId, fields: 'modifiedTime', supportsAllDrives: true }),
                gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true })
            ]);
            void metaResp; // 다중모드에선 충돌 사전대조를 하지 않으므로 modifiedTime 자체는 쓰지 않음(위 주석 참고)
            const saveData = contentResp.result;
            if (!saveData || !saveData.globalData || !saveData.colIdx) { failNames.push(fileName + ' (구조 해석 실패)'); continue; }
            const rows = saveData.globalData.map(function(obj) {
                let row = obj.data;
                for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
                return row;
            });
            window.computeCalcDatesForRows(rows.slice(1), saveData.colIdx);

            const tCol = saveData.colIdx;
            const l0s = window.buildL0SectionInfo(rows, tCol);
            const chosenL0 = window.pickL0SectionByDate(l0s, task['시작일'] || '');

            const built = window.buildMailTaskRow(task, rows, tCol);
            built.row._알림 = true;
            const posInfo = window.computeL0InsertPos(rows, tCol, chosenL0, task['시작일'], true);
            const pos = posInfo.pos;
            if (chosenL0 !== '__END__' && tCol.devStage !== -1) built.row[tCol.devStage] = chosenL0;
            rows.splice(pos, 0, built.row);

            const nowIso = new Date().toISOString();
            const userName = window.currentUserName || '비로그인 (로컬)';
            saveData.distributions = saveData.distributions || [];
            const distUid = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            saveData.distributions.push({
                uid: distUid, inboxUid: opts.inboxUid || null,
                task: JSON.parse(JSON.stringify(task)),
                taskName: built.taskName, targetL0: chosenL0,
                insertedAt: nowIso, by: userName, source: opts.source || '다중전송', processed: false
            });
            saveData.changeLogs = saveData.changeLogs || [];
            saveData.changeLogs.push({
                time: new Date().toLocaleString('ko-KR'), userName: userName,
                rowName: pos, colName: '행 조작', oldVal: '없음',
                newVal: `${opts.source || '다중전송'}: ${built.taskName}`
            });
            saveData.globalData = rows.map(function(row) {
                let o = { data: Array.from(row) };
                for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
                return o;
            });

            const boundary = 'dist_multi_boundary';
            const metadata = { name: fileName, mimeType: 'application/json' };
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                       + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData)
                       + "\r\n--" + boundary + "--";
            const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=multipart&supportsAllDrives=true', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                body: body
            });
            const file = await resp.json();
            if (resp.ok && file && file.id) {
                okNames.push(fileName + ' (' + posInfo.previewLabel + ')');
            } else {
                const status = resp.status || (file && file.error ? file.error.code : 0);
                failNames.push(fileName + ' (오류 ' + status + ')');
            }
        } catch (err) {
            failNames.push(fileName + ' (' + err.message + ')');
        }
    }
    return { okNames: okNames, failNames: failNames };
};

// [다수 프로젝트 선택] Task Inbox "다른 프로젝트로 전송" — 2개 이상 체크된 상태에서 실행
window.inboxDistExecuteMulti = async function() {
    const ctx = window._distCtx;
    if (!ctx) return;
    const ids = Object.keys(ctx.selectedFiles || {});
    if (ids.length < 2) return;
    const btn = document.getElementById('dist-exec-multi-btn');
    btn.disabled = true;
    const targets = ids.map(function(id) { return { id: id, name: ctx.selectedFiles[id] }; });

    const result = await window.distSendTaskToTargets(ctx.task, targets, {
        inboxUid: ctx.uid, source: '업무보관함(다중전송)',
        onProgress: function(i, n) { btn.textContent = '⏳ 전송 중... (' + i + '/' + n + ')'; }
    });

    btn.disabled = false; btn.textContent = '🚀 일괄 전송 실행';

    if (result.okNames.length) {
        window.TaskInbox.setStatus(ctx.uid, '전송됨', {
            type: '드라이브전송(다중)',
            target: targets.map(function(t) { return t.name; }).join(', '),
            at: new Date().toISOString()
        });
    }
    let msg = '';
    if (result.okNames.length) msg += `🎉 ${result.okNames.length}개 프로젝트로 전송 완료!\n· ` + result.okNames.join('\n· ');
    if (result.failNames.length) msg += (msg ? '\n\n' : '') + `❌ ${result.failNames.length}건 실패\n· ` + result.failNames.join('\n· ');
    alert(msg || '전송할 항목이 없습니다.');

    if (result.okNames.length) {
        window.closeInboxDist();
        window.renderTaskInbox();
    }
};

// =========================================================
// 📥 [Phase 2.5] 저장 시 배분 원장 자동 병합
//    낡은 사본으로 저장해도 "내가 연 이후 배분된 업무"가 유실되지 않도록 방어
// =========================================================
// 💡 [성능 수정] 이 함수가 저장할 때마다 프로젝트 파일 전체를 통째로 다시 다운로드하고 있었다
//    (실측: 같은 파일을 "프로젝트 열기"로 받을 때 1초 남짓 걸리던 게, 저장 직전엔 이 중복 다운로드
//    까지 겹쳐서 "프로젝트 열기" 버튼의 "전환 전 저장" 단계가 3~4초, 응답이 느릴 땐 47초까지도
//    걸렸다). 배분 원장(distributions)에 새 항목이 왔는지 확인하려고 매번 파일 전체를 받을 필요는
//    없다 — 가벼운 modifiedTime만 먼저 확인해서, 마지막으로 내가 저장(또는 확인)한 이후 파일이 실제로
//    바뀐 적이 없으면(=다른 사람이 그 사이 배분한 적이 없으면) 무거운 전체 다운로드를 건너뛴다.
//    (이 코드베이스의 다른 곳 — 업무 보관함 배분 충돌 감지 등 — 에서 이미 쓰던 modifiedTime 선확인
//    패턴과 동일)
window._distMergeModifiedTime = window._distMergeModifiedTime || {};
// 💡 [2026-08-25] 반환값에 remoteChanged/hadBaseline을 추가 — "배분 이력 병합" 원래 목적과 별개로,
//    이 함수가 이미 하고 있던 "마지막으로 내가 확인한 이후 원격 파일이 바뀌었는가" 체크가 그대로
//    "다른 사용자가 먼저 저장했는지" 판단에도 쓸 수 있는 정보라, _saveToGoogleDriveRaw의 저장 충돌
//    경고에 재사용한다(네트워크 왕복을 늘리지 않고 기존 체크에 얹음).
//    - hadBaseline: 비교할 이전 값 자체가 없었으면(신규 세션 등) false → 이땐 "충돌"이라 단정할 근거가
//      약하므로 경고를 띄우지 않는다(오탐 방지).
//    - remoteChanged: hadBaseline이 true인데 그 값과 지금 원격 modifiedTime이 다르면 true.
window.mergeRemoteDistributions = async function(fileId) {
    try {
        const _tM0 = performance.now();
        const metaResp = await gapi.client.drive.files.get({ fileId: fileId, fields: 'modifiedTime', supportsAllDrives: true });
        const remoteModifiedTime = metaResp.result.modifiedTime;
        const _hadBaseline = window._distMergeModifiedTime[fileId] !== undefined;
        const _remoteChanged = _hadBaseline && window._distMergeModifiedTime[fileId] !== remoteModifiedTime;
        if (window._distMergeModifiedTime[fileId] === remoteModifiedTime) {
            console.info(`[저장 계측] 배분 병합 확인: ${Math.round(performance.now() - _tM0)}ms (변경 없음 → 전체 다운로드 생략)`);
            return { remoteChanged: false, hadBaseline: _hadBaseline }; // 마지막 확인 이후 파일이 안 바뀜 → 전체 다운로드 생략
        }
        window._distMergeModifiedTime[fileId] = remoteModifiedTime;

        const resp = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
        console.info(`[저장 계측] 배분 병합 확인: ${Math.round(performance.now() - _tM0)}ms (파일이 바뀌어 전체 다운로드 수행)`);
        const remote = resp.result || {};
        const remoteDists = remote.distributions || [];
        if (!remoteDists.length) return;

        window.projectDistributions = window.projectDistributions || [];
        const knownUids = {};
        window.projectDistributions.forEach(function(d) { if (d && d.uid) knownUids[d.uid] = true; });

        let mergedNames = [];
        remoteDists.forEach(function(d) {
            if (!d || !d.uid || knownUids[d.uid]) return; // 이미 아는 배분 → 로컬 상태 존중 (삭제했다면 삭제 유지)

            // 원장 엔트리 자체는 무조건 보존 (내 저장으로 원격 이력이 지워지는 것 방지)
            window.projectDistributions.push(d);
            knownUids[d.uid] = true;
            if (d.processed === true || !d.task) return;

            // 🐛 [2026-09-08 버그수정] "자동 배치될 때 날짜 매칭 없이 항상 맨 아래(또는 구간 끝)에
            //    꽂힌다"는 제보 — 원인은 이 자동 병합 경로가 "그 L0 구간의 마지막 행 뒤"에만 넣을 뿐,
            //    같은 구간 안에서 실제 시작일을 비교해 알맞은 위치를 찾는 로직(computeL0InsertPos)을
            //    아예 안 부르고 있었다. 사람이 직접 "업무 보관함 → 배분" 버튼을 눌러 배분할 때
            //    (inboxDistExecute, 위 window.computeL0InsertPos 참고)는 이미 날짜 매칭을 정상적으로
            //    하고 있었으므로, 그 함수를 그대로 재사용해서 자동 병합 경로도 동일하게 맞춘다.
            //    L0 구간 자체를 못 찾거나(로컬에 그 개발단계가 없음) targetL0이 '__END__'/미지정이면
            //    기존과 동일하게 맨 끝으로 자연스럽게 fallback된다(computeL0InsertPos 내부 처리).
            const built = window.buildMailTaskRow(d.task);
            built.row._알림 = true;
            const posInfo = window.computeL0InsertPos(globalData, colIdx, d.targetL0 || '__END__', d.task && d.task['시작일'], true);
            const pos = posInfo.pos;
            if (d.targetL0 && d.targetL0 !== '__END__' && colIdx.devStage !== -1) {
                built.row[colIdx.devStage] = d.targetL0;
            }
            globalData.splice(pos, 0, built.row);

            window.changeLogs.push({
                time: new Date().toLocaleString('ko-KR'),
                userName: '자동 병합',
                rowName: pos, colName: '행 조작', oldVal: '없음',
                newVal: `배분 업무 자동 병합: ${built.taskName} (배분자: ${d.by || '알수없음'})`
            });
            mergedNames.push(built.taskName);
        });

        // 원장 크기 제한: 최근 100건만 유지 (파일 비대화 방지)
        if (window.projectDistributions.length > 100) {
            window.projectDistributions = window.projectDistributions.slice(-100);
        }

        if (mergedNames.length) {
            window.recalculateSchedules();
            alert(`📥 작업하는 동안 다른 사용자가 배분한 업무 ${mergedNames.length}건이 자동 병합되어 함께 저장됩니다.\n\n· ${mergedNames.join('\n· ')}`);
        }
        return { remoteChanged: _remoteChanged, hadBaseline: _hadBaseline };
    } catch (err) {
        // 병합 확인 실패해도 저장 자체는 막지 않음 (기존 저장 동작 보존) — 충돌 여부도 알 수 없으니 경고하지 않음
        console.warn('배분 원장 병합 확인 실패(저장은 계속 진행):', err);
        return { remoteChanged: false, hadBaseline: false, error: err };
    }
};

// ═══════════════════════════════════════════════════════════
// 🔀 [2026-08-27 신규] 필드/셀 단위 3-way 병합 — "다른 사용자 저장 시 통째로 덮어쓰기/취소" 둘 중
//    하나뿐이던 것을, base(내가 마지막으로 저장을 확인한 시점) / mine(지금 내 화면) / theirs(방금
//    확인한 드라이브 최신본) 세 가지를 놓고 Git처럼 비교해서, 서로 다른 셀을 고친 거면 자동으로
//    합치고 "진짜로 같은 셀"을 양쪽이 다르게 고쳤을 때만 충돌로 집계한다.
//    위 mergeRemoteDistributions()가 배분원장 하나에만 하던 걸 표 전체로 넓힌 버전.
//
//    전제: 각 행을 위치(배열 인덱스)가 아니라 고유 _rowUid로 식별해야 행 추가/삭제/이동이 섞여도
//    "같은 행"을 정확히 매칭할 수 있다. _rowUid는 다른 "_"로 시작하는 필드처럼 저장/불러오기 때
//    자동으로 함께 저장·복원된다(serializedGlobalData 로직 재사용, 별도 배선 불필요).
// ═══════════════════════════════════════════════════════════
window._newRowUid = function() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

// 옛 프로젝트(이 기능 이전에 저장된 파일)나 이 함수를 거치지 않고 만들어진 행 등, uid가 없는 행에
// 새로 부여한다. 저장 직전(_saveToGoogleDriveRaw)에 항상 호출해서 "저장되는 모든 행은 uid를 가진다"를 보장.
window._ensureRowUids = function() {
    if (!globalData) return;
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (row && !row._rowUid) row._rowUid = window._newRowUid();
    }
};

// 저장된(=드라이브 JSON 원형) globalData 배열을 화면에서 쓰는 행 배열 형태로 복원. executeLoadFile 등
// 기존 로드 코드의 "obj.data + '_'로 시작하는 키 복사" 패턴과 동일 — 병합에서 "theirs"를 읽을 때 재사용.
window._deserializeGlobalDataForMerge = function(savedArr) {
    if (!Array.isArray(savedArr)) return null;
    return savedArr.map(function(obj) {
        if (!obj || !obj.data) return null;
        const row = obj.data.slice();
        for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
        return row;
    });
};

// 병합용 경량 스냅샷: uid → 셀값 배열. 저장 성공 직후("이제부터 이게 서버와 일치하는 상태") 캡처해두고,
// 다음 저장 때 3-way 병합의 base로 쓴다. 파일(fileId)별로 보관 — 멀티시트로 여러 프로젝트를 동시에
// 열어놔도 서로 섞이지 않음.
window._mergeBaselines = window._mergeBaselines || {};
window._captureMergeBaseline = function(fileId) {
    if (!fileId || !globalData) return;
    const map = {};
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (row && row._rowUid) map[row._rowUid] = Array.from(row);
    }
    window._mergeBaselines[fileId] = map;
};

// base(baselineMap) / mine(globalData 현재 상태) / theirs(방금 받은 드라이브 최신 globalData)를 놓고
// 3-way 병합. 헤더(0행=컬럼 구조)가 다르면 셀 비교 자체가 위험하므로 포기(null 반환 → 호출부가 기존
// 방식인 확인모달로 폴백).
window._threeWayMergeGlobalData = function(baselineMap, mineGd, theirsGd) {
    const result = { mergedGd: null, addedByThem: [], deletedByThemHonored: [], deletedByMeHonored: [],
        editVsDeleteConflicts: [], cellConflicts: [] };
    if (!theirsGd || !theirsGd[0] || !mineGd || !mineGd[0]) return result;
    if (JSON.stringify(theirsGd[0]) !== JSON.stringify(Array.from(mineGd[0]))) return result;

    baselineMap = baselineMap || {};
    const mineMap = {};
    for (let i = 1; i < mineGd.length; i++) { const r = mineGd[i]; if (r && r._rowUid) mineMap[r._rowUid] = r; }
    const theirsMap = {}; const theirsOrder = [];
    for (let i = 1; i < theirsGd.length; i++) {
        const r = theirsGd[i]; const uid = r && r._rowUid;
        if (uid) { theirsMap[uid] = r; theirsOrder.push(uid); }
    }

    const mergedRows = [];
    const findMergedPos = function(uid) { return mergedRows.findIndex(function(r) { return r && r._rowUid === uid; }); };
    // theirs 순서상 이웃(앞→뒤 순으로 탐색)이 이미 병합 결과에 있으면 그 옆에 끼워 넣고, 못 찾으면 맨 뒤에 붙인다.
    const insertNearTheirsPosition = function(uid, rowToInsert) {
        const idx = theirsOrder.indexOf(uid);
        for (let k = idx - 1; k >= 0; k--) {
            const pos = findMergedPos(theirsOrder[k]);
            if (pos !== -1) { mergedRows.splice(pos + 1, 0, rowToInsert); return; }
        }
        for (let k = idx + 1; k < theirsOrder.length; k++) {
            const pos = findMergedPos(theirsOrder[k]);
            if (pos !== -1) { mergedRows.splice(pos, 0, rowToInsert); return; }
        }
        mergedRows.push(rowToInsert);
    };

    // 1) 내 현재 순서를 뼈대로 진행 — 각 행을 base/theirs와 대조
    for (let i = 1; i < mineGd.length; i++) {
        const mineRow = mineGd[i];
        const uid = mineRow && mineRow._rowUid;
        if (!uid) { mergedRows.push(mineRow); continue; } // uid 없는 비정상 행은 그대로 통과(발생 안 하는 게 정상)

        const baseRow = baselineMap[uid];
        const theirsRow = theirsMap[uid];

        if (!theirsRow) {
            if (baseRow) {
                // base엔 있었는데 theirs엔 없음 = 그들이 삭제함
                const mineChanged = JSON.stringify(baseRow) !== JSON.stringify(Array.from(mineRow));
                if (mineChanged) {
                    // 삭제 vs 편집 충돌 → 내용을 지키는 쪽 우선(조용한 유실 방지)
                    result.editVsDeleteConflicts.push({ uid, side: 'theirsDeleted' });
                    mergedRows.push(mineRow);
                } else {
                    result.deletedByThemHonored.push(uid); // 나도 안 건드렸으면 그들의 삭제를 존중
                }
            } else {
                mergedRows.push(mineRow); // base에도 theirs에도 없음 = 내가 새로 만든 행
            }
            continue;
        }
        if (!baseRow) { mergedRows.push(mineRow); continue; } // base엔 없는데 양쪽 다 있음(사실상 불가능) → mine 신뢰

        // 셀 단위 3-way 비교
        const baseCells = baseRow, mineCells = Array.from(mineRow), theirsCells = Array.from(theirsRow);
        for (let c = 0; c < mineCells.length; c++) {
            const b = baseCells[c], m = mineCells[c], t = theirsCells[c];
            if (m === t) continue; // 이미 같으면 볼 것 없음
            const mineChanged = m !== b, theirsChanged = t !== b;
            if (theirsChanged && !mineChanged) {
                mineRow[c] = t; // 나는 안 건드림, 그들만 바꿈 → 그들 값 채택
            } else if (mineChanged && theirsChanged) {
                result.cellConflicts.push({ uid, col: c, base: b, mine: m, theirs: t }); // 둘 다 다르게 바꿈 → 진짜 충돌(내 값 유지)
            }
            // mineChanged && !theirsChanged → 이미 mineRow[c]가 내 값이므로 그대로 둠
        }
        mergedRows.push(mineRow);
    }

    // 2) theirs에만 새로 생긴 행(base에도 mine에도 없음) → union add, theirs 순서상 위치 근처에 삽입
    theirsOrder.forEach(function(uid) {
        if (mineMap[uid] || baselineMap[uid]) return;
        result.addedByThem.push(uid);
        insertNearTheirsPosition(uid, theirsMap[uid]);
    });

    // 3) base엔 있었는데 mine엔 없고(내가 지움) theirs엔 있는 행
    Object.keys(baselineMap).forEach(function(uid) {
        if (mineMap[uid]) return; // 내가 안 지움(이미 위에서 처리됨)
        const theirsRow = theirsMap[uid];
        if (!theirsRow) return; // 그들도 지움 → 삭제 합의, 처리 끝
        const theirsChanged = JSON.stringify(baselineMap[uid]) !== JSON.stringify(Array.from(theirsRow));
        if (theirsChanged) {
            result.editVsDeleteConflicts.push({ uid, side: 'mineDeleted' });
            insertNearTheirsPosition(uid, theirsRow); // 내가 지웠지만 그들이 편집 → 내용 보존을 위해 되살림
        } else {
            result.deletedByMeHonored.push(uid); // 그들도 안 건드렸으면 내 삭제를 존중
        }
    });

    result.mergedGd = [mineGd[0]].concat(mergedRows);
    return result;
};

// 저장 중 충돌이 감지됐을 때 위 3-way 병합을 실제로 시도. 성공하면 globalData를 병합 결과로 교체하고
// { applied:true, summaryMsg } 반환 — 실패/불가능(baseline 없음·헤더 구조 다름 등)하면 { applied:false }를
// 반환해서 호출부가 기존의 "그래도 저장/취소" 확인모달로 안전하게 폴백하도록 한다.
window._tryThreeWayMergeOnConflict = async function(fileId, token) {
    try {
        const baselineMap = window._mergeBaselines[fileId];
        if (!baselineMap) return { applied: false }; // 이번 세션에서 아직 한 번도 저장 성공한 적 없음 → 비교 기준 없음

        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return { applied: false };
        const remote = await resp.json();
        const theirsGd = window._deserializeGlobalDataForMerge(remote.globalData);
        if (!theirsGd) return { applied: false };

        window._ensureRowUids();
        const merge = window._threeWayMergeGlobalData(baselineMap, globalData, theirsGd);
        if (!merge.mergedGd) return { applied: false }; // 헤더 구조가 달라 병합 불가

        globalData = merge.mergedGd;

        merge.cellConflicts.forEach(function(cf) {
            const rowIdx = globalData.findIndex(function(r) { return r && r._rowUid === cf.uid; });
            logChange(rowIdx, cf.col, cf.theirs, cf.mine, '⚠️ 동시편집 충돌 — 내 값 유지 (상대방 값: ' + (cf.theirs === '' || cf.theirs == null ? '(빈값)' : cf.theirs) + ')');
        });
        merge.editVsDeleteConflicts.forEach(function(ec) {
            const rowIdx = globalData.findIndex(function(r) { return r && r._rowUid === ec.uid; });
            logChange(rowIdx, -1, '-', '-', ec.side === 'theirsDeleted'
                ? '⚠️ 상대방이 이 업무를 삭제했지만, 내가 수정한 내용이 있어 삭제하지 않고 보존함'
                : '⚠️ 내가 이 업무를 삭제했지만, 상대방이 수정한 내용이 있어 삭제를 취소하고 복원함');
        });

        window.recalculateSchedules();

        const parts = [];
        if (merge.addedByThem.length) parts.push(`다른 사용자가 추가한 업무 ${merge.addedByThem.length}건`);
        if (merge.deletedByThemHonored.length) parts.push(`다른 사용자가 삭제한 업무 ${merge.deletedByThemHonored.length}건`);
        if (merge.editVsDeleteConflicts.length) parts.push(`⚠️ 삭제/수정 충돌 ${merge.editVsDeleteConflicts.length}건(내용 보존)`);
        if (merge.cellConflicts.length) parts.push(`⚠️ 같은 칸 동시수정 충돌 ${merge.cellConflicts.length}건(내 값 유지, 변경이력에서 상대값 확인 가능)`);
        const summaryMsg = parts.length
            ? '🔀 다른 사용자의 변경사항과 자동 병합했습니다: ' + parts.join(' · ')
            : '🔀 다른 사용자의 변경사항과 자동 병합했습니다 (겹치는 수정 없음).';

        return { applied: true, summaryMsg: summaryMsg, merge: merge };
    } catch (err) {
        console.warn('3-way 병합 실패(기존 충돌 확인 모달로 대체):', err);
        return { applied: false };
    }
};

// 페이지 로드 시 뱃지 초기화
window.updateInboxBadge();

