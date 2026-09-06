// ── 공통 드래그 함수 (모든 모달 공유) ────────────────────────
// 💡 [2026-08-28 신규] 화면 경계 clamp — 예전엔 제한 없이 끌 수 있어서, 실수로 모달을 브라우저
//    주소창 위(화면 밖)까지 끌고 나가면 드래그 손잡이(핸들)까지 화면 밖으로 나가버려 다시 끌어올 방법이
//    없었다. 항상 최소 MARGIN px는 화면 안에 남도록 위치를 제한해서, 언제든 다시 손잡이를 잡을 수 있게 함
//    (전체 모달 25개+ 이상이 이 함수 하나를 공유하므로 여기 한 곳만 고치면 전부 적용됨).
window._makeDraggable = function(modalId, handleId) {
    let isDragging = false, startX, startY, origLeft, origTop, modalW, modalH;
    const DRAG_MARGIN = 40;

    // 💡 [2026-08-31 버그 수정] "모바일에서 모달이 손가락으로 안 잡힌다" — PC/모바일이 다르게 설계된 게
    //    아니라, 아래 로직이 mousedown/mousemove/mouseup만 듣고 있어서 애초에 터치 이벤트를 전혀 처리
    //    하지 않고 있었다(터치스크린은 마우스 이벤트를 쏘지 않음). 좌표 계산 로직을 start/move/end로
    //    빼내 마우스·터치 양쪽에서 그대로 재사용하고, touchstart/touchmove/touchend를 추가로 등록해서
    //    모바일에서도 손잡이를 눌러 끌 수 있게 한다. 이 함수 하나를 25개+ 모달이 공유하므로, 여기 한
    //    곳만 고치면 앱 전체 모달의 모바일 드래그가 함께 고쳐진다.
    const startDrag = function(clientX, clientY, handle, modal) {
        isDragging = true;
        const rect = modal.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        modalW = rect.width; modalH = rect.height;
        startX = clientX; startY = clientY;
        modal.style.transform = 'none';
        modal.style.left = origLeft + 'px';
        modal.style.top  = origTop  + 'px';
        handle.style.cursor = 'grabbing';
    };
    const moveDrag = function(clientX, clientY) {
        if (!isDragging) return;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        let newLeft = origLeft + clientX - startX;
        let newTop  = origTop  + clientY - startY;
        const minLeft = DRAG_MARGIN - modalW, maxLeft = window.innerWidth - DRAG_MARGIN;
        const minTop = 0, maxTop = window.innerHeight - DRAG_MARGIN; // 위쪽은 0으로 고정 — 주소창 뒤로 못 넘어감
        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < minTop) newTop = minTop;
        if (newTop > maxTop) newTop = maxTop;
        modal.style.left = newLeft + 'px';
        modal.style.top  = newTop + 'px';
    };
    const endDrag = function() {
        if (!isDragging) return;
        isDragging = false;
        const handle = document.getElementById(handleId);
        if (handle) handle.style.cursor = 'grab';
    };

    document.addEventListener('mousedown', function(e) {
        const handle = document.getElementById(handleId);
        if (!handle || !handle.contains(e.target)) return;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        startDrag(e.clientX, e.clientY, handle, modal);
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) { moveDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup', endDrag);

    // 💡 터치 버전 — touchmove는 { passive:false }로 등록해야 드래그 중 e.preventDefault()로
    //    배경(페이지 전체) 스크롤을 막을 수 있다(기본은 passive:true라 무시됨).
    document.addEventListener('touchstart', function(e) {
        const handle = document.getElementById(handleId);
        if (!handle || !handle.contains(e.target)) return;
        const modal = document.getElementById(modalId);
        if (!modal || !e.touches.length) return;
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY, handle, modal);
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
        if (!isDragging || !e.touches.length) return;
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);

    // 💡 [2026-09-02 신규] 모달 최소화(하단 taskbar) — 드래그를 등록하는 모든 모달에 자동으로 함께
    //    적용된다(별도로 각 모달마다 등록할 필요 없음. 새 모달을 추가해도 _makeDraggable만 호출하면
    //    자동으로 최소화 버튼이 붙는다).
    window._makeMinimizable(modalId, handleId);
};

// ── 공통 모달 최소화(하단 taskbar) 함수 ──────────────────────
// 💡 [2026-09-02 신규] 모달이 여러 개 뜨면 화면을 가려서 불편하다는 요청으로 추가.
//    헤더의 ✕ 닫기 버튼 왼쪽에 ▼(최소화) 버튼을 자동으로 끼워 넣는다. 각 모달이 실제로 어떤 요소의
//    display를 토글해서 열고 닫는지(오버레이 wrapper와 실제 박스가 분리된 모달도 있고, 박스 자신이
//    곧 토글 대상인 모달도 있음)는 모달마다 제각각이라, 이미 있는 ✕ 버튼의 onclick 문자열에서
//    getElementById(...) 대상을 그대로 읽어내는 방식으로 알아낸다 — 그래서 모달 39개+ 각각의 내부
//    구조를 일일이 알 필요 없이 이 파일 하나만으로 전체에 적용됨.
window._modalMinimized = window._modalMinimized || {};

// 핸들(헤더) 안에서 실제 ✕ 닫기 버튼을 찾는다. 모든 모달이 --modal-icon-bg 스타일을 공용으로 쓰는
// 규칙(styles.css 참고)을 이용 — 못 찾으면 텍스트가 ✕/×/X인 버튼으로 한 번 더 시도.
function _findModalCloseBtn(handle) {
    if (!handle) return null;
    const all = Array.prototype.slice.call(handle.querySelectorAll('button'));
    let cands = all.filter(function(b) { return (b.getAttribute('style') || '').indexOf('modal-icon-bg') !== -1; });
    if (!cands.length) {
        cands = all.filter(function(b) {
            const t = (b.textContent || '').trim();
            return t === '✕' || t === '×' || t.toLowerCase() === 'x';
        });
    }
    return cands.length ? cands[cands.length - 1] : null;
}

// 헤더의 제목 텍스트만 뽑아낸다(도움말 아이콘/툴팁처럼 중첩된 요소의 텍스트는 제외).
function _modalTitleFor(handle, modalId) {
    if (!handle) return modalId;
    const cand = handle.querySelector('span, h3, strong');
    let text = '';
    if (cand) {
        for (let i = 0; i < cand.childNodes.length; i++) {
            const n = cand.childNodes[i];
            if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) { text = n.textContent; break; }
        }
        if (!text) text = cand.textContent;
    } else {
        text = handle.textContent;
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 20) : modalId;
}

