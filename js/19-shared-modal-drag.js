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
    return document.getElementById(modalId);
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
//    설정한다. 간격 15px는 상단 "엑셀 시트탭 바"와 최상단 topbar 사이 간격과 동일하게 맞춘 값
//    (직접 측정: #sheet-tabs-bar.top - #app-topbar.bottom === 15px).
function _updateTaskbarReserve(bar) {
    const hasChips = bar.children.length > 0;
    const reserve = hasChips ? (bar.offsetHeight + 15) : 0;
    document.documentElement.style.setProperty('--mt-reserve', reserve + 'px');
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
    if (window._modalMinimized[modalId]) return;
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
    chip.addEventListener('dblclick', function(e) { e.stopPropagation(); window._restoreModal(modalId); });
    bar.appendChild(chip);
    _relayoutTaskbarChips(bar);

    toggleEl.style.display = 'none';
    window._modalMinimized[modalId] = { toggleEl: toggleEl, prevDisplay: prevDisplay, chip: chip };
};

window._restoreModal = function(modalId) {
    const info = window._modalMinimized[modalId];
    if (!info) return;
    info.toggleEl.style.display = info.prevDisplay;
    if (window.bringModalToFront) window.bringModalToFront(info.toggleEl.id);
    const bar = info.chip && info.chip.parentNode;
    if (bar) bar.removeChild(info.chip);
    delete window._modalMinimized[modalId];
    if (bar) _relayoutTaskbarChips(bar);
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
