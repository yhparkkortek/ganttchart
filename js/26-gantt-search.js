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
    var _lastAutoNavQuery = ''; // 자동 이동 마지막 적용 쿼리

    // ── 셀 키보드 포커스 ──────────────────────────────────────────────────────
    var _kbCell = null;       // { tr: HTMLElement, tdIdx: number } 현재 포커스 셀
    var _cellNavSetup = false; // 전역 핸들러 중복 등록 방지

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

        // 🐛 [2026-09-11 버그 수정] 이 검색바는 최초 열 때 한 번만 DOM에 삽입되는데, 라벨/placeholder/
        //    title/버튼 문구가 전부 한글로 하드코딩돼 있어 영문 모드에서도 그대로 한글로 보였다.
        //    생성 시점의 window._currentLang을 그대로 반영해 만듦.
        //    🐛 [2026-09-12 추가수정] "이미 열려있는 채로 토글하면 안 바뀐다"는 그때 남겨둔 한계가
        //    실제로 재현 리포트로 들어와서, 아래 window._gsRefreshLang()을 추가하고 toggleLang()
        //    (js/04j-core-app-upload-utils-5.js)에서 호출하도록 연결함 — 이제 실시간 반영됨.
        var _en = window._currentLang === 'en';
        var bar = document.createElement('div');
        bar.id = 'gantt-ai-searchbar';
        bar.style.cssText =
            'display:none;padding:6px 10px;background:' + c.barBg + ';border-bottom:1px solid ' + c.barBorder + ';' +
            'align-items:center;gap:7px;flex-wrap:wrap;font-size:13px;';
        bar.innerHTML =
            '<span style="color:' + c.text + ';font-weight:700;white-space:nowrap;font-size:12px;">🔍 ' + (_en ? 'Search' : '검색') + '</span>' +
            '<input id="gantt-ai-search-input" type="text"' +
            '  placeholder="' + (_en
                ? 'Name·task·content·mail snippet  /  @project  /  #ai (all AI-registered)'
                : '이름·업무명·상세내용·메일스니펫  /  @프로젝트  /  #ai (AI 등록 전체)') + '"' +
            '  style="flex:1;min-width:200px;padding:4px 10px;border-radius:6px;border:1px solid ' + c.inputBorder + ';' +
            '  font-size:13px;outline:none;background:#fff;color:' + c.text + ';">' +
            '<button id="gantt-search-prev" title="' + (_en ? 'Previous result (Shift+Enter)' : '이전 결과 (Shift+Enter)') + '"' +
            '  style="padding:3px 9px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:13px;cursor:pointer;color:' + c.text + ';">↑</button>' +
            '<button id="gantt-search-next" title="' + (_en ? 'Next result (Enter)' : '다음 결과 (Enter)') + '"' +
            '  style="padding:3px 9px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:13px;cursor:pointer;color:' + c.text + ';">↓</button>' +
            '<span id="gantt-ai-search-count" style="color:' + c.text + ';font-size:12px;white-space:nowrap;min-width:62px;text-align:center;"></span>' +
            '<label style="white-space:nowrap;cursor:pointer;font-size:12px;color:#555;">' +
            '  <input type="checkbox" id="gantt-ai-search-filtermode" style="cursor:pointer;accent-color:' + c.text + ';"> ' +
            '<span id="gantt-ai-search-filtermode-label">' + (_en ? 'Hide non-matching' : '비매칭 숨기기') + '</span></label>' +
            '<button id="gantt-ai-search-clear" title="' + (_en ? 'Clear search (Esc)' : '검색 초기화 (Esc)') + '"' +
            '  style="padding:4px 10px;background:' + c.btnBg + ';border:1px solid ' + c.inputBorder + ';border-radius:5px;font-size:12px;cursor:pointer;color:' + c.text + ';">✕ ' + (_en ? 'Clear' : '초기화') + '</button>';

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
            // 검색창 포커스 상태에서도 ↑/↓로 결과 이동 — 전역 핸들러와 중복 방지를 위해
            // 전역 핸들러가 isSearchInput 분기로 처리하므로 여기선 따로 처리하지 않음
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

    // 💡 [2026-09-12 신규] 검색바가 이미 열려 있는 상태로 언어를 토글해도 문구가 즉시 바뀌도록 —
    // toggleLang()(js/04j-core-app-upload-utils-5.js)에서 호출됨. 검색바가 아직 안 만들어졌으면
    // 아무것도 안 함(다음에 처음 열릴 때 그 시점 언어로 정상 생성됨).
    window._gsRefreshLang = function() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (!bar) return;
        var _en = window._currentLang === 'en';
        var lbl = bar.querySelector('span:first-child');
        if (lbl) lbl.textContent = '🔍 ' + (_en ? 'Search' : '검색');
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) inp.placeholder = _en
            ? 'Name·task·content·mail snippet  /  @project  /  #ai (all AI-registered)'
            : '이름·업무명·상세내용·메일스니펫  /  @프로젝트  /  #ai (AI 등록 전체)';
        var prevBtn = document.getElementById('gantt-search-prev');
        if (prevBtn) prevBtn.title = _en ? 'Previous result (Shift+Enter)' : '이전 결과 (Shift+Enter)';
        var nextBtn = document.getElementById('gantt-search-next');
        if (nextBtn) nextBtn.title = _en ? 'Next result (Enter)' : '다음 결과 (Enter)';
        var fmLabel = document.getElementById('gantt-ai-search-filtermode-label');
        if (fmLabel) fmLabel.textContent = _en ? 'Hide non-matching' : '비매칭 숨기기';
        var clearBtn = document.getElementById('gantt-ai-search-clear');
        if (clearBtn) {
            clearBtn.title = _en ? 'Clear search (Esc)' : '검색 초기화 (Esc)';
            clearBtn.textContent = '✕ ' + (_en ? 'Clear' : '초기화');
        }
    };

    function _showSearchBar() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (bar) bar.style.display = 'flex';
    }

    function _hideSearchBar() {
        var bar = document.getElementById('gantt-ai-searchbar');
        if (bar) bar.style.display = 'none';
    }

    // ─── 텍스트 하이라이트 헬퍼 ───────────────────────────────────────────────────

    // 텍스트 노드를 재귀 탐색해 매칭 문자열을 <mark> 로 래핑 (innerHTML 미사용 → 이벤트 핸들러 보존)
    var _HL_SKIP_TAGS = { MARK:1, SCRIPT:1, STYLE:1, BUTTON:1, INPUT:1, SELECT:1, TEXTAREA:1, SVG:1 };
    function _wrapTextNodes(node, regex) {
        if (node.nodeType === 3) { // Text node
            regex.lastIndex = 0;
            if (!regex.test(node.textContent)) return;
            regex.lastIndex = 0;
            var text = node.textContent;
            var frag = document.createDocumentFragment();
            var last = 0; var m;
            while ((m = regex.exec(text)) !== null) {
                if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                var mark = document.createElement('mark');
                mark.className = 'gantt-search-hl';
                mark.textContent = m[0];
                frag.appendChild(mark);
                last = regex.lastIndex;
                if (m[0].length === 0) { regex.lastIndex++; break; }
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
        } else if (node.nodeType === 1 && !_HL_SKIP_TAGS[node.tagName]) {
            Array.from(node.childNodes).forEach(function(c) { _wrapTextNodes(c, regex); });
        }
    }

    // 매칭 행에 텍스트 하이라이트 삽입 (td 단위)
    function _highlightTextInRow(tr, kw) {
        if (!kw) return;
        var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp(escaped, 'gi');
        tr.querySelectorAll('td').forEach(function(td) {
            if (!td.hasAttribute('data-hl-done')) {
                td.setAttribute('data-hl-done', '1');
                _wrapTextNodes(td, regex);
            }
        });
    }

    // 모든 텍스트 하이라이트 제거 (<mark> 제거 + 텍스트노드 병합)
    function _clearAllHighlights() {
        var tbody = document.getElementById('table-body');
        if (!tbody) return;
        tbody.querySelectorAll('mark.gantt-search-hl').forEach(function(m) {
            var p = m.parentNode; if (!p) return;
            p.replaceChild(document.createTextNode(m.textContent), m);
            p.normalize();
        });
        tbody.querySelectorAll('td[data-hl-done]').forEach(function(td) {
            td.removeAttribute('data-hl-done');
        });
    }

    // ─── 오늘 날짜 기준 네비게이션 위치 계산 ────────────────────────────────────────
    // ↓(미래) / ↑(과거) 방향으로 화살표가 작동하도록 오름차순 정렬 기준으로 가장 가까운 결과 선택
    function _findTodayNavIndex() {
        if (!_matchedIndices.length) return 0;
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var todayMs = today.getTime();
        var bestPos = 0;
        var bestScore = Infinity;
        _matchedIndices.forEach(function(gIdx, arrPos) {
            var row = (typeof globalData !== 'undefined') ? globalData[gIdx] : null;
            if (!row) return;
            var raw = (typeof colIdx !== 'undefined' && colIdx.start !== -1) ? row[colIdx.start] : null;
            if (!raw) return;
            var d = new Date(raw); if (isNaN(d.getTime())) return;
            var diff = d.getTime() - todayMs;
            // 미래(diff≥0)를 과거보다 우선; 같은 방향이면 절대값 작은 것
            var score = diff >= 0 ? diff : (Math.abs(diff) + 365 * 24 * 3600 * 1000);
            if (score < bestScore) { bestScore = score; bestPos = arrPos; }
        });
        return bestPos;
    }

    function _clearSearch() {
        _query = ''; _selected.clear(); _navIndex = -1; _lastAutoNavQuery = '';
        clearTimeout(_debounceTimer);
        var inp = document.getElementById('gantt-ai-search-input');
        if (inp) inp.value = '';
        var tbody = document.getElementById('table-body');
        if (tbody) tbody.querySelectorAll('tr.gantt-search-focus').forEach(function(r) { r.classList.remove('gantt-search-focus'); });
        _clearAllHighlights();
        _applySearch();
    }

    // ─── 검색 실행 ─────────────────────────────────────────────────────────────

    // 알람 동의어 패턴 — 이 키워드로 검색하면 텍스트 매칭 대신 row._알림===true 인 행만 표시
    var _alarmWords = /^(알람|알림|핀셋알람|핀셋알림|핀셋|마감알람|마감알림|alarm|reminder|notification)$/i;

    function _rowMatches(row, kw, isProject, isAiAll, isAlarm) {
        if (!row) return false;
        if (isAiAll)  return !!row._aiRegistered;
        if (isAlarm)  return !!row._알림;

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
        var isAlarm   = !isProject && !isHash && _alarmWords.test(raw.trim());
        var kw = isProject ? raw.slice(1) : isHash ? raw.slice(1) : raw;
        var active = kw.length > 0;

        // 검색어가 바뀌면 기존 하이라이트 전체 제거
        var queryChanged = _query !== _lastAutoNavQuery;
        if (queryChanged) _clearAllHighlights();

        var matchCount = 0;

        var rows = tbody.querySelectorAll('tr[data-row-index]');
        rows.forEach(function(tr) {
            var idx = parseInt(tr.getAttribute('data-row-index'), 10);
            var gRow = (typeof globalData !== 'undefined') ? globalData[idx] : null;
            var matches = !active || _rowMatches(gRow, kw, isProject, isAiAll, isAlarm);

            // 하이라이트/필터
            if (active) {
                if (matches) {
                    tr.classList.add('gantt-search-match');
                    tr.classList.remove('gantt-search-dim');
                    _matchedIndices.push(idx);
                    matchCount++;
                    // ── 텍스트 하이라이트 (행 테두리 대신) ──
                    if (!isAiAll && !isAlarm) _highlightTextInRow(tr, kw);
                } else if (_mode === 'filter') {
                    tr.style.display = 'none';
                    tr.classList.remove('gantt-search-match');
                } else {
                    tr.classList.remove('gantt-search-match');
                    tr.classList.add('gantt-search-dim');
                    tr.style.display = ''; // 🐛 filter→highlight 전환 시 숨겨진 행 복원
                }
            } else {
                tr.classList.remove('gantt-search-match', 'gantt-search-dim');
                tr.style.display = '';
            }

            // 매칭 행은 항상 보이게
            if (!active || matches) tr.style.display = '';

            // 체크박스
            _updateRowCheckbox(tr, idx, matches && active);
        });

        // 네비게이션: 검색어가 바뀌면 오늘 날짜 가장 가까운 위치로 자동 이동
        if (active && _matchedIndices.length && queryChanged) {
            _lastAutoNavQuery = _query;
            _navIndex = _findTodayNavIndex();
            _scrollToMatch(_navIndex);
        } else {
            _navIndex = Math.min(_navIndex, _matchedIndices.length - 1);
        }
        _updateNavCount(matchCount);

        // 일괄처리 툴바 업데이트
        _updateBulkBar(active);

        // 검색바 표시
        if (active) _showSearchBar();

        // 🐛 [2026-09-13 버그수정] 검색이 tr.style.display를 직접 바꾸지만 applyFilters()를
        //    호출하지 않아서 .row-num-span 번호가 갱신되지 않는 버그 → 검색 후 보이는 행만
        //    순서대로 번호를 다시 매긴다(applyFilters 전체 재호출보다 가볍고 충돌 없음).
        _gsRenumberRows();
    }

    // 현재 화면에 보이는 행만 순서대로 No. 번호 재할당
    function _gsRenumberRows() {
        var tbody = document.querySelector('#gantt-table tbody');
        if (!tbody) return;
        var n = 1;
        tbody.querySelectorAll('tr[data-row-index]').forEach(function(tr) {
            if (tr.style.display === 'none') return;
            var noTd = tr.querySelector('.no-td');
            if (!noTd) return;
            var span = noTd.querySelector('.row-num-span');
            if (span) span.textContent = n++;
        });
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
            'display:none;position:sticky;top:0;z-index:1200;' +
            'background:#3a5561;border-bottom:2px solid #2a4250;' +  // 어두운 파스텔 틸
            'padding:7px 14px;align-items:center;gap:9px;flex-wrap:wrap;font-size:13px;';
        bar.innerHTML =
            '<span id="gantt-ai-bulk-count" style="font-weight:700;white-space:nowrap;color:#e8f4f6;"></span>' +
            '<button id="gantt-ai-bulk-selall"' +  // 🔵 Blue 파스텔
            '  style="padding:4px 12px;background:#b8d4f8;color:#1a3a6e;border:1px solid #8ab4e8;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;">전체 선택</button>' +
            '<button id="gantt-ai-bulk-dellearn"' +  // 🟠 Orange 파스텔
            '  style="padding:4px 13px;background:#fde8c0;color:#7a3e00;border:1px solid #f5c070;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">📚 오매칭 삭제+학습</button>' +
            '<button id="gantt-ai-bulk-del"' +  // 🔴 Red 파스텔
            '  style="padding:4px 13px;background:#fccfcf;color:#8b1a2a;border:1px solid #f09090;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">🗑️ 일괄 삭제</button>' +
            '<button id="gantt-ai-bulk-untag"' +  // 🟢 Green 파스텔
            '  style="padding:4px 13px;background:#c8f0d5;color:#1a5a2a;border:1px solid #88d4a0;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">🏷️ AI 태그 해제</button>' +
            '<button id="gantt-ai-bulk-cancel"' +
            '  style="padding:4px 10px;background:#6a8a96;color:#e8f4f6;border:1px solid #4a6878;border-radius:5px;cursor:pointer;font-size:12px;">취소</button>';

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
            if (!confirm(window._t('선택한 ' + _selected.size + '건을 삭제하시겠습니까?\n(학습 기록 없이 즉시 삭제됩니다)', 'Delete the selected ' + _selected.size + ' item(s)?\n(Deleted immediately, without a learning record)'))) return;
            _batchDelete(false);
        });

        document.getElementById('gantt-ai-bulk-dellearn').addEventListener('click', function() {
            if (!_selected.size) return;
            var aiSelected = Array.from(_selected).filter(function(i) {
                return globalData[i] && globalData[i]._aiRegistered;
            });
            if (!aiSelected.length) {
                alert(window._t('선택한 업무 중 AI 등록 업무가 없습니다.\n일반 "일괄 삭제"를 이용하세요.', 'None of the selected tasks were AI-registered.\nPlease use the regular "Batch Delete" instead.'));
                return;
            }
            _batchDelete(true);
        });

        document.getElementById('gantt-ai-bulk-untag').addEventListener('click', function() {
            if (!_selected.size) return;
            var idxs = Array.from(_selected).filter(function(i) {
                return globalData[i] && globalData[i]._aiRegistered;
            });
            if (!idxs.length) { alert(window._t('AI 등록 업무가 선택되지 않았습니다.', 'No AI-registered tasks were selected.')); return; }
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
                // 💡 [버그 수정 2026-09-06] fileId 우선으로 통일 — 25-ai-learning.js 상단 주석 참고.
                var projectKey = window.currentDriveFileId || window.currentDriveFileName || '__unknown__';
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

    // ─── 셀 키보드 포커스 & 네비게이션 ──────────────────────────────────────────
    // 💡 [2026-09-13 신규] Gantt 셀 클릭 시 포커스 추적 → 화살표·Enter 키보드 조작
    //
    // 셀 타입별 Enter 동작:
    //   WBS 업무명   → onRowNoClick (행 액션 메뉴)
    //   기간·날짜 등  → makeEditable (텍스트 직접 편집)
    //   상태(Status) → <select> 포커스
    //   상세내용     → toggleDetailExpand (펼치기/접기)
    //   No.·차트열   → 없음 (스킵)

    /** 편집 중(contenteditable·input·textarea·select 포커스)인지 확인 */
    function _isEditingAnywhere() {
        var a = document.activeElement;
        if (!a) return false;
        if (a.isContentEditable) return true;
        var t = a.tagName;
        return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
    }

    /** No.열·차트열처럼 키보드 스킵 대상 td인지 */
    function _isSkipCell(td) {
        if (!td) return true;
        if (td.classList.contains('no-td')) return true;
        if (td.querySelector('canvas')) return true;   // 차트 셀
        return false;
    }

    /** 키보드 포커스 해제 */
    function _clearKbFocus() {
        if (!_kbCell) return;
        var tds = _kbCell.tr.querySelectorAll('td');
        if (tds[_kbCell.tdIdx]) tds[_kbCell.tdIdx].classList.remove('gantt-kb-active');
        _kbCell.tr.classList.remove('gantt-kb-row');
        _kbCell = null;
    }

    /** tdIdx 위치에 키보드 포커스 이동 */
    function _setKbFocus(tr, tdIdx) {
        _clearKbFocus();
        if (!tr) return;
        var tds = tr.querySelectorAll('td');
        if (tdIdx < 0 || tdIdx >= tds.length) return;
        _kbCell = { tr: tr, tdIdx: tdIdx };
        tds[tdIdx].classList.add('gantt-kb-active');
        tr.classList.add('gantt-kb-row');
        tds[tdIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /** 같은 열에서 위/아래 visible 행으로 이동 */
    function _kbMoveRow(delta) {
        var tbody = document.getElementById('table-body');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr[data-row-index]')).filter(function(tr) {
            return tr.style.display !== 'none';
        });
        var currIdx = _kbCell ? rows.indexOf(_kbCell.tr) : -1;
        var newIdx = currIdx + delta;
        if (newIdx < 0 || newIdx >= rows.length) return;
        _setKbFocus(rows[newIdx], _kbCell ? _kbCell.tdIdx : 1);
    }

    /** 같은 행에서 좌/우 열로 이동 (No.·차트열 자동 스킵) */
    function _kbMoveCol(delta) {
        if (!_kbCell) return;
        var tds = _kbCell.tr.querySelectorAll('td');
        var idx = _kbCell.tdIdx + delta;
        while (idx >= 0 && idx < tds.length && _isSkipCell(tds[idx])) idx += delta;
        if (idx < 0 || idx >= tds.length) return;
        _setKbFocus(_kbCell.tr, idx);
    }

    /** 현재 포커스 셀 Enter 액션 실행 */
    function _kbEnterCell() {
        if (!_kbCell) return;
        var td = _kbCell.tr.querySelectorAll('td')[_kbCell.tdIdx];
        if (!td || _isSkipCell(td)) return;

        // 상태 셀: <select> 직접 포커스
        var sel = td.querySelector('select');
        if (sel) { sel.focus(); return; }

        var rowIdx = parseInt(_kbCell.tr.getAttribute('data-row-index'), 10);
        var onclickAttr = td.getAttribute('onclick') || '';

        // WBS 업무명 → 행 액션 메뉴 (onRowNoClick)
        if (onclickAttr.includes('onRowNoClick')) {
            if (window.onRowNoClick) window.onRowNoClick(td, rowIdx, { target: td });
            return;
        }

        // 상세내용 → 펼치기/접기 (toggleDetailExpand)
        if (onclickAttr.includes('toggleDetailExpand')) {
            td.click();
            return;
        }

        // 기간·날짜·담당자·모델·고객사 등 일반 텍스트 셀 → 편집 모드 (makeEditable)
        if ((td.getAttribute('ondblclick') || '').includes('makeEditable')) {
            if (window.makeEditable) window.makeEditable(td);
        }
    }

    /** 셀 클릭 위임 + 전역 키보드 핸들러 초기화 (ganttSearchInit 때 1회 호출) */
    function _ensureCellNavigation() {
        if (_cellNavSetup) return;
        _cellNavSetup = true;

        // ── 셀 클릭 위임: document 레벨 (table-body 재렌더 후에도 생존) ──
        document.addEventListener('click', function(e) {
            var td = e.target.closest('td');
            if (td) {
                var tr = td.closest('tr[data-row-index]');
                if (tr && tr.closest('#table-body') && !_isSkipCell(td)) {
                    var tds = Array.from(tr.querySelectorAll('td'));
                    _setKbFocus(tr, tds.indexOf(td));
                }
            } else if (!e.target.closest('#table-body')) {
                // 테이블 외부 클릭 → 포커스 해제
                _clearKbFocus();
            }
        });

        // ── 전역 키보드 핸들러 ──────────────────────────────────────────────
        document.addEventListener('keydown', function(e) {
            var isSearchInput = (document.activeElement &&
                                 document.activeElement.id === 'gantt-ai-search-input');

            // ↑ / ↓ ─────────────────────────────────────────────────────────
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                var delta = e.key === 'ArrowDown' ? 1 : -1;

                // 검색 input 포커스 → 검색 결과 이동
                if (isSearchInput) {
                    if (_matchedIndices.length) { e.preventDefault(); _navGo(delta); }
                    return;
                }

                if (_isEditingAnywhere()) return; // 편집 중 무시

                // 셀 포커스 있음 → 행 이동
                if (_kbCell) { e.preventDefault(); _kbMoveRow(delta); return; }

                // 검색 결과 있음 → 결과 이동
                if (_matchedIndices.length) { e.preventDefault(); _navGo(delta); }
            }

            // ← / → ─────────────────────────────────────────────────────────
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (_isEditingAnywhere()) return;
                if (!_kbCell) return;
                e.preventDefault();
                _kbMoveCol(e.key === 'ArrowRight' ? 1 : -1);
            }

            // Enter ──────────────────────────────────────────────────────────
            if (e.key === 'Enter') {
                if (_isEditingAnywhere()) return;
                if (!_kbCell) return;
                e.preventDefault();
                _kbEnterCell();
            }

            // Escape — 셀 포커스 해제 (검색 초기화는 _ensureSearchBar 핸들러) ──
            if (e.key === 'Escape' && _kbCell) {
                _clearKbFocus();
            }
        });
    }

    // ─── CSS 주입 ──────────────────────────────────────────────────────────────

    function _injectCss() {
        if (document.getElementById('gantt-ai-search-css')) return;
        var s = document.createElement('style');
        s.id = 'gantt-ai-search-css';
        s.textContent =
            // 매칭 행: 테두리 없음 — 텍스트 <mark> 하이라이트로 대체
            'tr.gantt-search-match { /* outline 제거 */ }' +
            // 현재 포커스 행: 매우 연한 배경만
            'tr.gantt-search-focus { background: rgba(0,112,125,.06) !important; }' +
            'tr.gantt-search-dim   { opacity: 0.2; pointer-events: none; }' +
            '#gantt-ai-searchbar   { border-radius: 0; }' +
            '#gantt-ai-search-input:focus { border-color: #00707d !important; box-shadow: 0 0 0 2px rgba(0,112,125,.15); }' +
            '#gantt-ai-bulk-bar button:hover { filter: brightness(0.93); }' +
            '#gantt-search-prev:hover, #gantt-search-next:hover { background: rgba(0,112,125,.15) !important; }' +
            // 텍스트 하이라이트 mark
            'mark.gantt-search-hl { background: #fff176; color: #333; border-radius: 2px;' +
            '  padding: 0 1px; font-weight: inherit; font-style: inherit; }' +
            // 셀 키보드 포커스 (td.gantt-kb-active)
            'td.gantt-kb-active { outline: 2px solid #1971c2 !important; outline-offset: -2px;' +
            '  background: rgba(25,113,194,.09) !important; }' +
            // 포커스된 행 왼쪽 인디케이터
            'tr.gantt-kb-row > td:first-child { border-left: 3px solid #1971c2 !important; }';
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
        _ensureCellNavigation(); // 💡 [2026-09-13 신규] 셀 키보드 네비게이션 초기화
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