// ✕ 버튼의 onclick에서 실제 토글 대상 id를 읽어낸다. 못 찾으면 modalId 자신을 토글 대상으로 가정
// (박스 자신이 곧 열고 닫는 대상인 모달들이 이 경우에 해당).
function _modalToggleTarget(modalId, closeBtn) {
    const onclickAttr = closeBtn ? (closeBtn.getAttribute('onclick') || '') : '';
    const m = /getElementById\(\s*['"]([\w-]+)['"]\s*\)/.exec(onclickAttr);
    if (m) {
        const el = document.getElementById(m[1]);
        if (el) return el;
    }
    const modalEl = document.getElementById(modalId);
    // 💡 [버그 수정 2026-09-06] "AI 업무 보관함이 안 열림(특히 다른 모달을 이미 열어본 뒤)" 제보의
    //    원인 — task-inbox-modal처럼 ✕ 버튼이 onclick에 getElementById(...)를 직접 안 쓰고 이름
    //    있는 도우미 함수(window.closeTaskInbox() 등)만 호출하는 모달은, 위 정규식이 못 찾아서
    //    modalId 자신(오버레이의 자식인 내부 박스)을 최소화 대상으로 잘못 골랐다. 이 앱의 실제
    //    open/closeXxx() 로직은 항상 부모(.modal-overlay 오버레이 wrapper)의 display만 토글하고
    //    자식 박스 자신의 인라인 display는 절대 건드리지 않으므로, 최소화가 자식만 display:none으로
    //    숨긴 뒤엔 그 뒤로 openXxx()를 아무리 다시 불러도(부모만 flex로 "재확인"될 뿐 자식은 그대로
    //    none) 화면에 아무것도 안 보여 "모달이 안 열리는" 것처럼 보였다. 부모가 .modal-overlay면
    //    그 부모를 실제 토글 대상으로 삼는다.
    if (modalEl && modalEl.parentElement && modalEl.parentElement.classList.contains('modal-overlay')) {
        return modalEl.parentElement;
    }
    return modalEl;
}

// 💡 [2026-09-02 버그 수정] mouseover/mouseout으로 배경색을 직접 칠하는 방식은, 마우스가 버튼
//    위에 있는 상태에서 모달이 최소화(display:none)되면 mouseout이 아예 발생하지 않아 "hover 배경색이
//    입혀진 채로 굳어버리는" 문제가 있었다(복원해도 실제로 마우스를 다시 올렸다 떼야만 정상화됨).
//    JS로 배경을 직접 칠하는 대신 CSS :hover로 처리하면 DOM이 안 보이는 동안 상태가 아예 존재하지
//    않으므로 이 문제가 원천적으로 발생하지 않는다.
if (!document.getElementById('modal-taskbar-style')) {
    const _mtStyle = document.createElement('style');
    _mtStyle.id = 'modal-taskbar-style';
    // 💡 [2026-09-02 신규] 하단 박스도 상단 시트탭(엑셀 시트탭처럼 색이 있는 프로젝트 탭)과 같은
    //    "지금 적용 중인 테마 색"을 따르도록, hover 색은 칩마다 --mtc-hover-bg/--mtc-hover-border로
    //    주입해서 쓴다(고정값이 아니라 칩 생성 시점의 실제 테마 색 — renderSheetTabsBar와 동일한 방식).
    _mtStyle.textContent = '.modal-icon-btn:hover { background: var(--modal-icon-hover-bg) !important; }\n'
        + '.modal-taskbar-chip:hover { background: var(--mtc-hover-bg, #f3f6fa) !important; border-color: var(--mtc-hover-border, #ccd5dd) !important; }';
    document.head.appendChild(_mtStyle);
}

function _modalIconBtn(html, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.className = 'modal-icon-btn';
    btn.innerHTML = html;
    btn.style.cssText = 'background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:14px; cursor:pointer; width:24px; height:24px; padding:0; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;';
    return btn;
}

// 💡 [2026-09-02 버그 수정] 왼쪽 시작 위치가 화면(사이드바 아래)에 고정돼 있어서 메인 콘텐츠 박스
//    시작 지점과 어긋나 보였다 — #app-main(사이드바 접힘/펼침에 따라 margin-left가 바뀌는 실제
//    콘텐츠 영역)의 왼쪽 끝~오른쪽 끝 폭에 정확히 맞추고, 사이드바를 접었다 펴도 계속 맞도록
//    ResizeObserver로 추적한다. [2026-09-02 추가] 오른쪽도 화면 끝이 아니라 #app-main 폭으로
//    제한해서, 상단 시트탭 바처럼 "메인 콘텐츠 박스를 넘어가지 않게" 한다.
const MT_TAB_W = 160;   // 상단 시트탭 바(renderSheetTabsBar)의 DEFAULT_TAB_W와 동일 — "엑셀 시트 너비"
const MT_TAB_MIN_W = 70; // 〃 MIN_TAB_W와 동일
const MT_GAP = 8;

let _mtBoundsSynced = false;
function _syncTaskbarBounds(bar) {
    const mainEl = document.getElementById('app-main');
    if (mainEl) {
        const r = mainEl.getBoundingClientRect();
        bar.style.left = r.left + 'px';
        bar.style.width = r.width + 'px';
    } else {
        bar.style.left = '10px';
        bar.style.width = 'calc(100% - 20px)';
    }
    _relayoutTaskbarChips(bar);
}

// 💡 [2026-09-02 신규] 박스가 많아지면 2단으로 줄바꿈되던 걸 1단 유지로 바꾸고, 대신 제한된 폭 안에
//    맞도록 각 박스 폭을 촘촘히 줄여간다(상단 시트탭 바의 자동 축소 로직과 동일한 방식). 기본 폭
//    (MT_TAB_W)으로 다 안 들어가면 MT_TAB_MIN_W까지 균등하게 줄이고, 그 축소 모드에서는 복원(▲)
//    버튼을 숨기고(더블클릭으로 복원 가능) 글자 크기도 줄여서 좁은 폭에서도 제목이 최대한 보이게 한다.
function _relayoutTaskbarChips(bar) {
    const chips = Array.prototype.slice.call(bar.children);
    const n = chips.length;
    if (!n) { _updateTaskbarReserve(bar); return; }
    const available = bar.clientWidth;
    const neededAtDefault = n * MT_TAB_W + (n - 1) * MT_GAP;
    let chipW = MT_TAB_W;
    let shrink = false;
    if (neededAtDefault > available && available > 0) {
        chipW = Math.max(MT_TAB_MIN_W, Math.floor((available - (n - 1) * MT_GAP) / n));
        shrink = true;
    }
    chips.forEach(function(chip) {
        chip.style.width = chipW + 'px';
        chip.style.flex = '0 0 ' + chipW + 'px';
        chip.style.fontSize = shrink ? '11px' : '12.5px';
        const restoreBtn = chip.querySelector('.mtc-restore-btn');
        if (restoreBtn) restoreBtn.style.display = shrink ? 'none' : 'flex';
    });

    _updateTaskbarReserve(bar);
}

// 💡 [2026-09-02 신규] "모든 페이지에서 하단 박스와 메인 상자가 겹치지 않도록" — 각 탭의 내부 스크롤
//    영역(예: #gantt-table-scroll 등, styles.css의 has-multi-sheet-bar 규칙 + 각 요소 인라인
//    max-height에 이미 걸려있는 var(--mt-reserve, 0px))에서 실시간으로 빼줄 여백을 문서 루트에
//    설정한다. 간격 12px는 UI 기본 여백 단위(.concept-section margin-bottom)와 동일하게 맞춘 값.
function _updateTaskbarReserve(bar) {
    const hasChips = bar.children.length > 0;
    const reserve = hasChips ? (bar.offsetHeight + 12) : 0;
    document.documentElement.style.setProperty('--mt-reserve', reserve + 'px');
    _syncSummaryScrollHeight();
}

// 💡 [2026-09-02 신규] #summary-table-scroll 시작 위치(top)를 CSS 변수로 기록
//    height 는 calc(100vh - var(--summary-scroll-top) - var(--mt-reserve)) 로 HTML에 지정하여
//    창 크기·줌 변화 시에도 100vh 가 자동 추적 → 갭이 항상 일정하게 유지됨.
//    JS 는 레이아웃 구조가 바뀔 때(멀티시트 바 추가/제거)만 변수를 갱신.
//    [2026-09-02 확장] --tab-wrap-top 도 함께 갱신 (Address/BriefSpec/MCTable/Alarm 탭 flex 높이 기준).
function _syncSummaryScrollHeight() {
    var el = document.getElementById('summary-table-scroll');
    if (el) {
        var top = el.getBoundingClientRect().top;
        if (top >= 10) { // 탭이 숨겨진 상태(display:none)면 스킵
            document.documentElement.style.setProperty('--summary-scroll-top', Math.round(top) + 'px');
        }
    }
    _syncTabWrapTop();
}

// 💡 [2026-09-02 신규] Address/BriefSpec/MCTable/Alarm 탭의 .concept-tab-wrap 시작 y좌표를
//    CSS 변수 --tab-wrap-top 으로 기록. 이 탭들의 wrap 시작점 = #app-main.top + #sheet-tabs-bar.height
//    이므로, 탭이 숨겨져 있어도 언제나 정확히 계산 가능. CSS 쪽에서는
//    height: calc(100vh - var(--tab-wrap-top) - var(--mt-reserve)) 로 각 wrap을 뷰포트에 꽉 채운다.
function _syncTabWrapTop() {
    var appMain = document.getElementById('app-main');
    if (!appMain) return;
    var mainTop = Math.round(appMain.getBoundingClientRect().top);
    var sheetBar = document.getElementById('sheet-tabs-bar');
    var sheetH = (sheetBar && sheetBar.offsetHeight) ? sheetBar.offsetHeight : 0;
    document.documentElement.style.setProperty('--tab-wrap-top', (mainTop + sheetH) + 'px');
}

function _modalTaskbarEl() {
    let bar = document.getElementById('modal-taskbar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'modal-taskbar';
        bar.style.cssText = 'position:fixed; bottom:0; z-index:99999; display:flex; gap:' + MT_GAP + 'px; flex-wrap:nowrap; overflow:hidden; pointer-events:none;';
        document.body.appendChild(bar);
    }
    _syncTaskbarBounds(bar);
    if (!_mtBoundsSynced) {
        _mtBoundsSynced = true;
        window.addEventListener('resize', function() { _syncTaskbarBounds(bar); });
        const mainEl = document.getElementById('app-main');
        if (mainEl && window.ResizeObserver) {
            new ResizeObserver(function() { _syncTaskbarBounds(bar); }).observe(mainEl);
        }
    }
    return bar;
}

// 헤더에 ▼ 최소화 버튼을 끼워 넣는다. ✕ 버튼 패턴을 못 찾으면 조용히 건너뜀(해당 모달은 최소화
// 미적용 — 앱이 깨지지 않도록 안전하게 실패).
window._makeMinimizable = function(modalId, handleId) {
    const handle = document.getElementById(handleId);
    if (!handle || handle.querySelector('.modal-min-btn')) return;
    const closeBtn = _findModalCloseBtn(handle);
    if (!closeBtn) { console.warn('[modal-taskbar] 닫기 버튼을 못 찾아 최소화 미적용:', modalId); return; }

    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'modal-min-btn modal-icon-btn';
    minBtn.title = '최소화';
    minBtn.innerHTML = '<i class="ti ti-chevron-down"></i>';
    minBtn.setAttribute('style', closeBtn.getAttribute('style') || '');
    // 헤더(드래그 손잡이) 안에 있으므로 mousedown/touchstart가 드래그 시작으로 번지지 않게 막는다.
    minBtn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    minBtn.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
    minBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        window._minimizeModal(modalId, handleId, closeBtn, handle);
    });

    // 💡 [2026-09-02 버그 수정] 헤더가 justify-content:space-between이고 원래 자식이 제목/✕ 버튼
    //    2개뿐인 경우, 여기에 최소화 버튼을 끼워 넣어 3개가 되면 space-between이 가운데 아이템을
    //    양옆 여백이 같아지는 위치(제목과 ✕ 사이 중간쯤)로 밀어버려서 ✕와 멀리 떨어져 보였다.
    //    ✕ 버튼과 최소화 버튼을 작은 그룹으로 함께 묶어서, 헤더가 어떤 flex 배치를 쓰든 항상 ✕
    //    바로 옆에 붙어 있도록 한다.
    const group = document.createElement('span');
    group.style.cssText = 'display:inline-flex; align-items:center; gap:6px; flex-shrink:0;';
    closeBtn.parentNode.insertBefore(group, closeBtn);
    group.appendChild(minBtn);
    group.appendChild(closeBtn);

    // 💡 [2026-09-02 신규] 열려있는 모달의 헤더를 더블클릭해도 ▼ 버튼을 누른 것처럼 바로 최소화되게.
    //    버튼(▼/✕/프롬프트 편집 등) 위에서의 더블클릭은 각 버튼 자신의 클릭 동작에 맡기고 건드리지 않음.
    handle.addEventListener('dblclick', function(e) {
        if (e.target.closest('button')) return;
        window._minimizeModal(modalId, handleId, closeBtn, handle);
    });
};

