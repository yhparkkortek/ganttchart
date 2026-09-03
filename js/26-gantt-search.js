/* ================================================================
   26-gantt-search.js
   간트 #키워드 / @프로젝트 검색 + AI 등록 업무 다중선택 + 일괄처리
   ================================================================
   · #키워드  → AI 매칭키워드·업무명·상세내용 안에서 검색
   · @프로젝트 → AI 매칭된 프로젝트명 검색
   · #ai      → AI 등록 업무 전체 표시
   · 검색 결과 행에 체크박스 표시 → 다중선택 → 일괄처리 툴바
   · window.ganttSearch.init() 은 renderGantt 후 호출됨
*/

(function() {
    'use strict';

    // ─── 상태 ──────────────────────────────────────────────────────────────────
    var _query  = '';          // 현재 검색어
    var _mode   = 'highlight'; // 'highlight' | 'filter' (filter=비매칭 숨기기)
    var _matchedIndices = [];  // 매칭된 globalData 인덱스 목록
    var _selected = new Set(); // 체크박스 선택된 인덱스 목록
    var _navIndex = -1;        // 현재 네비게이션 위치 (-1=미선택)
    var _debounceTimer = null; // 검색 debounce 타이머

    // ─── 검색바 삽입 (테이블 위 분리 렌더링 — 기본 숨김, AI검색 버튼으로 토글) ──

    // 현재 테마 색상 조회 (21-color-palette.js 의 _cpRoleHex / CP_CURRENT_TEAL 활용)
    function _getThemeColors() {
        var _cpHex = window._cpRoleHex || function(k) {
            return { bg: '#e0f5f7', hoverBg: '#a3d9e0', border: '#cfe3e5',
                     hoverBorder: '#52a5af', darkText: '#00707d' }[k];
        };
        var teal = window.CP_CURRENT_TEAL || {};
        return {
            barBg:       teal.headerTint || '#eef6f7',  // bgRoles 에 포함된 headerTint
            barBorder:   _cpHex('border')   || '#cfe3e5',
            inputBorder: _cpHex('hoverBg')  || '#a3d9e0',
            btnBg:       _cpHex('bg')        || '#e0f5f7',
            text:        _cpHex('darkText')  || '#00707d'
        };
    }

    // 검색바 + 내부 요소에 현재 테마 색 즉시 반영
    function _updateSearchBarColors() {
        var c = _getThemeColors();
        var bar = document.getElementById('gantt-ai-searchbar');
        if (!bar) return;
        bar.style.background = c.barBg;
        bar.style.borderBottomColor = c.barBorder;
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) { inp.style.borderColor = c.inputBorder; inp.style.color = c.text; }
        var lbl = bar.querySelector('span:first-child');
        if (lbl) lbl.style.color = c.text;
        var countEl = document.getElementById('gantt-ai-search-count');
        if (countEl) countEl.style.color = c.text;
        ['gantt-search-prev', 'gantt-search-next', 'gantt-ai-search-clear'].forEach(function(id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.style.background = c.btnBg;
            btn.style.borderColor = c.inputBorder;
            btn.style.color = c.text;
        });
        // accent-color(checkbox)도 테마 텍스트 색으로
        var fcb = document.getElementById('gantt-ai-search-filtermode');
        if (fcb) fcb.style.accentColor = c.text;
    }

    function _ensureSearchBar() {
        if (document.getElementById('gantt-ai-searchbar')) return;

        var container = document.getElementById('table-container');
        if (!container) return;

        var c = _getThemeColors(); // 생성 시점 테마 색

        var bar = document.createElement('div');
        bar.id = 'gantt-ai-searchbar';
        bar.style.cssText =
            'display:none;padding:6px 10px;background:' + c.barBg + ';border-bottom:1px solid ' + c.barBorder + ';' +
            'align-items:center;gap:7px;flex-wrap:wrap;font-size:13px;';
        bar.innerHTML =
            '<span style="color:' + c.text + ';font-weight:700;white-space:nowrap;font-size:12px;">🔍 검색</span>' +
            '<input id="gantt-ai-search-input" type="text"' +
            '  placeholder="이름·업무명·상세내용·메일스니펫  /  @프로젝트  /  #ai (AI 등록 전체)"' +
            '  style="flex:1;min-width:200px;padding:4px 10px;border-radius:6px;border:1px solid ' + c.inputBorder + ';' +
            '  font-size:13px;outline:none;background:#fff;color:' + c.text + ';">' +
            '<button id="gantt-search-prev" title="이전 결과 (Shift+Enter)"' +
            '  style="padding:3px 9px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:13px;cursor:pointer;color:' + c.text + ';">↑</button>' +
            '<button id="gantt-search-next" title="다음 결과 (Enter)"' +
            '  style="padding:3px 9px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:13px;cursor:pointer;color:' + c.text + ';">↓</button>' +
            '<span id="gantt-ai-search-count" style="color:' + c.text + ';font-size:12px;white-space:nowrap;min-width:62px;text-align:center;"></span>' +
            '<label style="white-space:nowrap;cursor:pointer;font-size:12px;color:#555;">' +
            '  <input type="checkbox" id="gantt-ai-search-filtermode" style="cursor:pointer;accent-color:' + c.text + ';"> 비매칭 숨기기</label>' +
            '<button id="gantt-ai-search-clear" title="검색 초기화 (Esc)"' +
            '  style="padding:4px 10px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:12px;cursor:pointer;color:' + c.text + ';">✕ 초기화</button>';

        container.insertBefore(bar, container.firstChild);

        var inp = document.getElementById('gantt-ai-search-input');
        inp.addEventListener('input', function() {
            _query = this.value.trim();
            _selected.clear();
            _navIndex = -1;
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(_applySearch, 150);
        });
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) _navGo(-1); else _navGo(1);
            }
        });
        document.getElementById('gantt-search-prev').addEventListener('click', function() { _navGo(-1); });
        document.getElementById('gantt-search-next').addEventListener('click', function() { _navGo(1); });
        document.getElementById('gantt-ai-search-filtermode').addEventListener('change', function() {
            _mode = this.checked ? 'filter' : 'highlight';
            _applySearch();
        });
        document.getElementById('gantt-ai-search-clear').addEventListener('click', _clearSearch);

        // 전역 단축키 Ctrl+Shift+F → 검색 포커스
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                _showSearchBar();
                var i = document.getElementById('gantt-ai-search-input');
                if (i) i.focus();
            }
            if (e.key === 'Escape' && _query) _clearSearch();
        });

        // 생성 직후 현재 테마 색 반영
        _updateSearchBarColors();

        // 테마 변경 시 검색바 색 실시간 갱신 (21-color-palette.js _cpApplyLive 훅 — 최초 1회)
        if (!window._ganttSearchColorHookAdded) {
            window._ganttSearchColorHookAdded = true;
            var _origApplyLive = window._cpApplyLive;
            window._cpApplyLive = function(hex, skipSave) {
                if (_origApplyLive) _origApplyLive.call(this, hex, skipSave);
                _updateSearchBarColors();
            };
        }
    }

    function _showSearchBar() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (bar) bar.style.display = 'flex';
    }

    function _hideSearchBar() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (bar) bar.style.display = 'none';
    }

    function _clearSearch() {
        _query = ''; _selected.clear(); _navIndex = -1;
        clearTimeout(_debounceTimer);
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) inp.value = '';
        var tbody = document.getElementById('table-body');
        if (tbody) tbody.querySelectorAll('tr.gantt-search-focus').forEach(function(r) { r.classList.remove('gantt-search-focus'); });
        _applySearch();
    }

    // ─── 검색 실행 ─────────────────────────────────────────────────────────────

    function _rowMatches(row, kw, isProject, isAiAll) {
        if (!row) return false;
        if (isAiAll) return !!row._aiRegistered;

        var kwL = kw.toLowerCase();

        if (isProject) {
            // @프로젝트명 검색 → AI 매칭 프로젝트명
            return (row._aiMatchedProjectName || '').toLowerCase().includes(kwL);
        }

        // ── 업무명 (WBS 각 레벨) ──
        var taskNames = [
            row._origDev || '', row._origT1 || '', row._origT2 || '',
            row._origT3  || '', row._origT4 || ''
        ].join(' ').toLowerCase();
        if (taskNames.includes(kwL)) return true;

        // ── 담당자 이름 (colIdx.assignee) ──
        if (typeof colIdx !== 'undefined' && colIdx.assignee !== -1) {
            var assigneeVal = row[colIdx.assignee];
            if (assigneeVal && String(assigneeVal).toLowerCase().includes(kwL)) return true;
        }

        // ── 업무 상세내용 (colIdx.content) — 메일 원문 스니펫 포함 ──
        if (typeof colIdx !== 'undefined' && colIdx.content !== -1) {
            var contentVal = row[colIdx.content];
            if (contentVal && String(contentVal).toLowerCase().includes(kwL)) return true;
        }

        // ── 모델명 (colIdx.model) ──
        if (typeof colIdx !== 'undefined' && colIdx.model !== -1) {
            var modelVal = row[colIdx.model];
            if (modelVal && String(modelVal).toLowerCase().includes(kwL)) return true;
        }

        // ── 고객사 (colIdx.customer) ──
        if (typeof colIdx !== 'undefined' && colIdx.customer !== -1) {
            var customerVal = row[colIdx.customer];
            if (customerVal && String(customerVal).toLowerCase().includes(kwL)) return true;
        }

        // ── 업무 상태 (colIdx.status) ──
        if (typeof colIdx !== 'undefined' && colIdx.status !== -1) {
            var statusVal = row[colIdx.status];
            if (statusVal && String(statusVal).toLowerCase().includes(kwL)) return true;
        }

        // ── AI 등록 업무 추가 필드 ──
        if (row._aiMatchKeywords && row._aiMatchKeywords.some(function(k) {
            return String(k).toLowerCase().includes(kwL);
        })) return true;
        if ((row._aiSourceSnippet || '').toLowerCase().includes(kwL)) return true;
        if ((row._aiMatchBasis   || '').toLowerCase().includes(kwL)) return true;

        return false;
    }

    function _applySearch() {
        _matchedIndices = [];
        var tbody = document.getElementById('table-body');
        if (!tbody) return;

        var raw = _query;
        var isProject = raw.startsWith('@');
        var isHash    = raw.startsWith('#');
        var isAiAll   = raw.toLowerCase() === '#ai';
        var kw = isProject ? raw.slice(1) : isHash ? raw.slice(1) : raw;
        var active = kw.length > 0;

        // 카운트
        var matchCount = 0;

        var rows = tbody.querySelectorAll('tr[data-row-index]');
        rows.forEach(function(tr) {
            var idx = parseInt(tr.getAttribute('data-row-index'), 10);
            var gRow = (typeof globalData !== 'undefined') ? globalData[idx] : null;
            var matches = !active || _rowMatches(gRow, kw, isProject, isAiAll);

            // 하이라이트/필터
            if (active) {
                if (matches) {
                    tr.classList.add('gantt-search-match');
                    tr.classList.remove('gantt-search-dim');
                    _matchedIndices.push(idx);
                    matchCount++;
                } else if (_mode === 'filter') {
                    tr.style.display = 'none';
                    tr.classList.remove('gantt-search-match');
                } else {
                    tr.classList.remove('gantt-search-match');
                    tr.classList.add('gantt-search-dim');
                }
            } else {
                tr.classList.remove('gantt-search-match', 'gantt-search-dim');
                tr.style.display = '';
                // 필터 모드 해제 시 행 다시 보이게
            }

            // 필터 해제 시 display 복원
            if (!active || matches) tr.style.display = '';

            // 체크박스
            _updateRowCheckbox(tr, idx, matches && active);
        });

        // 카운트 표시 (네비게이션 위치 포함)
        _navIndex = Math.min(_navIndex, _matchedIndices.length - 1);
        _updateNavCount(matchCount);

        // 일괄처리 툴바 업데이트
        _updateBulkBar(active);

        // 검색바 표시
        if (active) _showSearchBar();
    }

    // ─── 네비게이션 ────────────────────────────────────────────────────────────

    function _navGo(delta) {
        if (!_matchedIndices.length) return;
        _navIndex = (_navIndex + delta + _matchedIndices.length) % _matchedIndices.length;
        _scrollToMatch(_navIndex);
        _updateNavCount(_matchedIndices.length);
    }

    function _scrollToMatch(n) {
        var idx = _matchedIndices[n];
        var tbody = document.getElementById('table-body');
        if (!tbody) return;
        var tr = tbody.querySelector('tr[data-row-index="' + idx + '"]');
        if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 현재 위치 행 강조 (focus ring 교체)
        tbody.querySelectorAll('tr.gantt-search-focus').forEach(function(r) { r.classList.remove('gantt-search-focus'); });
        if (tr) tr.classList.add('gantt-search-focus');
    }

    function _updateNavCount(total) {
        var countEl = document.getElementById('gantt-ai-search-count');
        if (!countEl) return;
        if (!total && total !== 0) total = _matchedIndices.length;
        if (total === 0) { countEl.textContent = ''; return; }
        var cur = _navIndex >= 0 ? (_navIndex + 1) + '/' : '';
        countEl.textContent = '매칭 ' + cur + total + '건';
    }

    // ─── 행별 체크박스 ──────────────────────────────────────────────────────────

    function _updateRowCheckbox(tr, idx, show) {
        var firstTd = tr.querySelector('td:first-child');
        if (!firstTd) return;

        var cb = tr.querySelector('.gantt-ai-cb');
        if (show) {
            if (!cb) {
                cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'gantt-ai-cb';
                cb.style.cssText =
                    'position:absolute;left:2px;top:50%;transform:translateY(-50%);' +
                    'width:14px;height:14px;cursor:pointer;z-index:2;accent-color:#d63384;';
                cb.addEventListener('change', function() {
                    if (this.checked) _selected.add(idx);
                    else _selected.delete(idx);
                    _updateBulkBar(true);
                });
                firstTd.style.position = 'relative';
                firstTd.insertBefore(cb, firstTd.firstChild);
            }
            cb.checked = _selected.has(idx);
            cb.style.display = '';
        } else if (cb) {
            cb.style.display = 'none';
            _selected.delete(idx);
        }
    }

    // ─── 일괄처리 툴바 ─────────────────────────────────────────────────────────

    function _ensureBulkBar() {
        if (document.getElementById('gantt-ai-bulk-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'gantt-ai-bulk-bar';
        bar.style.cssText =
            'display:none;position:sticky;top:0;z-index:1200;background:#2d2d2d;color:#fff;' +
            'padding:8px 14px;display:none;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;';
        bar.innerHTML =
            '<span id="gantt-ai-bulk-count" style="font-weight:700;white-space:nowrap;"></span>' +
            '<button id="gantt-ai-bulk-selall"' +
            '  style="padding:5px 12px;background:#555;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;">전체 선택</button>' +
            '<button id="gantt-ai-bulk-dellearn"' +
            '  style="padding:5px 14px;background:#d63384;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">📚 오매칭 삭제+학습</button>' +
            '<button id="gantt-ai-bulk-del"' +
            '  style="padding:5px 14px;background:#dc3545;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🗑️ 일괄 삭제</button>' +
            '<button id="gantt-ai-bulk-untag"' +
            '  style="padding:5px 14px;background:#6c757d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🏷️ AI 태그 해제</button>' +
            '<button id="gantt-ai-bulk-cancel"' +
            '  style="padding:5px 10px;background:#444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;">취소</button>';

        var container = document.getElementById('table-container');
        if (container) container.insertBefore(bar, container.firstChild);

        document.getElementById('gantt-ai-bulk-selall').addEventListener('click', function() {
            _selected.clear();
            _matchedIndices.forEach(function(i) { _selected.add(i); });
            var tbody = document.getElementById('table-body');
            if (tbody) tbody.querySelectorAll('.gantt-ai-cb').forEach(function(cb) {
                var idx = parseInt(cb.closest('tr').getAttribute('data-row-index'), 10);
                cb.checked = _matchedIndices.includes(idx);
            });
            _updateBulkBar(true);
        });

        document.getElementById('gantt-ai-bulk-cancel').addEventListener('click', function() {
            _selected.clear();
            _updateBulkBar(_query.length > 0);
        });

        document.getElementById('gantt-ai-bulk-del').addEventListener('click', function() {
            if (!_selected.size) return;
            if (!confirm('선택한 ' + _selected.size + '건을 삭제하시겠습니까?\n(학습 기록 없이 즉시 삭제됩니다)')) return;
            _batchDelete(false);
        });

        document.getElementById('gantt-ai-bulk-dellearn').addEventListener('click', function() {
            if (!_selected.size) return;
            var aiSelected = Array.from(_selected).filter(function(i) {
                return globalData[i] && globalData[i]._aiRegistered;
            });
            if (!aiSelected.length) {
                alert('선택한 업무 중 AI 등록 업무가 없습니다.\n일반 "일괄 삭제"를 이용하세요.');
                return;
            }
            _batchDelete(true);
        });

        document.getElementById('gantt-ai-bulk-untag').addEventListener('click', function() {
            if (!_selected.size) return;
            var idxs = Array.from(_selected).filter(function(i) {
                return globalData[i] && globalData[i]._aiRegistered;
            });
            if (!idxs.length) { alert('AI 등록 업무가 선택되지 않았습니다.'); return; }
            idxs.forEach(function(i) {
                var row = globalData[i];
                if (!row) return;
                // AI 태그(＊AI📧) 제거 + 메타 지우기
                ['_origDev','_origT1','_origT2','_origT3','_origT4'].forEach(function(k) {
                    if (row[k]) row[k] = row[k].replace(/\s*＊AI📧\s*$/, '').trim();
                });
                row._aiRegistered = false;
            });
            _selected.clear();
            _clearSearch();
            window.recalculateSchedules();
            window._showAiToast && window._showAiToast('🏷️ AI 태그 ' + idxs.length + '건 해제됨');
        });
    }

    function _updateBulkBar(searchActive) {
        _ensureBulkBar();
        var bar = document.getElementById('gantt-ai-bulk-bar');
        if (!bar) return;
        var countEl = document.getElementById('gantt-ai-bulk-count');

        if (searchActive && _selected.size > 0) {
            bar.style.display = 'flex';
            if (countEl) countEl.textContent = _selected.size + '건 선택됨';
        } else {
            bar.style.display = 'none';
        }
    }

    // ─── 일괄 삭제 ─────────────────────────────────────────────────────────────

    function _batchDelete(withLearning) {
        var idxs = Array.from(_selected).sort(function(a,b) { return b - a; }); // 내림차순
        var learned = 0;

        idxs.forEach(function(idx) {
            var row = globalData[idx];
            if (!row) return;
            var l = row._level;
            var taskName = (l===0?row._origDev:l===1?row._origT1:l===2?row._origT2:l===3?row._origT3:row._origT4) || '업무';

            if (withLearning && row._aiRegistered) {
                var projectKey = window.currentDriveFileName || window.currentDriveFileId || '__unknown__';
                if (window._writeLearningEntry) {
                    window._writeLearningEntry(projectKey, {
                        type: 'negative_match',
                        reason: '일괄오매칭삭제',
                        taskName: taskName,
                        confidence: row._aiConfidence || '',
                        matchedProjectId: row._aiMatchedProjectId || '',
                        matchedProjectName: row._aiMatchedProjectName || projectKey,
                        matchBasis: row._aiMatchBasis || '',
                        matchKeywords: row._aiMatchKeywords || [],
                        sourceSnippet: row._aiSourceSnippet || '',
                        registeredAt: row._aiRegisteredAt || ''
                    });
                }
                learned++;
            }

            globalData.splice(idx, 1);
            window.changeLogs && window.changeLogs.push({
                time: new Date().toLocaleString('ko-KR'),
                userName: window.currentUserName || '비로그인',
                rowName: idx, colName: '행 조작',
                oldVal: taskName, newVal: '일괄삭제' + (withLearning ? '(AI학습)' : '')
            });
        });

        _selected.clear();
        _clearSearch();
        window.recalculateSchedules();

        var msg = idxs.length + '건 삭제됨';
        if (withLearning && learned) msg += ' / ' + learned + '건 학습 기록';
        window._showAiToast && window._showAiToast('🗑️ ' + msg);
    }

    // ─── CSS 주입 ──────────────────────────────────────────────────────────────

    function _injectCss() {
        if (document.getElementById('gantt-ai-search-css')) return;
        var s = document.createElement('style');
        s.id = 'gantt-ai-search-css';
        s.textContent =
            'tr.gantt-search-match { outline: 2px solid #00b4c6; outline-offset: -1px; background: #eaf8f9 !important; }' +
            'tr.gantt-search-focus { outline: 3px solid #00707d !important; outline-offset: -2px; background: #d0f2f5 !important; }' +
            'tr.gantt-search-dim   { opacity: 0.25; pointer-events: none; }' +
            '#gantt-ai-searchbar   { border-radius: 0; }' +
            '#gantt-ai-search-input:focus { border-color: #00707d !important; box-shadow: 0 0 0 2px rgba(0,112,125,.15); }' +
            '#gantt-ai-bulk-bar button:hover { filter: brightness(1.15); }' +
            '#gantt-search-prev:hover, #gantt-search-next:hover { background: #a3d9e0 !important; }';
        document.head.appendChild(s);
    }

    // ─── 공개 API ──────────────────────────────────────────────────────────────

    /**
     * renderGantt 완료 후 또는 Gantt 탭 전환 시 호출.
     * 검색바·스타일 초기화 후 기존 쿼리가 있으면 다시 적용.
     */
    window.ganttSearchInit = function() {
        _injectCss();
        _ensureSearchBar();
        _ensureBulkBar();
        if (_query) _applySearch(); // 재렌더 후 재적용
    };

    /**
     * 외부에서 #keyword 검색을 프로그래밍으로 실행.
     * @param {string} q  예: "#EC이슈"  "@J55"  "#ai"
     */
    window.ganttSearchQuery = function(q) {
        _ensureSearchBar();
        _showSearchBar();
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) { inp.value = q; inp.focus(); }
        _query = q;
        _navIndex = -1;
        _applySearch();
    };

    /**
     * AI검색 버튼 클릭 — 테이블 위 검색바 표시/숨김 토글.
     * 처음 열릴 때 이벤트 리스너 초기화 + 포커스.
     * 닫을 때 검색 초기화.
     */
    window.ganttAiSearchToggle = function() {
        _ensureSearchBar(); // DOM 삽입 + 이벤트 연결 (최초 1회)
        var bar = document.getElementById('gantt-ai-searchbar');
        if (!bar) return;
        var isVisible = bar.style.display === 'flex';
        if (isVisible) {
            _clearSearch();
            _hideSearchBar();
        } else {
            _showSearchBar();
            var inp = document.getElementById('gantt-ai-search-input');
            if (inp) { inp.focus(); inp.select(); }
        }
    };

    // MutationObserver: table-body가 재렌더링될 때마다 검색 재적용
    var _observer = null;
    window.ganttSearchObserve = function() {
        if (_observer) return;
        var tbody = document.getElementById('table-body');
        if (!tbody) return;
        _observer = new MutationObserver(function() {
            if (_query) {
                // 재렌더 직후이므로 체크박스 재생성 필요
                _selected.clear();
                _applySearch();
            }
        });
        _observer.observe(tbody, { childList: true });
    };

})();
