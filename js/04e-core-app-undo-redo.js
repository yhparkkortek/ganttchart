// [분리됨] 원본: js/04-core-app.js 의 3409~4467행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: Undo / Redo
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

        // 🔧 연속 이동 감지 debounce (moveRow와 동일한 로직 — _lastRowMoveTime 공유)
        const _now2 = Date.now();
        const _isRapid2 = window._lastRowMoveTime && (_now2 - window._lastRowMoveTime < 500);
        window._lastRowMoveTime = _now2;
        if (_isRapid2) {
            window._rowMoving = true;
            clearTimeout(window._rowMoveToastTimer);
            window._rowMoveToastTimer = setTimeout(function() {
                window._rowMoving = false;
                if (window.showToast) window.showToast(window._currentLang === 'en' ? "✅ Schedule updated." : "✅ 일정이 업데이트 되었습니다.");
            }, 500);
        } else {
            window._rowMoving = false;
            clearTimeout(window._rowMoveToastTimer);
            window._rowMoveToastTimer = null;
        }

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