window._minimizeModal = function(modalId, handleId, closeBtn, handle) {
    if (window._modalMinimized[modalId]) {
        // 💡 칩이 있는 상태에서 모달의 ▼를 다시 누르면 → _restoreModal이 재최소화 처리
        if (window._modalMinimized[modalId].isRestored) window._restoreModal(modalId);
        return;
    }
    const toggleEl = _modalToggleTarget(modalId, closeBtn);
    if (!toggleEl) return;
    const prevDisplay = toggleEl.style.display || getComputedStyle(toggleEl).display;

    // 💡 [2026-09-02 신규] "엑셀 시트탭과 같은 색상" 요청 — 상단 시트탭 바(renderSheetTabsBar,
    //    js/04c-core-app-mail-pipeline.js)가 쓰는 것과 똑같이 window._cpRoleHex()로 지금 적용 중인
    //    테마 색을 그대로 읽어와 칠한다. 아직 팔레트를 한 번도 안 건드렸으면 기본 청록 팔레트로 대체.
    //    [2026-09-02 수정] 기본 상태가 흰 배경이던 걸 "테마색(bg/border 롤)"로, hover는 그보다 한
    //    단계 더 진한 색(hoverBg/hoverBorder 롤)으로 바꿔서 hover했을 때 확실히 진해지는 게 보이게 함.
    const _cpHex = window._cpRoleHex || function(k) { return { bg: '#e0f5f7', border: '#cfe3e5', hoverBg: '#a3d9e0', hoverBorder: '#52a5af', darkText: '#00707d' }[k]; };
    const tabBg = _cpHex('bg');
    const tabBorder = _cpHex('border');
    const tabHoverBg = _cpHex('hoverBg');
    const tabHoverBorder = _cpHex('hoverBorder');
    const tabText = _cpHex('darkText');

    const bar = _modalTaskbarEl();
    const chip = document.createElement('div');
    chip.className = 'modal-taskbar-chip';
    chip.style.cssText = 'pointer-events:all; display:flex; align-items:center; gap:6px; background:' + tabBg + '; border:1px solid ' + tabBorder + '; border-bottom:none; border-radius:8px 8px 0 0; box-shadow:0 -2px 10px rgba(0,0,0,.15); padding:6px 6px 6px 12px; font-size:12.5px; color:' + tabText + '; font-weight:bold; box-sizing:border-box;';
    chip.style.setProperty('--mtc-hover-bg', tabHoverBg);
    chip.style.setProperty('--mtc-hover-border', tabHoverBorder);
    chip.title = '더블클릭하면 원래대로 복원됩니다';

    // 💡 [2026-09-02 신규] 상자 기본 폭을 상단 시트탭과 같은 값(MT_TAB_W)으로 — 제목이 잘려도
    //    title 속성(말풍선)으로 전체를 볼 수 있으니 자르는 걸 허용.
    const label = document.createElement('span');
    label.className = 'mtc-label';
    label.textContent = _modalTitleFor(handle, modalId);
    label.title = label.textContent;
    label.style.cssText = 'flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

    const restoreBtn = _modalIconBtn('<i class="ti ti-chevron-up"></i>', '복원');
    restoreBtn.className += ' mtc-restore-btn';
    restoreBtn.addEventListener('click', function(e) { e.stopPropagation(); window._restoreModal(modalId); });

    const xBtn = _modalIconBtn('<i class="ti ti-x"></i>', '닫기');
    xBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const info = window._modalMinimized[modalId];
        if (info && info.observer) info.observer.disconnect();
        delete window._modalMinimized[modalId];
        if (chip.parentNode) chip.parentNode.removeChild(chip);
        _relayoutTaskbarChips(bar);
        // 완전히 닫기 — 저장/정리 로직이 있는 모달도 안전하도록, 원래 보이던 상태로 되돌린 뒤
        // 실제 ✕ 버튼을 그대로 눌러서(onclick 로직 그대로 재사용) 닫는다.
        toggleEl.style.display = prevDisplay;
        if (closeBtn) closeBtn.click(); else toggleEl.style.display = 'none';
    });

    chip.appendChild(label);
    chip.appendChild(restoreBtn);
    chip.appendChild(xBtn);
    // 💡 [2026-09-02 개선] 축소 모드에서 ▲ 버튼이 사라지므로, 칩 라벨 단일 클릭으로도 복원.
    //    ✕·▲ 버튼은 각자 stopPropagation()이 있어 중복 호출 없음.
    chip.addEventListener('click', function(e) { e.stopPropagation(); window._restoreModal(modalId); });
    bar.appendChild(chip);
    _relayoutTaskbarChips(bar);

    toggleEl.style.display = 'none';

    // 💡 [2026-09-02 신규] "최소화된 줄 모르고 메뉴 등에서 다시 열었을 때 중복으로 열리는" 문제 수정 —
    //    최소화 중엔 이 요소의 style을 우리가 아닌 다른 코드(그 모달의 원래 openXxxModal 함수)가
    //    다시 보이는 값으로 바꾸는 경우가 있다(같은 id의 DOM을 재사용해 display만 되돌리는 방식이라
    //    "새로" 열리진 않지만, 하단 박스가 안 없어지고 그대로 남아 "열려있는데 또 떠 있다"는 인상을 줌).
    //    style 속성 변화를 감시하다가 display가 'none'이 아닌 값으로 바뀌면, 우리가 직접 만든 restore가
    //    아니어도 최소화 상태를 정리해서(하단 박스 제거) 원래 위치로 "돌아온 것"처럼 자연스럽게 맞춘다.
    const observer = new MutationObserver(function() {
        if (toggleEl.style.display === 'none') return; // 아직 안 보임 — 우리가 최소화한 상태 그대로
        observer.disconnect();
        const info = window._modalMinimized[modalId];
        if (!info) return; // 이미 ▲복원/✕닫기로 우리 쪽에서 정리됨
        if (info.chip && info.chip.parentNode) info.chip.parentNode.removeChild(info.chip);
        delete window._modalMinimized[modalId];
        _relayoutTaskbarChips(bar);
        if (window.bringModalToFront) window.bringModalToFront(toggleEl.id);
    });
    observer.observe(toggleEl, { attributes: true, attributeFilter: ['style'] });

    window._modalMinimized[modalId] = { toggleEl: toggleEl, prevDisplay: prevDisplay, chip: chip, observer: observer };
};

