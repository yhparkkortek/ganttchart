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
    var _kbMode = null;       // 'calendar' | 'select' | 'edit' | 'wbs-menu' | null
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
                // 팔렛트 변경 시 현재 포커스 셀의 outline 색도 보색으로 즉시 갱신
                if (_kbCell) {
                    var _color = _getFocusColor();
                    var _tds = _kbCell.tr.querySelectorAll('td');
                    if (_tds[_kbCell.tdIdx]) _tds[_kbCell.tdIdx].style.outline = '2px solid ' + _color;
                    _kbCell.tr.style.setProperty('--gantt-kb-row-color', _color);
                }
                // 팔렛트 변경 시 현재 하이라이트 행(WBS 클릭)의 보색도 즉시 갱신
                document.querySelectorAll('tr.highlighted-row').forEach(function(hlTr) {
                    _applyHlColorToTr(hlTr, false);
                });
                document.querySelectorAll('tr.highlighted-row-child').forEach(function(hlTr) {
                    _applyHlColorToTr(hlTr, true);
                });
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

    /** 차트열처럼 키보드 스킵 대상 td인지
     *  · no-td(번호·📌핀 셀)는 스킵 해제 — Enter로 알람 토글 가능
     *  · canvas를 직접 포함하는 차트 셀만 스킵 유지 */
    function _isSkipCell(td) {
        if (!td) return true;
        if (td.querySelector('canvas')) return true;   // 차트 셀만 스킵
        return false;
    }

    /**
     * 현재 팔렛트에 맞는 kb 포커스 색 반환
     * · 기본 teal 팔렛트: 파란색 #1971c2
     * · 사용자 지정 팔렛트: darkText 색의 보색(hue+180°) — 팔렛트 색과 최대 대비
     */
    function _getFocusColor() {
        try {
            var darkText = window._cpRoleHex && window._cpRoleHex('darkText');
            // 기본 팔렛트(teal #00707d)이면 파란색 그대로
            if (!darkText || darkText.toLowerCase() === '#00707d') return '#1971c2';

            // hex → HSL 변환
            var hex = darkText.replace('#','');
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            var r=parseInt(hex.slice(0,2),16)/255;
            var g=parseInt(hex.slice(2,4),16)/255;
            var b=parseInt(hex.slice(4,6),16)/255;
            var max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, h, l=(max+min)/2;
            if (!d) return '#1971c2';
            var s = l>0.5 ? d/(2-max-min) : d/(max+min);
            if      (max===r) h=((g-b)/d+(g<b?6:0))/6;
            else if (max===g) h=((b-r)/d+2)/6;
            else              h=((r-g)/d+4)/6;
            // 보색: hue +180°, 채도 55~75%, 명도 38% (충분히 진해서 outline으로 보임)
            var compH = Math.round((h*360+180)%360);
            var compS = Math.round(Math.max(55, Math.min(75, s*100)));
            return 'hsl('+compH+','+compS+'%,38%)';
        } catch(e) { return '#1971c2'; }
    }
    // 전역 노출 — 04e-core-app-undo-redo.js의 highlightRow/highlightRowChildren에서 사용
    window._ganttGetFocusColor = _getFocusColor;

    /**
     * WBS 행 하이라이트 색을 tr에 CSS 변수로 적용
     * isChild=true → 자식 행(더 옅은 배경, 테두리 없음)
     */
    function _applyHlColorToTr(tr, isChild) {
        var color = _getFocusColor();
        var bg;
        if (color.startsWith('hsl(')) {
            var inner = color.slice(4, -1); // "H, S%, L%"
            bg = isChild ? 'hsla(' + inner + ', 0.09)' : 'hsla(' + inner + ', 0.15)';
        } else {
            // hex: 15% ≈ 0x26, 9% ≈ 0x17
            bg = isChild ? (color + '17') : (color + '26');
        }
        tr.style.setProperty('--gantt-hl-color', color);
        tr.style.setProperty('--gantt-hl-bg',    bg);
    }
    window._ganttApplyHlColor = _applyHlColorToTr;

    /** 키보드 포커스 해제 — 저장해둔 inline 스타일 복원 */
    function _clearKbFocus() {
        if (!_kbCell) return;
        var tds = _kbCell.tr.querySelectorAll('td');
        var td = tds[_kbCell.tdIdx];
        if (td) {
            // 저장해뒀던 원래 inline outline/background 복원
            td.style.outline        = _kbCell.prevOutline        != null ? _kbCell.prevOutline        : '';
            td.style.outlineOffset  = _kbCell.prevOutlineOffset  != null ? _kbCell.prevOutlineOffset  : '';
            td.classList.remove('gantt-kb-active');
        }
        _kbCell.tr.classList.remove('gantt-kb-row');
        _kbCell.tr.style.removeProperty('--gantt-kb-row-color');
        _kbCell = null;
    }

    /** tdIdx 위치에 키보드 포커스 이동 — 팔렛트 보색을 inline style로 적용 */
    function _setKbFocus(tr, tdIdx) {
        _clearKbFocus();
        if (!tr) return;
        var tds = tr.querySelectorAll('td');
        if (tdIdx < 0 || tdIdx >= tds.length) return;
        var td = tds[tdIdx];
        var color = _getFocusColor();
        // 기존 inline 스타일 저장 후 포커스 outline 적용
        _kbCell = {
            tr: tr, tdIdx: tdIdx,
            prevOutline:       td.style.outline       || '',
            prevOutlineOffset: td.style.outlineOffset || ''
        };
        td.style.outline       = '2px solid ' + color;
        td.style.outlineOffset = '-2px';
        td.classList.add('gantt-kb-active');
        tr.classList.add('gantt-kb-row');
        // CSS 변수로 행 왼쪽 인디케이터 색도 동기화
        tr.style.setProperty('--gantt-kb-row-color', color);
        td.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    // ── 상태 셀(select) 포커스 모드 ───────────────────────────────────────────
    // ⚠️ native select.focus() 를 쓰면 화살표→onchange→updateStatus()→renderTable() 으로
    //    select 자체가 사라져 이후 키 조작이 불가능해짐 — 대신 capture-phase 전역 핸들러로 처리
    function _enterSelectMode(sel) {
        _kbMode = 'select';
        var savedRowIdx = _kbCell ? parseInt(_kbCell.tr.getAttribute('data-row-index'), 10) : -1;
        var savedTdIdx  = _kbCell ? _kbCell.tdIdx : -1;
        var _exited = false;

        // 시각 표시 (focus 없이)
        sel.style.outline = '2px solid ' + _getFocusColor();

        // 재렌더 후 같은 행/열 위치의 select를 재탐색
        function _querySel() {
            var tr = document.querySelector('tr[data-row-index="' + savedRowIdx + '"]');
            if (!tr) return null;
            var tds = tr.querySelectorAll('td');
            return tds[savedTdIdx] ? tds[savedTdIdx].querySelector('select') : null;
        }

        function _exit() {
            if (_exited) return;
            _exited = true;
            document.removeEventListener('keydown', _onKey, true);
            var cs = _querySel();
            if (cs) cs.style.outline = '';
            if (_kbMode === 'select') _kbMode = null;
            // KB 포커스 복원 — re-render 후 새 tr 재탐색
            setTimeout(function() {
                var newTr = document.querySelector('tr[data-row-index="' + savedRowIdx + '"]');
                if (newTr) { _kbCell = null; _setKbFocus(newTr, savedTdIdx); }
            }, 30);
        }

        function _onKey(e) {
            if (_kbMode !== 'select') { _exit(); return; }
            var cs = _querySel();
            if (!cs) { _exit(); return; } // 행이 사라진 경우

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); e.stopPropagation();
                var newIdx = cs.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
                newIdx = Math.max(0, Math.min(cs.options.length - 1, newIdx));
                if (cs.selectedIndex !== newIdx) {
                    cs.selectedIndex = newIdx;
                    cs.dispatchEvent(new Event('change', { bubbles: true })); // → updateStatus()
                    // re-render 후 새 select에 시각 표시 재적용
                    setTimeout(function() {
                        var ns = _querySel();
                        if (ns) ns.style.outline = '2px solid ' + _getFocusColor();
                    }, 30);
                }
            } else if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                _exit();
            }
        }

        document.addEventListener('keydown', _onKey, true);
    }

    // ── 텍스트 편집 모드(contenteditable) 진입 ───────────────────────────────
    // makeEditable 내부 onkeydown(Enter=저장, Shift+Enter=줄바꿈)을 유지하면서
    // Esc=취소(원본 복원)만 별도 핸들러로 추가.
    // 저장 후 renderTable()이 호출되어 _kbCell.tr이 stale 해지는 문제를
    // onBlur에서 data-row-index로 재탐색해 KB 포커스를 복원함.
    function _enterEditMode(td) {
        if (!window.makeEditable) return;
        var rawAttr     = td.getAttribute('data-raw');
        var origText    = rawAttr ? decodeURIComponent(rawAttr) : td.innerText.trim();
        var savedRowIdx = _kbCell ? parseInt(_kbCell.tr.getAttribute('data-row-index'), 10) : -1;
        var savedTdIdx  = _kbCell ? _kbCell.tdIdx : -1;
        var _exited = false;

        window.makeEditable(td);
        _kbMode = 'edit';

        function _restore() {
            if (_exited) return;
            _exited = true;
            if (_kbMode === 'edit') _kbMode = null;
            // 50ms 대기: recalculateSchedules 등 동기 re-render 완료 후 새 tr 탐색
            setTimeout(function() {
                if (savedRowIdx < 0) return;
                var newTr = document.querySelector('tr[data-row-index="' + savedRowIdx + '"]');
                if (newTr) { _kbCell = null; _setKbFocus(newTr, savedTdIdx); }
            }, 50);
        }

        function onEsc(e) {
            if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                td.removeEventListener('keydown', onEsc, true);
                td.removeEventListener('blur', onBlur);
                td.innerText = origText; // 원본 복원 → blur 시 "변경 없음"으로 처리
                td.blur();
                _restore();
            }
        }
        function onBlur() {
            td.removeEventListener('keydown', onEsc, true);
            td.removeEventListener('blur', onBlur);
            _restore(); // Enter 저장 or Esc 후 blur 모두 여기서 KB 포커스 복원
        }
        td.addEventListener('keydown', onEsc, true); // capture: makeEditable의 onkeydown보다 먼저
        td.addEventListener('blur',    onBlur);
    }

    /**
     * 현재 포커스 셀 Enter 액션 실행
     * @param {boolean} shiftKey  — Shift+Enter 여부 (상세내용 셀에서만 의미)
     *
     * 셀 타입별 동작:
     *   날짜 셀    → 달력 팝업 열기 → 화살표로 날짜 이동 → Enter 확정 / Esc 취소
     *   상태 셀    → select 포커스 → 화살표로 값 변경 → Enter/Esc로 빠져나옴
     *   WBS 업무명 → 행 액션 팝업 → 화살표=이동/레벨, +-=추가/삭제 → Enter/Esc 닫기
     *   상세내용   → Enter=펼치기/접기 / Shift+Enter=텍스트 편집 → Enter/Esc 빠져나옴
     *   기간·담당자 등 일반 텍스트 → 편집 모드 → Enter 저장 / Esc 취소
     */
    function _kbEnterCell(shiftKey) {
        if (!_kbCell) return;
        var td = _kbCell.tr.querySelectorAll('td')[_kbCell.tdIdx];
        if (!td || _isSkipCell(td)) return;

        var rowIdx      = parseInt(_kbCell.tr.getAttribute('data-row-index'), 10);
        var onclickAttr = td.getAttribute('onclick')    || '';
        var ondblAttr   = td.getAttribute('ondblclick') || '';

        // 0. No. 셀(📌 핀) → 알람 토글 (Enter=ON, 다시 Enter=OFF)
        //    wrToggleAlarm → renderTable() 호출 → tbody 전체 재렌더 → _kbCell.tr stale
        //    → 재렌더 후 새 tr을 찾아 포커스 복원
        if (td.classList.contains('no-td')) {
            if (window.wrToggleAlarm) {
                window.wrToggleAlarm(rowIdx, null); // renderTable + applyFilters 동기 실행
                var newTr = document.querySelector('tr[data-row-index="' + rowIdx + '"]');
                if (newTr) {
                    var newTds = Array.from(newTr.querySelectorAll('td'));
                    var noIdx  = newTds.findIndex(function(t) { return t.classList.contains('no-td'); });
                    _kbCell = null; // 기존 stale 참조 먼저 해제 (clearKbFocus가 stale td를 건드리지 않게)
                    if (noIdx !== -1) _setKbFocus(newTr, noIdx);
                }
            }
            return;
        }

        // 1. 날짜 셀: .date-clickable 스팬 클릭 → showCalendar → 캘린더 모드
        var dateSpan = td.querySelector('.date-clickable');
        if (dateSpan) {
            dateSpan.click();          // showCalendar() 호출, 달력 팝업 표시
            _kbMode = 'calendar';
            return;
        }

        // 2. WBS 업무명 → 행 액션 팝업 → WBS 메뉴 모드
        // ⚠️ select 체크(case 3)보다 먼저 해야 함 — WBS 셀 안에 담당자 <select>가 있을 경우
        //    case 3(select)이 먼저 실행되어 WBS 팝업 대신 담당자 select를 잡아버리는 버그 방지
        if (onclickAttr.includes('onRowNoClick')) {
            if (window.onRowNoClick)
                window.onRowNoClick(td, rowIdx, { target: td, shiftKey: false, ctrlKey: false, detail: 1 });
            _kbMode = 'wbs-menu';
            return;
        }

        // 3. 상태 셀: select 포커스 → select 모드
        var sel = td.querySelector('select');
        if (sel) { _enterSelectMode(sel); return; }

        // 4. 상세내용 — Enter: 펼치기/접기 / Shift+Enter: 텍스트 편집 모드
        if (onclickAttr.includes('toggleDetailExpand')) {
            if (shiftKey) { _enterEditMode(td); }
            else          { td.click(); }       // toggleDetailExpand
            return;
        }

        // 5. 기간·날짜 직접입력·담당자·모델·고객사 등 일반 텍스트 편집 셀
        if (ondblAttr.includes('makeEditable')) {
            _enterEditMode(td);
        }
    }

    /** 셀 클릭 위임 + 전역 키보드 핸들러 초기화 (ganttSearchInit 때 1회 호출) */
    function _ensureCellNavigation() {
        if (_cellNavSetup) return;
        _cellNavSetup = true;

        // ── 셀 클릭 위임: capture 단계 등록 (세 번째 인자 true)
        //    · 이유: WBS/상세내용/상태 등 td의 inline onclick이 stopPropagation을 호출하면
        //      bubbling 핸들러는 document까지 도달하지 못함. capture 단계는 먼저 실행됨.
        //    · 부작용: 없음. 기존 onclick 액션은 이후 target 단계에서 정상 실행됨.
        document.addEventListener('click', function(e) {
            var td = e.target.closest('td');
            if (td) {
                var tr = td.closest('tr[data-row-index]');
                if (tr && tr.closest('#table-body') && !_isSkipCell(td)) {
                    var tds = Array.from(tr.querySelectorAll('td'));
                    _setKbFocus(tr, tds.indexOf(td));
                    // 날짜 셀 클릭으로 캘린더가 열릴 경우 자동으로 calendar 모드 전환
                    if (td.querySelector('.date-clickable')) _kbMode = 'calendar';
                    else if (_kbMode === 'calendar') _kbMode = null;
                }
            } else if (!e.target.closest('#table-body')) {
                _clearKbFocus();
                if (_kbMode !== 'edit') _kbMode = null;
            }
        }, true); // ← capture phase

        // ── 달력 키보드 헬퍼 ──────────────────────────────────────────────
        function _calKeyNav(dayDelta) {
            window.currentCalendarTs = (window.currentCalendarTs || Date.now()) + dayDelta * 86400000;
            var d = new Date(window.currentCalendarTs);
            window.currentViewYear  = d.getFullYear();
            window.currentViewMonth = d.getMonth();
            if (window.renderCalendar) window.renderCalendar(true);
        }
        function _calConfirm() {
            var d = new Date(window.currentCalendarTs || Date.now());
            _kbMode = null;
            if (window.selectDateFromCalendar)
                window.selectDateFromCalendar(d.getFullYear(), d.getMonth(), d.getDate());
        }
        function _calClose() {
            var p = document.getElementById('calendar-popup');
            if (p) p.style.display = 'none';
            var o = document.getElementById('calendar-bg-overlay'); if (o) o.remove();
            _kbMode = null;
        }

        // _enterSelectMode, _enterEditMode 는 외부 IIFE 스코프에 정의됨 (스코프 접근 보장)

        // ── 전역 키보드 핸들러 ────────────────────────────────────────────
        document.addEventListener('keydown', function(e) {

            // ── 캘린더 모드: 날짜 탐색·확정·취소 ─────────────────────────
            if (_kbMode === 'calendar') {
                var calPopup = document.getElementById('calendar-popup');
                if (!calPopup || calPopup.style.display !== 'block') {
                    _kbMode = null; // 달력이 이미 닫혔으면 모드 리셋
                } else {
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); _calKeyNav(-1); return; }
                    if (e.key === 'ArrowRight') { e.preventDefault(); _calKeyNav(+1); return; }
                    if (e.key === 'ArrowUp')    { e.preventDefault(); _calKeyNav(-7); return; }
                    if (e.key === 'ArrowDown')  { e.preventDefault(); _calKeyNav(+7); return; }
                    if (e.key === 'Enter')      { e.preventDefault(); _calConfirm(); return; }
                    if (e.key === 'Escape')     { e.preventDefault(); _calClose();   return; }
                    return; // 그 외 키는 달력 뒤 셀로 전달 차단
                }
            }

            // ── WBS 메뉴 모드: 행 조작 버튼 키 매핑 ─────────────────────
            // ↑/↓ = 위/아래 이동, ←/→ = WBS 레벨 변경, +/= = 행 추가, - = 행 삭제
            // Enter/Esc = 팝업 닫고 셀 네비게이션으로 복귀
            if (_kbMode === 'wbs-menu') {
                var rapPopup = document.getElementById('row-action-popup');
                if (!rapPopup || rapPopup.style.display !== 'block') {
                    _kbMode = null;
                } else {
                    function _rapClick(id) { var b = document.getElementById(id); if (b) b.click(); }
                    if (e.key === 'ArrowUp')             { e.preventDefault(); _rapClick('rap-up');    return; }
                    if (e.key === 'ArrowDown')           { e.preventDefault(); _rapClick('rap-dn');    return; }
                    if (e.key === 'ArrowLeft')           { e.preventDefault(); _rapClick('rap-left');  return; }
                    if (e.key === 'ArrowRight')          { e.preventDefault(); _rapClick('rap-right'); return; }
                    if (e.key === '+' || e.key === '=')  { e.preventDefault(); _rapClick('rap-add');   return; }
                    if (e.key === '-')                   { e.preventDefault(); _rapClick('rap-del');   return; }
                    if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        rapPopup.style.display = 'none';
                        if (window.clearRowHighlight) window.clearRowHighlight();
                        _kbMode = null;
                        return;
                    }
                    return; // 그 외 키 차단
                }
            }

            // ── 일반 네비게이션 모드 ─────────────────────────────────────
            var isSearchInput = (document.activeElement &&
                                 document.activeElement.id === 'gantt-ai-search-input');

            // ↑ / ↓ ─────────────────────────────────────────────────────────
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                var delta = e.key === 'ArrowDown' ? 1 : -1;
                if (isSearchInput) {
                    if (_matchedIndices.length) { e.preventDefault(); _navGo(delta); }
                    return;
                }
                if (_isEditingAnywhere()) return; // edit/select 모드 — per-element 핸들러 처리
                if (_kbCell) { e.preventDefault(); _kbMoveRow(delta); return; }
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
                if (_isEditingAnywhere()) return; // edit/select 모드 — per-element 핸들러 처리
                if (!_kbCell) return;
                e.preventDefault();
                _kbEnterCell(e.shiftKey); // shiftKey: 상세내용 셀 Shift+Enter = 편집 모드
            }

            // Esc ─────────────────────────────────────────────────────────────
            if (e.key === 'Escape') {
                // edit/select 모드는 per-element 핸들러(stopPropagation)가 먼저 처리
                // wbs-menu/calendar는 위에서 이미 처리됨
                if (_kbMode === 'edit' || _kbMode === 'select') return;
                if (_kbCell) _clearKbFocus();
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
            // 셀 키보드 포커스: outline은 _setKbFocus가 inline style로 동적 적용(보색 대응)
            // .gantt-kb-active는 식별자 역할만(clear 시 querySelector 용도)
            'td.gantt-kb-active { }' +
            // 포커스 행 왼쪽 인디케이터: CSS 변수 --gantt-kb-row-color 를 tr에서 _setKbFocus가 세팅
            'tr.gantt-kb-row > td:first-child { border-left: 3px solid var(--gantt-kb-row-color, #1971c2) !important; }';
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

    // ─── 키보드 단축키 모달 ────────────────────────────────────────────────────
    // 💡 [2026-09-13 신규] 설정 메뉴 "⌨️ 키보드 단축키" → 단축키 참조 모달
    //    sky-blue 헤더(AI 모달 스타일), draggable, minimizable, 한/영 지원

    /** 모달 콘텐츠 영역 HTML 생성 (언어 전환 때마다 재호출) */
    window._gsRefreshKbShortcuts = function() {
        var content = document.getElementById('gantt-kb-shortcuts-content');
        if (!content) return;
        var _en = window._currentLang === 'en';
        // 타이틀도 갱신
        var titleEl = document.getElementById('gantt-kb-shortcuts-title');
        if (titleEl) titleEl.textContent = _en ? 'Keyboard Shortcuts' : '키보드 단축키';

        // ── 헬퍼: key 뱃지 HTML ──────────────────────────────────────────────
        function key(label) {
            return '<span style="display:inline-flex;align-items:center;justify-content:center;' +
                   'font-family:\'Consolas\',\'Menlo\',monospace;font-size:11px;font-weight:600;' +
                   'background:#f5f7fa;border:1px solid #b8c0cc;box-shadow:0 2px 0 #9aa3b0;' +
                   'border-radius:5px;padding:2px 7px;white-space:nowrap;color:#1a2332;margin:0 1px;">' +
                   label + '</span>';
        }
        function plus() { return '<span style="font-size:11px;color:#868e96;margin:0 2px;">+</span>'; }
        function badge(text, color) {
            var colors = {
                blue:  'background:rgba(25,113,194,.1);color:#1971c2;',
                green: 'background:rgba(47,158,68,.1);color:#2f9e44;',
                amber: 'background:rgba(230,119,0,.1);color:#e67700;',
                gray:  'background:rgba(107,117,135,.1);color:#6b7587;'
            };
            return '<span style="display:inline-block;font-size:11px;font-weight:600;border-radius:4px;' +
                   'padding:1px 7px;white-space:nowrap;' + (colors[color] || colors.gray) + '">' + text + '</span>';
        }

        // ── 섹션 헤더 ────────────────────────────────────────────────────────
        function sectionLabel(text) {
            return '<p style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;' +
                   'color:#868e96;margin:18px 0 7px;">' + text + '</p>';
        }

        // ── 테이블 빌더 ──────────────────────────────────────────────────────
        function table(headers, rows) {
            var ths = headers.map(function(h, i) {
                return '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;' +
                       'letter-spacing:.07em;text-transform:uppercase;color:#868e96;background:#f5f7fa;' +
                       'border-bottom:1px solid #e4e7ec;' + (i === 0 ? 'width:200px;' : '') + '">' + h + '</th>';
            }).join('');
            var trs = rows.map(function(r) {
                var tds = r.cells.map(function(c) {
                    return '<td style="padding:9px 12px;vertical-align:middle;border-bottom:1px solid #f0f2f5;">' + c + '</td>';
                }).join('');
                var accentColor = { nav:'#1971c2', edit:'#2f9e44', action:'#e67700', none:'#dee2e8' }[r.type || 'none'];
                return '<tr style="border-left:3px solid ' + accentColor + ';">' + tds + '</tr>';
            }).join('');
            return '<div style="overflow-x:auto;border-radius:7px;border:1px solid #e4e7ec;margin-bottom:4px;">' +
                   '<table style="width:100%;border-collapse:collapse;font-size:12.5px;">' +
                   '<thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table></div>';
        }

        // ── 내용 조립 ─────────────────────────────────────────────────────────
        var html = '';

        // 전역 단축키
        html += sectionLabel(_en ? 'Global Shortcuts' : '전역 단축키');
        html += table(
            [_en ? 'Key' : '키', _en ? 'Action' : '동작', _en ? 'Condition' : '조건'],
            [
                { type: 'nav', cells: [
                    key('Ctrl') + plus() + key('Shift') + plus() + key('F'),
                    _en ? 'Open &amp; focus AI search' : 'AI 검색창 열기 &amp; 포커스',
                    _en ? 'Always' : '항상'
                ]},
                { type: 'nav', cells: [
                    key('↑') + ' ' + key('↓'),
                    _en ? 'Previous / next search result' : '검색 결과 이전 / 다음',
                    _en ? 'While search has results (also works inside search box)' : '검색 결과 있을 때<br><small style="color:#868e96;">검색창 안에서도 동작</small>'
                ]},
                { type: 'nav', cells: [
                    key('Enter') + ' / ' + key('Shift') + plus() + key('Enter'),
                    _en ? 'Next / previous search result' : '검색 결과 다음 / 이전',
                    _en ? 'Search box focused' : '검색창 포커스 상태'
                ]},
                { type: 'none', cells: [
                    key('Esc'),
                    _en ? 'Clear search / deselect cell' : '검색 초기화 / 셀 포커스 해제',
                    _en ? 'While searching or cell selected' : '검색 중이거나 셀 선택 시'
                ]}
            ]
        );

        // 셀 선택 후 조작
        html += sectionLabel(_en ? 'After Clicking a Cell' : '셀 선택 후 키보드 조작');
        html += table(
            [_en ? 'Key' : '키', _en ? 'Action' : '동작', _en ? 'Condition' : '조건'],
            [
                { type: 'nav', cells: [
                    key('↑') + ' ' + key('↓'),
                    _en ? 'Move up / down (same column)' : '위 / 아래 행 이동 (같은 열)',
                    _en ? 'Not editing' : '편집 중이 아닐 때'
                ]},
                { type: 'nav', cells: [
                    key('←') + ' ' + key('→'),
                    _en ? 'Move left / right (No. &amp; chart columns skipped)' : '좌 / 우 열 이동<br><small style="color:#868e96;">No.·차트 열 자동 스킵</small>',
                    _en ? 'Not editing' : '편집 중이 아닐 때'
                ]},
                { type: 'action', cells: [
                    key('Enter'),
                    _en ? 'Cell action (see table below)' : '셀 타입별 액션 실행 (아래 표 참고)',
                    _en ? 'Not editing' : '편집 중이 아닐 때'
                ]},
                { type: 'none', cells: [
                    key('Esc'),
                    _en ? 'Deselect cell' : '셀 포커스 해제',
                    _en ? 'Cell selected' : '셀 선택 상태'
                ]}
            ]
        );

        // 셀 타입별 Enter 예외 표
        html += sectionLabel(_en ? 'Enter Action by Cell Type' : '셀 타입별 Enter 동작');
        html += table(
            [_en ? 'Cell' : '셀 유형', _en ? 'Enter Action' : 'Enter 동작',
             _en ? 'While Editing' : '편집 중 Enter', _en ? 'Note' : '비고'],
            [
                { type: 'action', cells: [
                    badge(_en ? 'WBS Task' : 'WBS 업무명', 'amber'),
                    _en ? 'Row action menu' : '행 액션 메뉴',
                    _en ? 'Save' : '완료(저장)',
                    _en ? 'Dbl-click to rename' : '더블클릭하면 이름 편집'
                ]},
                { type: 'edit', cells: [
                    badge(_en ? 'Duration' : '기간 (Days)', 'green'),
                    _en ? 'Edit number' : '숫자 편집 모드',
                    _en ? 'Save' : '완료(저장)',
                    '—'
                ]},
                { type: 'nav', cells: [
                    badge(_en ? 'Status' : '상태 (Status)', 'blue'),
                    _en ? 'Focus &lt;select&gt;' : '&lt;select&gt; 포커스',
                    '—',
                    _en ? 'Arrow keys to pick value' : '방향키로 값 선택'
                ]},
                { type: 'edit', cells: [
                    badge(_en ? 'Start / End Date' : '시작일 / 종료일', 'green'),
                    _en ? 'Edit date' : '날짜 직접 편집',
                    _en ? 'Save' : '완료(저장)',
                    '—'
                ]},
                { type: 'edit', cells: [
                    badge(_en ? 'Assignee / Model / Client' : '담당자 / 모델 / 고객사', 'green'),
                    _en ? 'Edit text' : '텍스트 편집 모드',
                    _en ? 'Save' : '완료(저장)',
                    '—'
                ]},
                { type: 'action', cells: [
                    badge(_en ? 'Detail' : '상세내용', 'amber'),
                    _en ? 'Expand / collapse' : '펼치기 / 접기',
                    _en ? 'Save (Shift+Enter=newline)' : '완료 (Shift+Enter=줄바꿈)',
                    _en ? 'Dbl-click to edit text' : '더블클릭 → 텍스트 편집'
                ]},
                { type: 'none', cells: [
                    badge(_en ? 'No. column' : 'No. 열', 'gray'),
                    '<span style="color:#868e96;">' + (_en ? 'None' : '없음') + '</span>',
                    '—',
                    _en ? 'Row number only, keyboard skipped' : '행번호 표시 전용, 키보드 스킵'
                ]},
                { type: 'none', cells: [
                    badge(_en ? 'Chart cell' : '차트 셀', 'gray'),
                    '<span style="color:#868e96;">' + (_en ? 'None' : '없음') + '</span>',
                    '—',
                    _en ? 'Drag only, keyboard skipped' : '드래그 전용, 키보드 스킵'
                ]}
            ]
        );

        content.innerHTML = html;
    };

    /** 키보드 단축키 모달 열기 */
    window.openGanttKeyboardShortcuts = function() {
        var modal = document.getElementById('gantt-kb-shortcuts-modal');

        if (!modal) {
            // ── 최초 1회 DOM 생성 ───────────────────────────────────────────
            modal = document.createElement('div');
            modal.id = 'gantt-kb-shortcuts-modal';
            modal.style.cssText =
                'display:none;position:fixed;inset:0;z-index:9250;pointer-events:none;background:none;';

            var box = document.createElement('div');
            box.id = 'gantt-kb-shortcuts-box';
            box.style.cssText =
                'pointer-events:all;position:fixed;background:#fff;' +
                'top:50%;left:50%;transform:translate(-50%,-50%);' +
                'border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.18);' +
                'width:620px;min-width:420px;min-height:320px;max-height:85vh;' +
                'display:flex;flex-direction:column;overflow:hidden;resize:both;';

            // sky-blue 헤더 (AI 모달 컨벤션)
            var hdr = document.createElement('div');
            hdr.id = 'gantt-kb-shortcuts-drag';
            hdr.style.cssText =
                'background:#e7f3ff;border-bottom:1px solid #a5c8f0;color:#1971c2;' +
                'padding:10px 14px;display:flex;align-items:center;gap:8px;' +
                'cursor:grab;user-select:none;flex-shrink:0;';
            hdr.innerHTML =
                '<span style="font-size:16px;">⌨️</span>' +
                '<span id="gantt-kb-shortcuts-title" style="font-weight:700;font-size:14px;flex:1;"></span>' +
                '<button id="gantt-kb-shortcuts-close"' +
                '  style="background:var(--modal-icon-bg);border:1px solid var(--modal-icon-border);' +
                '  color:var(--modal-icon-text);border-radius:6px;font-size:16px;' +
                '  cursor:pointer;width:28px;height:28px;flex-shrink:0;">✕</button>';

            // 스크롤 영역
            var content = document.createElement('div');
            content.id = 'gantt-kb-shortcuts-content';
            content.style.cssText = 'overflow-y:auto;padding:14px 16px 20px;flex:1;';

            box.appendChild(hdr);
            box.appendChild(content);
            modal.appendChild(box);
            document.body.appendChild(modal);

            // 닫기 버튼
            document.getElementById('gantt-kb-shortcuts-close').addEventListener('click', function() {
                modal.style.display = 'none';
            });

            // 드래그·최소화·z-index 관리
            if (window._makeDraggable)    window._makeDraggable('gantt-kb-shortcuts-box', 'gantt-kb-shortcuts-drag');
            if (window._bindClickToFront) window._bindClickToFront('gantt-kb-shortcuts-modal');
        }

        // 언어 반영 (열 때마다 + toggleLang 시)
        window._gsRefreshKbShortcuts();

        // 모달 표시 & 최상단
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('gantt-kb-shortcuts-modal');
    };

})();
