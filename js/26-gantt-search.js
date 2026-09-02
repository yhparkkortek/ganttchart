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

    // ─── 검색바 삽입 ───────────────────────────────────────────────────────────

    function _ensureSearchBar() {
        if (document.getElementById('gantt-ai-searchbar')) return;

        var container = document.getElementById('table-container');
        if (!container) return;

        var bar = document.createElement('div');
        bar.id = 'gantt-ai-searchbar';
        bar.style.cssText =
            'display:none;padding:6px 10px;background:#f0f4ff;border-bottom:1px solid #c5d4f0;' +
            'display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;';
        bar.innerHTML =
            '<span style="color:#4a6cf7;font-weight:700;white-space:nowrap;">🔍 AI검색</span>' +
            '<input id="gantt-ai-search-input" type="text" placeholder="#키워드   @프로젝트   #ai (AI 등록 전체)"' +
            '  style="flex:1;min-width:180px;padding:5px 10px;border-radius:6px;border:1px solid #b8c8f0;' +
            '  font-size:13px;outline:none;">' +
            '<label style="white-space:nowrap;cursor:pointer;font-size:12px;">' +
            '  <input type="checkbox" id="gantt-ai-search-filtermode" style="cursor:pointer;"> 비매칭 숨기기</label>' +
            '<button id="gantt-ai-search-clear" title="검색 초기화"' +
            '  style="padding:4px 10px;background:#dee2e6;border:none;border-radius:5px;font-size:12px;cursor:pointer;">✕ 초기화</button>' +
            '<span id="gantt-ai-search-count" style="color:#666;font-size:12px;white-space:nowrap;"></span>';

        container.insertBefore(bar, container.firstChild);

        document.getElementById('gantt-ai-search-input').addEventListener('input', function() {
            _query = this.value.trim();
            _selected.clear();
            _applySearch();
        });
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
                var inp = document.getElementById('gantt-ai-search-input');
                if (inp) inp.focus();
            }
            if (e.key === 'Escape' && _query) _clearSearch();
        });
    }

    function _showSearchBar() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (bar) bar.style.display = 'flex';
    }

    function _clearSearch() {
        _query = ''; _selected.clear();
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) inp.value = '';
        _applySearch();
    }

    // ─── 검색 실행 ─────────────────────────────────────────────────────────────

    function _rowMatches(row, kw, isProject, isAiAll) {
        if (!row) return false;
        if (isAiAll) return !!row._aiRegistered;

        var haystack = [
            row._origDev  || '', row._origT1 || '', row._origT2 || '',
            row._origT3   || '', row._origT4 || ''
        ].join(' ').toLowerCase();

        if (isProject) {
            // @프로젝트명 검색 → AI 매칭 프로젝트명에서
            var pName = (row._aiMatchedProjectName || '').toLowerCase();
            return pName.includes(kw.toLowerCase());
        }

        // #키워드 → 업무명 + AI 키워드 + 상세내용 + 매칭근거
        if (haystack.includes(kw.toLowerCase())) return true;
        if (row._aiMatchKeywords && row._aiMatchKeywords.some(function(k) {
            return String(k).toLowerCase().includes(kw.toLowerCase());
        })) return true;
        var src = (row._aiSourceSnippet || '').toLowerCase();
        if (src.includes(kw.toLowerCase())) return true;
        var basis = (row._aiMatchBasis || '').toLowerCase();
        if (basis.includes(kw.toLowerCase())) return true;
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

        // 카운트 표시
        var countEl = document.getElementById('gantt-ai-search-count');
        if (countEl) {
            countEl.textContent = active ? '매칭 ' + matchCount + '건' : '';
        }

        // 일괄처리 툴바 업데이트
        _updateBulkBar(active);

        // 검색바 표시
        if (active) _showSearchBar();
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
            'tr.gantt-search-match { outline: 2px solid #4a6cf7; outline-offset: -1px; background: #eef3ff !important; }' +
            'tr.gantt-search-dim   { opacity: 0.28; pointer-events: none; }' +
            '#gantt-ai-searchbar   { border-radius: 0; }' +
            '#gantt-ai-bulk-bar button:hover { filter: brightness(1.15); }';
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
        _showSearchBar();
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) inp.value = q;
        _query = q;
        _applySearch();
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