// 💡 [2026-09-02 개선] ▲ 클릭 시 모달을 열되 칩은 유지 — 잘못 열었을 때 ▼를 다시 누르면
//    칩을 그대로 두고 모달만 다시 접힌다. 칩은 ✕를 눌러야 사라진다(완전히 닫기).
window._restoreModal = function(modalId) {
    const info = window._modalMinimized[modalId];
    if (!info) return;
    const bar = _modalTaskbarEl();
    const restoreBtn = info.chip && info.chip.querySelector('.mtc-restore-btn');

    if (info.isRestored) {
        // ▼ 다시 클릭(또는 더블클릭) → 모달 재최소화, 칩 유지
        if (info.observer) info.observer.disconnect();
        info.toggleEl.style.display = 'none';
        info.isRestored = false;
        if (restoreBtn) { restoreBtn.innerHTML = '<i class="ti ti-chevron-up"></i>'; restoreBtn.title = '복원'; }
        // 외부 코드가 모달을 다시 열면 칩 자동 제거
        info.observer = new MutationObserver(function() {
            if (info.toggleEl.style.display === 'none') return;
            info.observer.disconnect();
            if (!window._modalMinimized[modalId]) return;
            const chip = window._modalMinimized[modalId].chip;
            if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
            delete window._modalMinimized[modalId];
            _relayoutTaskbarChips(bar);
            if (window.bringModalToFront) window.bringModalToFront(info.toggleEl.id);
        });
        info.observer.observe(info.toggleEl, { attributes: true, attributeFilter: ['style'] });
        return;
    }

    // 최초 복원: 모달 열기, 칩 유지, 아이콘 ▲ → ▼
    if (info.observer) info.observer.disconnect();
    info.toggleEl.style.display = info.prevDisplay;
    if (window.bringModalToFront) window.bringModalToFront(info.toggleEl.id);
    info.isRestored = true;
    if (restoreBtn) { restoreBtn.innerHTML = '<i class="ti ti-chevron-down"></i>'; restoreBtn.title = '최소화'; }
    // 모달이 자체 ✕로 닫히면 칩도 자동 제거
    info.observer = new MutationObserver(function() {
        if (info.toggleEl.style.display !== 'none') return;
        info.observer.disconnect();
        if (!window._modalMinimized[modalId]) return;
        const chip = window._modalMinimized[modalId].chip;
        if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
        delete window._modalMinimized[modalId];
        _relayoutTaskbarChips(bar);
    });
    info.observer.observe(info.toggleEl, { attributes: true, attributeFilter: ['style'] });
};

// 모달별 드래그 등록
window._makeDraggable('mail-analyzer-modal', 'mail-drag-handle');
window._makeDraggable('task-inbox-modal',    'inbox-drag-handle');
window._makeDraggable('alarm-settings-modal','alarm-settings-drag-handle');
window._makeDraggable('alarm-modal',         'alarm-modal-drag-handle');
window._makeDraggable('notice-modal',        'notice-modal-header');
// 💡 [2026-08-31 버그 수정] 헤더에 cursor:grab 스타일만 있고 실제 이 등록이 빠져 있어서, 손 모양
//    커서는 보이는데 눌러서 끌어도 전혀 움직이지 않았다("손 표시는 있는데 이동이 안 됨").
window._makeDraggable('alarm-schedule-modal','alarm-schedule-drag');
window._makeDraggable('cal-day-popup-modal', 'cal-day-popup-drag');

// 💡 [2026-09-02 신규] 하단 taskbar에 기본 바로가기 4개 고정 배치
// AI 도구처럼 자주 쓰는 모달을 매번 상단 메뉴에서 찾지 않아도 하단 바에서 바로 열 수 있게.
// ── [2026-09-02 개정] 자주 쓰는 4개 모달 — 페이지 로드 시 최소화 상태로 자동 열기 ──
// 런처 칩(클릭해서 여는 고정 버튼) 대신, 실제 모달을 열고 즉시 최소화해
// B 영역(taskbar)에 실제 최소화 칩으로 표시. ^ 버튼으로 바로 펼칠 수 있음.
(function() {
    var DEFAULTS = [
        { open: function() { if (window.openGanttQaModal)         window.openGanttQaModal(); },          handleId: 'gantt-qa-drag' },
        { open: function() { if (window.showMailAnalyzer)          window.showMailAnalyzer(); },           handleId: 'mail-drag-handle' },
        { open: function() { if (window.openTaskInbox)             window.openTaskInbox(); },              handleId: 'inbox-drag-handle' },
        { open: function() { if (window.openAiProjectSummaryModal) window.openAiProjectSummaryModal(); }, handleId: 'ai-summary-drag' }
    ];

    function _openAndMinimize(entry) {
        try {
            entry.open();
            var handle = document.getElementById(entry.handleId);
            if (!handle) return;
            var minBtn = handle.querySelector('.modal-min-btn');
            if (minBtn) minBtn.click();
        } catch (e) {}
    }

    // DOMContentLoaded 후 300ms — 모든 스크립트 초기화가 끝난 뒤 실행
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            DEFAULTS.forEach(_openAndMinimize);
            _syncTaskbarBounds(_modalTaskbarEl());
            // 💡 window.switchTab 후킹: 탭 전환 후 Summary·TabWrap 높이 변수 재계산
            //    - Summary: display:none → active 될 때 --summary-scroll-top 실측 갱신
            //    - 나머지 탭: --tab-wrap-top 은 #app-main 기준이라 탭과 무관하지만,
            //      has-multi-sheet-bar 클래스 변화 없이도 탭 이동 시 최신값 유지.
            var _origSwitchTab = window.switchTab;
            window.switchTab = function(tabName) {
                if (_origSwitchTab) _origSwitchTab.apply(this, arguments);
                setTimeout(_syncSummaryScrollHeight, 50);
            };
        }, 300);

        // 💡 프로젝트 로딩 시 body.has-multi-sheet-bar 클래스가 추가/제거될 때
        //    #summary-table-scroll 높이를 실측으로 재계산한다.
        //    (멀티시트 바 높이가 달라지면 el.getBoundingClientRect().top 이 자동 반영됨)
        new MutationObserver(function() {
            var bar = _modalTaskbarEl();
            var reserve = bar.children.length > 0 ? (bar.offsetHeight + 15) : 0;
            _syncSummaryScrollHeight();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
})();

// ── 공통: 새로 열리는 모달을 무조건 최상단으로 ──────────────────────────────
// 💡 [2026-09-06 신규] 사용자 제보 — "새 모달을 열었는데 안 열린 것처럼 보인다"는 증상이 반복됨
//    (직전에 고친 _openReassignInbox 버그도 처음엔 이게 원인인가 의심했었음). 실제 원인은 앱 전체
//    모달이 30개+ 있는데, 여는 함수마다 매번 bringModalToFront()를 직접 호출해줘야 맨 앞으로
//    올라오는 구조라 — 실제로 이 호출을 빠뜨린 open 함수가 있으면, 새 모달이 먼저 열려있던 다른
//    모달 "뒤에" 깔린 채로 화면에 뜨는 사고가 난다(모달 자체는 열렸지만 안 보이니 "안 열렸다"로 오인).
//    이 파일이 이미 "모달마다 내부 구조를 몰라도 되는" 범용 처리 철학(위 최소화 기능 참고)이라
//    같은 접근으로 해결: 각 open 함수를 일일이 찾아 고치는 대신, "모달처럼 생긴 요소가 화면에
//    보이기 시작하는 순간"을 전역에서 자동으로 감지해서 최상단으로 올린다 — 이후 새로 추가되는
//    모달도 별도 등록 없이 자동으로 이 규칙을 따른다.
(function() {
    // 모달 오버레이 판별: body의 직계 자식 + position:fixed + 뷰포트를 거의 다 덮는 크기
    // (토스트·배너처럼 작은 고정요소는 제외하기 위한 크기 조건)
    function _looksLikeModalRoot(el) {
        if (!el || el.nodeType !== 1 || el.parentElement !== document.body) return false;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed') return false;
        var r = el.getBoundingClientRect();
        return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
    }
    function _isVisible(el) {
        var d = el.style.display || getComputedStyle(el).display;
        return !!d && d !== 'none';
    }
    var _wasVisible = new WeakSet(); // 안 보임 → 보임으로 "전환되는 순간"에만 올리기 위한 기억
    function _handle(el) {
        if (!_looksLikeModalRoot(el)) return;
        var vis = _isVisible(el);
        if (vis && !_wasVisible.has(el)) {
            _wasVisible.add(el);
            if (window.bringModalToFront) {
                // bringModalToFront는 id로 찾으므로 id가 없는 동적 요소는 즉석에서 직접 처리
                if (el.id) window.bringModalToFront(el.id);
                else { window._topModalZ = (window._topModalZ || 9999) + 1; el.style.zIndex = String(window._topModalZ); }
            }
        } else if (!vis) {
            _wasVisible.delete(el);
        }
    }
    new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.type === 'attributes') {
                _handle(m.target);
            } else if (m.type === 'childList') {
                m.addedNodes.forEach(function(n) { _handle(n); });
            }
        });
    // 💡 [버그 수정] attributes 관찰은 subtree:false면 "document.body 자신"의 속성 변화만 잡고
    //    자식 요소(실제 모달들)의 style 변화는 전혀 못 본다(MutationObserver 명세상 subtree는
    //    "자손의 속성/자식목록까지 볼지"를 결정함) — 그래서 이미 DOM에 있던 모달을 display만
    //    토글해서 열 때(대부분의 실제 모달 패턴)는 이 관찰자가 전혀 반응하지 않는 사각지대가
    //    있었다(테스트로 재현 확인: 새로 append되는 경우만 잡히고 기존 요소 토글은 안 잡힘).
    //    subtree:true로 전체 문서의 속성 변화를 보되, _looksLikeModalRoot의 첫 검사(부모가
    //    document.body인지)가 몸통 비교 한 번으로 즉시 걸러내므로 나머지 무관한 변화(간트 셀
    //    스타일 등)에 대한 추가 비용은 사실상 없다.
    }).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
})();
