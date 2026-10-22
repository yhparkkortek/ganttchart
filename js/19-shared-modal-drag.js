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
        // 🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "모달을 끌면 끊겨서 움직인다"]
        //    드래그는 매 프레임 style.left/top 을 쓴다. 그런데 모달마다 style 속성을 보는
        //    MutationObserver 가 걸려 있어(열릴 때 화면 안으로 보정하려고) **그 쓰기마다 깨어나
        //    레이아웃을 다시 재고 테두리 색까지 다시 계산했다** — 실측: 마우스 이동 25회에
        //    clamp 25회. 읽기/쓰기가 매 프레임 겹치니 끊긴다.
        //    → 끄는 게 아니라 **드래그 중에만 쉬게 한다**(놓으면 아래 endDrag 에서 한 번 보정).
        window._mreszDragging = true;
        if (window._mreszSetCursor) window._mreszSetCursor('');   // 리사이즈 커서를 걷어낸다
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
        if (_dragRaf) { cancelAnimationFrame(_dragRaf); _dragRaf = 0; }
        isDragging = false;
        // 🐛 [2026-10-22] 놓을 때 화면 안으로 되돌리던 것을 **뺀다.** 드래그에는 이미 자기 규칙이
        //    있다 — DRAG_MARGIN(40px)만 남으면 일부러 화면 밖으로 내보낼 수 있다. 그런데
        //    _clampModalToViewport 는 **전부** 안으로 들이므로, 가장자리까지 끌고 가 놓으면
        //    손을 떼는 순간 모달이 **되튀었다**. 두 규칙이 싸우면 사람이 둔 자리가 안 지켜진다.
        //    화면 안으로 들이는 일은 "창 크기가 바뀌어 모달이 안 보이게 될 때"만 하면 된다.
        window._mreszDragging = false;
        const handle = document.getElementById(handleId);
        if (handle) handle.style.cursor = 'grab';
    };

    document.addEventListener('mousedown', function(e) {
        const handle = document.getElementById(handleId);
        if (!handle || !handle.contains(e.target)) return;
        // 🐛 [2026-09-13 버그수정] 헤더 안에 슬라이더 등 폼 컨트롤이 들어있는 경우(예: AI 문답 헤더의
        //    투명도 슬라이더), 여기서 무조건 e.preventDefault()를 걸어버리면 그 컨트롤의 네이티브
        //    드래그 동작(예: range input을 마우스로 끌어 값 바꾸기)까지 막혀버려 "슬라이더가 안 움직인다"는
        //    버그가 됐다. 폼 컨트롤 위에서 시작된 mousedown은 창 드래그로 가로채지 않고 그대로 흘려보낸다.
        if (e.target.closest('input, select, textarea')) return;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        startDrag(e.clientX, e.clientY, handle, modal);
        e.preventDefault();
    });
    // ⚡ [2026-10-22] 이동도 리사이즈와 같게 **프레임당 한 번**만 쓴다(rAF 묶음).
    //    좌표는 마지막 것만 쓰므로 따라오는 정확도는 그대로다.
    let _dragX = 0, _dragY = 0, _dragRaf = 0;
    const _flushDrag = function() { _dragRaf = 0; moveDrag(_dragX, _dragY); };
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        _dragX = e.clientX; _dragY = e.clientY;
        if (!_dragRaf) _dragRaf = requestAnimationFrame(_flushDrag);
    });
    document.addEventListener('mouseup', endDrag);

    // 💡 터치 버전 — touchmove는 { passive:false }로 등록해야 드래그 중 e.preventDefault()로
    //    배경(페이지 전체) 스크롤을 막을 수 있다(기본은 passive:true라 무시됨).
    document.addEventListener('touchstart', function(e) {
        const handle = document.getElementById(handleId);
        if (!handle || !handle.contains(e.target)) return;
        if (e.target.closest('input, select, textarea')) return; // 위 mousedown과 동일 이유
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

    // 💡 [2026-10-21 신규] 상하좌우 8방향 크기조절 + 화면 밖 이탈 방지.
    //    드래그를 등록하는 모든 모달에 자동으로 함께 적용된다(_makeMinimizable과 같은 방식).
    window._makeResizable(modalId, false, handleId);
};

// ══════════════════════════════════════════════════════════════════════
// 💡 [2026-10-21 신규, 사용자 요청] 모달 크기조절을 모서리 하나가 아니라 상하좌우 전부에서.
//    그동안은 각 모달 인라인 스타일의 CSS `resize:both`에 의존해서 **오른쪽 아래 모서리로만**
//    늘릴 수 있었고, 그나마도 아래로 늘리면 화면 밖으로 넘어가 하단 버튼을 못 누르는 일이 있었다.
//    → 8방향 손잡이를 직접 붙이고(위/아래/좌/우 + 네 모서리), 동시에 "항상 화면 안"을 보장한다.
//    _makeDraggable을 거치는 모달 전부에 적용되므로 모달마다 따로 작업할 필요가 없다.
// ══════════════════════════════════════════════════════════════════════
window._resizableBoxIds = window._resizableBoxIds || [];

/** 박스를 화면 안으로 되돌린다 — 넘치면 크기를 줄이고, 그 다음 위치를 민다. */
window._clampModalToViewport = function(box) {
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;              // 숨겨져 있으면 건드리지 않는다
    const GAP = 6;                                   // 화면 가장자리 여백
    const maxW = Math.max(240, window.innerWidth  - GAP * 2);
    const maxH = Math.max(160, window.innerHeight - GAP * 2);
    let w = r.width, h = r.height, left = r.left, top = r.top;
    let changed = false;

    if (w > maxW) { w = maxW; changed = true; }
    if (h > maxH) { h = maxH; changed = true; }
    if (left + w > window.innerWidth - GAP) { left = window.innerWidth - GAP - w; changed = true; }
    if (top  + h > window.innerHeight - GAP) { top  = window.innerHeight - GAP - h; changed = true; }
    if (left < GAP) { left = GAP; changed = true; }
    if (top  < GAP) { top  = GAP; changed = true; }
    if (!changed) return;                            // 잘 들어가 있으면 그대로 둔다(중앙 정렬 유지)

    // transform으로 중앙 정렬된 상태면 실제 좌표로 고정한 뒤 옮긴다
    box.style.transform = 'none';
    box.style.left   = left + 'px';
    box.style.top    = top  + 'px';
    box.style.width  = w + 'px';
    box.style.height = h + 'px';
    // 높이를 강제로 줄였으니 내부가 스크롤될 수 있어야 한다
    if (!box.style.maxHeight) box.style.maxHeight = 'none';
};

// 🐛🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "창 크기 바꾸면 모달이 안으로 들어오던 게 없어졌다"]
//    "보이는가"를 `offsetParent !== null` 로 판정하고 있었다. 그런데 **`offsetParent` 는
//    `position:fixed` 요소에서 항상 null 이다** — 이 앱의 모달은 전부 fixed 라, 모든 모달이
//    "숨김"으로 떨어져 clamp 가 **한 번도 돌지 않았다**(실측: 화면 밖 276px 로 밀어내고
//    _clampAllModals 를 불러도 꿈쩍 안 함). 열릴 때 보정(onShown)도 같은 이유로 죽어 있었다.
//    → 크기와 display/visibility 로 판정한다.
window._mreszIsShown = function(el) {
    if (!el) return false;
    if (!el.offsetWidth && !el.offsetHeight) return false;   // display:none 이면 둘 다 0
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
};

window._clampAllModals = function() {
    window._resizableBoxIds.forEach(function(id) {
        const el = document.getElementById(id);
        if (window._mreszIsShown(el)) window._clampModalToViewport(el);
    });
};

window._makeResizable = function(boxId, _retry, handleId) {
    const box = document.getElementById(boxId);
    // 일부 모달은 박스를 나중에 만들면서 _makeDraggable을 먼저 부른다(드래그는 핸들러 안에서
    // getElementById를 해서 괜찮지만, 여기선 지금 요소가 있어야 한다) — 한 번만 미뤄 재시도.
    if (!box) {
        if (!_retry) setTimeout(function() { window._makeResizable(boxId, true, handleId); }, 300);
        return;
    }
    if (box.dataset.mresz === '1') return;
    box.dataset.mresz = '1';
    if (window._resizableBoxIds.indexOf(boxId) === -1) window._resizableBoxIds.push(boxId);

    // 기존 CSS resize는 끈다 — 두 방식이 겹치면 모서리에서 네이티브가 먼저 먹어 서로 싸운다
    box.style.resize = 'none';
    if (window._installModalResizeHost) window._installModalResizeHost();
    // 🎨 외곽 테두리(**헤더 배경색**) — 드래그를 등록하는 모달 전부에 자동 적용된다
    if (window._mreszEnsureBorderStyle) {
        window._mreszEnsureBorderStyle();
        box.classList.add('mresz-modal');
        window._mreszHeaderIds[boxId] = handleId || '';
        window._mreszApplyBorder(boxId);
    }

    // 🐛 [2026-10-21 버그수정, 사용자 제보 "버튼이 안 눌린다"]
    //    처음엔 8방향 손잡이를 <div>로 박스 안쪽 가장자리에 깔았다. 그 투명한 띠가 바로 아래에 있는
    //    버튼·스크롤바 위를 덮어 클릭을 먹었다(보관함 하단 버튼들이 대표적).
    //    → 덮개를 아예 두지 않는다. 박스 위에서 마우스가 "가장자리 몇 px 안"에 있는지를 그때그때
    //    계산해서 커서를 바꾸고, 그 상태에서 누를 때만 리사이즈로 가로챈다. 화면을 가리는 요소가
    //    없으므로 어떤 버튼도 막힐 수 없다. 게다가 버튼/입력 위에서는 아예 가로채지 않는다.
    // 🐛🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "상하좌우 늘리고 줄이기가 안 된다"]
    //    띠를 박스 **안쪽**에만 두면, 내용이 넘쳐 스크롤바가 생긴 모달에서는 오른쪽·아래
    //    6px이 통째로 **스크롤바에 덮인다.** 크롬(윈도우)의 고전 스크롤바는 15px 자리를
    //    실제로 차지하고, 그 위를 누르면 **페이지에 mousedown 이 오지 않는다** — 그래서
    //    리사이즈가 영영 시작되지 않는다(개발용 브라우저는 오버레이 스크롤바라 재현이 안 돼
    //    "되는데요"가 나왔다. 실측 환경 차이를 먼저 의심할 것).
    //    → 잡는 띠를 **박스 바깥 링**으로 옮긴다. 바깥엔 스크롤바도 버튼도 없으므로 아무것도
    //      가리지 않고, 예전의 "버튼이 안 눌린다" 사고도 구조적으로 재발할 수 없다.
    //      안쪽 띠는 아주 얇게(EDGE_IN) 남겨 둔다 — 화면 가장자리에 붙은 모달은 바깥 링이
    //      화면 밖이라 잡을 수 없기 때문. 안쪽 띠에서는 예전처럼 isInteractive 가 양보한다.
    //    ⚠️ 바깥 링은 박스 밖이라 **박스에 건 리스너로는 안 잡힌다** — 그래서 아래 전역
    //      핸들러(_installModalResizeHost)가 document 에서 처리한다.
    // 💡 [2026-10-22 3차, 사용자 제보 "커서가 바뀌는 구간이 모달 밖에 있다"]
    //    16/10 은 바깥으로 치우쳐 있었다. 사람은 **모달 테두리 그 자체**를 잡는다고 생각하므로,
    //    테두리가 띠의 **한가운데**여야 손이 가는 곳과 잡히는 곳이 일치한다. → 13/13 대칭.
    //    (총 폭 26px 는 그대로 — 2차에서 넓힌 만큼은 유지하고 중심만 테두리로 옮긴 것이다.)
    //    ⚠️ 이 숫자는 **보이는 테두리가 아니라 투명한 판정 영역**이다 — 그려지는 것이 없고
    //       모달 모양은 그대로다.
    //    바깥 절반이 있어야 하는 이유: 안쪽 절반은 스크롤바에 덮일 수 있다(스크롤바 위를 누르면
    //    페이지에 mousedown 이 오지 않는다 — 2026-10-22 1차 수정 주석 참고).
    //    안쪽 절반이 있어야 하는 이유: 화면 가장자리에 붙은 모달은 바깥쪽이 화면 밖이라 못 잡는다.
    //    모서리(대각선)는 두 축이 동시에 걸리는 지점이라 자동으로 26px 정사각형이 된다.
    const EDGE_OUT = 13;                  // 박스 **바깥**으로 잡히는 두께(px)
    const EDGE_IN  = 13;                  // 박스 **안쪽**으로 잡히는 두께(px) — 버튼 위에서는 isInteractive 가 양보
    const EDGE = 6;                       // (호환) 예전 상수 — dirAt 은 위 두 값을 쓴다
    const minW = parseInt(box.style.minWidth, 10)  || 280;
    const minH = parseInt(box.style.minHeight, 10) || 160;
    let hoverDir = '';
    let rs = null;

    const dirAt = function(x, y) {
        const r = box.getBoundingClientRect();
        if (!r.width || !r.height) return '';
        // 바깥 링 + 얇은 안쪽 띠. 박스 한가운데는 당연히 제외된다.
        if (x < r.left - EDGE_OUT || x > r.right + EDGE_OUT ||
            y < r.top  - EDGE_OUT || y > r.bottom + EDGE_OUT) return '';
        const inX = x > r.left + EDGE_IN && x < r.right  - EDGE_IN;
        const inY = y > r.top  + EDGE_IN && y < r.bottom - EDGE_IN;
        if (inX && inY) return '';        // 내용 한복판 — 손대지 않는다
        let d = '';
        if (y >= r.top    - EDGE_OUT && y <= r.top    + EDGE_IN) d += 'n';
        if (y >= r.bottom - EDGE_IN  && y <= r.bottom + EDGE_OUT) d += 's';
        if (x >= r.left   - EDGE_OUT && x <= r.left   + EDGE_IN) d += 'w';
        if (x >= r.right  - EDGE_IN  && x <= r.right  + EDGE_OUT) d += 'e';
        return d;
    };
    /** 그 점이 박스 **바깥**인가 — 바깥이면 버튼/스크롤바가 있을 수 없어 양보할 필요가 없다. */
    const isOutside = function(x, y) {
        const r = box.getBoundingClientRect();
        return x < r.left || x > r.right || y < r.top || y > r.bottom;
    };
    box._mreszProbe = function(x, y) {    // 전역 핸들러가 이 박스에게 묻는 창구
        // ⚡ [2026-10-22] 등록된 모달이 13개쯤 되는데, 마우스를 움직일 때마다 전부에게 물어본다.
        //    그래서 **싼 것부터** 본다: 크기(0이면 숨김) → 가장자리 판정 → 그제서야 getComputedStyle.
        //    예전엔 포인터와 아무 상관 없는 모달까지 전부 style 계산을 돌렸다.
        if (box.offsetWidth === 0 && box.offsetHeight === 0) return '';
        const d = dirAt(x, y);
        if (!d) return '';
        const cs = window.getComputedStyle(box);
        if (cs.display === 'none' || cs.visibility === 'hidden') return '';
        return d;
    };
    box._mreszStart = function(dir, x, y) { startResize(dir, x, y); };
    box._mreszOutside = isOutside;
    box._mreszInteractive = function(t) { return isInteractive(t); };
    box._mreszCursorFor = function(d) { return cursorFor(d); };
    const cursorFor = function(d) {
        if (d === 'n' || d === 's') return 'ns-resize';
        if (d === 'e' || d === 'w') return 'ew-resize';
        if (d === 'nw' || d === 'se') return 'nwse-resize';
        if (d === 'ne' || d === 'sw') return 'nesw-resize';
        return '';
    };
    // 가장자리라도 "누를 수 있는 것" 위면 리사이즈로 가로채지 않는다 — 클릭이 최우선.
    // 🐛 [2026-10-21 보강, 사용자 제보 "버튼 위에서 커서가 리사이즈로 바뀐다"]
    //    처음엔 태그·클래스 목록으로만 판정했는데, 이 앱은 <span>·<div>에 onclick과 cursor:pointer를
    //    직접 붙여 쓰는 곳이 많아서 목록이 계속 새어 나간다(칩·배지·토글 등). 목록을 늘리는 대신
    //    **이미 손가락 커서인 요소면 무조건 양보**한다 — 눌릴 수 있게 만들어 둔 것은 전부 걸러진다.
    const isInteractive = function(t) {
        if (!t || !t.closest) return false;
        // 🐛🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "모달 동작이 부자연스럽다"]
        //    헤더는 **끌어서 옮기는 면**이다. 그런데 헤더(높이 55px)의 위쪽 13px 이 리사이즈 띠와
        //    겹쳐서, 헤더를 잡으면 **드래그와 리사이즈가 동시에 시작**됐다(실측: 상단+3px·+10px 에서
        //    _mreszActive=true). 둘이 매 프레임 같은 left/top/height 를 서로 다르게 쓰니 어색할 수밖에.
        //    → 모달 **안쪽**에서는 헤더가 이긴다. 위쪽 변 리사이즈는 모달 **바깥** 절반에서 하면 된다
        //      (바깥엔 헤더가 없다). 버튼에 양보하는 것과 같은 원리다.
        const _hid = window._mreszHeaderIds && window._mreszHeaderIds[boxId];
        const _h = _hid && document.getElementById(_hid);
        if (_h && _h.contains(t)) return true;
        if (t.closest('button, input, select, textarea, a, label, summary, [onclick], [role="button"]')) return true;
        try {
            // 자기 자신부터 박스까지 올라가며 pointer 커서가 있으면 클릭 대상으로 본다
            let el = t;
            while (el && el !== box) {
                if (window.getComputedStyle(el).cursor === 'pointer') return true;
                el = el.parentElement;
            }
        } catch (e) { /* 계산 실패 시엔 아래 가장자리 판정으로 넘어간다 */ }
        return false;
    };

    box.addEventListener('mousemove', function(e) {
        // 🐛 [2026-10-22] `rs`(리사이즈 중)만 보고 **드래그 중은 안 봤다.** 헤더를 잡고 끌면
        //    포인터가 모달 위쪽 13px(=리사이즈 띠) 안에 있기 십상인데, 그때마다 여기서
        //    `ns-resize` 를 `!important` 로 덮어써서 드래그 커서(grabbing)와 **깜빡였다.**
        //    모달이 포인터 밑에서 움직이니 매 프레임 바뀐다 — 끌 때 느껴지던 어색함의 정체.
        if (rs || window._mreszDragging) return;
        // ⚡ [2026-10-22] 순서를 바꿨다 — 예전엔 isInteractive 를 **먼저** 불러서, 가장자리 근처가
        //    아닌 한복판에서도 마우스를 움직일 때마다 조상 사슬을 타고 getComputedStyle 을 돌렸다.
        //    먼저 dirAt(사각형 비교 한 번)으로 거르고, 가장자리일 때만 비싼 검사를 한다.
        const d0 = dirAt(e.clientX, e.clientY);
        const d = (d0 && !isInteractive(e.target)) ? d0 : '';
        hoverDir = d;
        // ⚠️ 여기서 `d === hoverDir` 로 조기 반환하면 안 된다 — 전역 핸들러가 지운 뒤에도
        //    기억만 같아서 다시 칠하지 못한다. 중복 호출은 _mreszSetCursor 가 알아서 걸러낸다.
        window._mreszSetCursor(cursorFor(d));   // 빈 문자열이면 원래 커서로 돌아간다
    });
    box.addEventListener('mouseleave', function() {
        if (rs) return;
        hoverDir = ''; window._mreszSetCursor('');
    });

    const startResize = function(dir, x, y) {
        const r = box.getBoundingClientRect();
        // 중앙 정렬(transform)을 실제 좌표로 확정해야 리사이즈 중 튀지 않는다
        box.style.transform = 'none';
        box.style.left = r.left + 'px';
        box.style.top  = r.top  + 'px';
        box.style.maxHeight = 'none';   // max-height가 걸려 있으면 세로가 안 늘어난다
        box.style.maxWidth  = 'none';
        rs = { dir: dir, x: x, y: y, left: r.left, top: r.top, w: r.width, h: r.height };
        document.body.style.userSelect = 'none';
        // 바깥 링 핸들러가 끼어들지 않게 — 끄는 쪽은 endResize 하나뿐이다
        window._mreszActive = true;
        window._mreszSetCursor(cursorFor(dir));
    };
    const moveResize = function(x, y) {
        if (!rs) return;
        const GAP = 6, dx = x - rs.x, dy = y - rs.y;
        let left = rs.left, top = rs.top, w = rs.w, h = rs.h;
        if (rs.dir.indexOf('e') !== -1) w = rs.w + dx;
        if (rs.dir.indexOf('s') !== -1) h = rs.h + dy;
        if (rs.dir.indexOf('w') !== -1) { w = rs.w - dx; left = rs.left + dx; }
        if (rs.dir.indexOf('n') !== -1) { h = rs.h - dy; top  = rs.top  + dy; }
        // 최소 크기 — 왼쪽/위로 줄일 때는 좌표도 같이 되돌려야 반대편 변이 밀리지 않는다
        if (w < minW) { if (rs.dir.indexOf('w') !== -1) left = rs.left + (rs.w - minW); w = minW; }
        if (h < minH) { if (rs.dir.indexOf('n') !== -1) top  = rs.top  + (rs.h - minH); h = minH; }
        // 화면 밖으로 못 나가게 — 가장자리를 넘으면 그 변은 거기서 멈춘다
        if (left < GAP) { w -= (GAP - left); left = GAP; }
        if (top  < GAP) { h -= (GAP - top);  top  = GAP; }
        if (left + w > window.innerWidth  - GAP) w = window.innerWidth  - GAP - left;
        if (top  + h > window.innerHeight - GAP) h = window.innerHeight - GAP - top;
        if (w < minW) w = minW;
        if (h < minH) h = minH;
        box.style.left   = left + 'px';
        box.style.top    = top  + 'px';
        box.style.width  = w + 'px';
        box.style.height = h + 'px';
    };
    const endResize = function() {
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
        if (!rs) return;
        rs = null;
        document.body.style.userSelect = '';
        window._mreszSetCursor('');
        window._mreszActive = false;
        box.style.cursor = '';
        hoverDir = '';
    };

    box.addEventListener('mousedown', function(e) {
        if (isInteractive(e.target)) return;            // 버튼/입력이 항상 이긴다
        const d = dirAt(e.clientX, e.clientY);
        if (!d) return;
        startResize(d, e.clientX, e.clientY);
        // preventDefault만 — stopPropagation까지 하면 _bindClickToFront(맨 앞으로)가 안 걸린다
        e.preventDefault();
    });
    box.addEventListener('touchstart', function(e) {
        if (!e.touches.length || isInteractive(e.target)) return;
        const t = e.touches[0];
        const d = dirAt(t.clientX, t.clientY);
        if (!d) return;
        startResize(d, t.clientX, t.clientY);
    }, { passive: true });

    // ⚡ [2026-10-22, 사용자 제보 "크기 변경이 부자연스럽다"] 마우스 이동마다 바로 쓰지 않고
    //    **프레임당 한 번**만 쓴다(rAF 묶음). 이동은 위치만 바뀌지만 크기 변경은 모달 **내용 전체가
    //    다시 배치**된다 — 브라우저는 mousemove 를 프레임보다 자주 줄 수 있어서, 그때마다 쓰면
    //    한 프레임에 레이아웃이 여러 번 돈다. 좌표는 마지막 것만 쓰므로 따라오는 정확도는 그대로다
    //    (실측: 기대값과 오차 0, 뒤로 가는 구간 없음).
    let _pendX = 0, _pendY = 0, _rafId = 0;
    const _flushResize = function() {
        _rafId = 0;
        if (rs) moveResize(_pendX, _pendY);
    };
    document.addEventListener('mousemove', function(e) {
        if (!rs) return;
        _pendX = e.clientX; _pendY = e.clientY;
        if (!_rafId) _rafId = requestAnimationFrame(_flushResize);
    });
    document.addEventListener('mouseup', endResize);
    document.addEventListener('touchmove', function(e) {
        if (!rs || !e.touches.length) return;
        moveResize(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', endResize);
    document.addEventListener('touchcancel', endResize);

    // 열릴 때마다 화면 안으로 — 모달마다 "무엇의 display를 바꿔 여는지"가 제각각이라(박스 자신일 수도,
    // 바깥 오버레이일 수도) 둘 다 관찰한다. _makeMinimizable이 ✕ 버튼에서 대상을 알아내는 것과 같은 사정.
    const onShown = function() {
        // 드래그·리사이즈 중엔 style 이 매 프레임 바뀐다 — 그때마다 레이아웃을 다시 재면 끊긴다.
        if (window._mreszDragging || window._mreszActive) return;
        if (!window._mreszIsShown(box)) return;
        requestAnimationFrame(function() {
            window._clampModalToViewport(box);
            // 헤더가 열릴 때 그려지는 모달이 있어, 보일 때 색을 다시 읽는다(숨어 있으면 못 읽는다)
            if (window._mreszApplyBorder) window._mreszApplyBorder(boxId);
        });
    };
    try {
        new MutationObserver(onShown).observe(box, { attributes: true, attributeFilter: ['style', 'class'] });
        if (box.parentElement) {
            new MutationObserver(onShown).observe(box.parentElement, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    } catch (e) { /* 구형 브라우저 — 창 크기 변경 시 보정은 아래에서 계속 동작 */ }
};

// ══════════════════════════════════════════════════════════════════════
// 💡 [2026-10-22] 모달 **바깥 링**을 잡는 전역 핸들러.
//    박스에 건 리스너는 박스 **안**에서만 울린다 — 바깥 링은 document 에서 받아야 한다.
//    안쪽 띠는 기존 박스 리스너가 그대로 처리하므로, 여기서는 **바깥일 때만** 끼어든다
//    (두 경로가 같은 점을 두고 다투지 않게 하는 선이 `_mreszOutside`다).
// ══════════════════════════════════════════════════════════════════════
// 🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "잡히는 구간 진입이 살짝 느리다"]
//    예전엔 `document.body.style.cursor` 로 커서를 바꿨다. 그런데 `cursor` 는 **상속**이라
//    자기 커서를 따로 가진 요소(오버레이·버튼·입력칸 등) 위에서는 body 값이 **무시된다.**
//    그래서 모달 밖 링에서는 커서가 바뀌는 자리와 안 바뀌는 자리가 섞여 "느리다/안 잡힌다"로
//    느껴졌다. → `<html>` 에 클래스를 걸고 `!important` 로 **전부 덮는다**(드래그·리사이즈의 표준 방식).
// 🎨 [2026-10-22 신규, 사용자 지정] 모달 **외곽 테두리 = 그 모달 헤더의 배경색.**
//
//  모달마다 헤더 색이 다르므로(팔레트·공지 모달은 크림색, AI 문답은 연파랑) 테두리도
//  모달마다 다르다 — 그게 의도다. 헤더와 테두리가 한 벌로 보인다.
//  ⚠️ 색이 **계산값**(computed)이라 CSS 변수처럼 저절로 따라가지 못한다 → 팔레트가 바뀌면
//     다시 칠해야 한다. js/21 이 팔레트를 적용할 때마다 `<style id="cp-live-style">` 의 내용을
//     갈아끼우므로, 그걸 지켜보다가 다시 칠한다(js/21 을 건드리지 않아도 된다).
window._mreszHeaderIds = window._mreszHeaderIds || {};   // modalId → headerId

/** 첨부(기안 작성 모달)와 같은 틀 색 — **헤더 아래 경계선 색**을 쓴다.
 *
 *  ⚠️ 이게 "헤더 색"이다. 헤더 **배경**을 쓰면 안 된다 — 실측하면 둘이 다르고, 첨부의
 *     테두리는 배경이 아니라 아래 경계선 쪽이다:
 *       기안 작성 모달 : 헤더 배경 #e7f3ff / 아래선 #a5c8f0 ← 첨부의 테두리
 *       공지·팔레트 등 : 헤더 배경 #fff8e6 / 아래선 #ffe08a
 *     배경을 쓰면 테두리가 헤더보다 연해서 틀로 안 보인다(그래서 "새로운 스타일"이 됐다).
 *     아래선을 쓰면 모달마다 **자기 헤더와 한 벌**인 틀이 되고, 첨부 모달은 지금 모습 그대로다.
 *  경계선이 없으면 헤더 배경 → 팔레트 강조색 순으로 떨어진다.
 */
window._mreszHeaderBg = function(box, headerId) {
    const header = (headerId && document.getElementById(headerId)) || box.firstElementChild;
    const TRANSPARENT = /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$|^transparent$/;
    if (header) {
        const hs = window.getComputedStyle(header);
        const line = hs.borderBottomColor;
        if (parseFloat(hs.borderBottomWidth) > 0 && hs.borderBottomStyle !== 'none'
            && line && !TRANSPARENT.test(line)) return line;
    }
    let el = header || box;
    for (let hop = 0; el && hop < 4; hop++, el = el.parentElement) {
        const bg = window.getComputedStyle(el).backgroundColor;
        if (bg && !TRANSPARENT.test(bg)) return bg;
        if (el === box) break;                    // 모달 자신까지 보고 그만둔다
    }
    return '';
};

window._mreszApplyBorder = function(boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const col = window._mreszHeaderBg(box, window._mreszHeaderIds[boxId]);
    // 모달 상당수가 인라인 style 로 자기 테두리를 갖고 있어 `important` 가 필요하다.
    box.style.setProperty('border-color', col || 'var(--trans-text, #00707d)', 'important');
};

window._mreszApplyAllBorders = function() {
    (window._resizableBoxIds || []).forEach(function(id) { window._mreszApplyBorder(id); });
};

/** 팔레트가 바뀌면 다시 칠한다 — js/21 이 갈아끼우는 <style id="cp-live-style"> 을 지켜본다. */
window._mreszWatchPalette = function() {
    if (window._mreszPaletteWatched) return;
    const tag = document.getElementById('cp-live-style');
    if (!tag) { setTimeout(window._mreszWatchPalette, 500); return; }   // 아직 안 만들어졌으면 기다린다
    window._mreszPaletteWatched = true;
    let timer = null;
    new MutationObserver(function() {
        clearTimeout(timer);
        timer = setTimeout(window._mreszApplyAllBorders, 60);   // 한 번 적용에 여러 번 바뀌므로 묶는다
    }).observe(tag, { childList: true, characterData: true, subtree: true });
};

window._mreszEnsureBorderStyle = function() {
    if (document.getElementById('mresz-border-style')) return;
    const st = document.createElement('style');
    st.id = 'mresz-border-style';
    // 굵기·모양은 **첨부 모달과 같게** 1px solid. 색은 모달마다 다르므로 인라인으로 칠한다.
    st.textContent = '.mresz-modal { border-width: 1px !important; border-style: solid !important;'
                   + ' box-sizing: border-box; }';
    document.head.appendChild(st);
    if (window._mreszWatchPalette) window._mreszWatchPalette();
};

window._mreszSetCursor = function(cur) {
    const root = document.documentElement;
    if (!document.getElementById('mresz-cursor-style')) {
        const st = document.createElement('style');
        st.id = 'mresz-cursor-style';
        st.textContent = ['ns-resize', 'ew-resize', 'nwse-resize', 'nesw-resize'].map(function(c) {
            return 'html.mresz-' + c + ', html.mresz-' + c + ' * { cursor: ' + c + ' !important; }';
        }).join('\n');
        document.head.appendChild(st);
    }
    if (root._mreszCur === cur) return;          // 같은 커서면 DOM 을 건드리지 않는다
    if (root._mreszCur) root.classList.remove('mresz-' + root._mreszCur);
    if (cur) root.classList.add('mresz-' + cur);
    root._mreszCur = cur || '';
};

window._installModalResizeHost = function() {
    if (window._mreszHostOn) return;
    window._mreszHostOn = true;

    /** 그 점에서 잡을 수 있는 박스를 고른다 — 겹쳐 있으면 **위에 있는 것**(z-index). */
    const pick = function(x, y) {
        let best = null, bestZ = -Infinity;
        (window._resizableBoxIds || []).forEach(function(id) {
            const el = document.getElementById(id);
            if (!el || typeof el._mreszProbe !== 'function') return;
            if (!el._mreszOutside(x, y)) return;          // 안쪽은 박스 리스너 담당
            const d = el._mreszProbe(x, y);
            if (!d) return;
            const z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
            if (z >= bestZ) { bestZ = z; best = { el: el, dir: d }; }
        });
        return best;
    };

    let hoverEl = null;
    document.addEventListener('mousemove', function(e) {
        // 리사이즈 중엔 박스 핸들러가 몰고 가고, 드래그 중엔 등록된 모달 전부를 훑을 이유가 없다
        if (window._mreszActive || window._mreszDragging) return;
        const hit = pick(e.clientX, e.clientY);
        if (!hit) {
            // 🐛 [2026-10-22] 포인터가 **모달 안쪽**이면 커서는 박스 핸들러가 칠한다 — 여기서
            //    지우면 안 된다. 박스 리스너가 먼저(타깃 단계), 이 document 리스너가 나중에
            //    울리므로, 그냥 지우면 **안쪽 절반에서 커서가 영영 안 바뀐다**(실측으로 잡음).
            const inside = (window._resizableBoxIds || []).some(function(id) {
                const el = document.getElementById(id);
                return el && typeof el._mreszOutside === 'function'
                    && (el.offsetWidth || el.offsetHeight)
                    && !el._mreszOutside(e.clientX, e.clientY);
            });
            if (!inside && hoverEl !== null) { window._mreszSetCursor(''); hoverEl = null; }
            return;
        }
        hoverEl = hit.el;
        window._mreszSetCursor(hit.el._mreszCursorFor(hit.dir) || '');
    });

    document.addEventListener('mousedown', function(e) {
        const hit = pick(e.clientX, e.clientY);
        if (!hit) return;
        hit.el._mreszStart(hit.dir, e.clientX, e.clientY);
        e.preventDefault();                               // 바깥 링엔 누를 것이 없다
    }, true);                                             // capture — 뒤에 깔린 것이 먼저 먹지 않게

    document.addEventListener('mouseup', function() {
        if (hoverEl) { window._mreszSetCursor(''); hoverEl = null; }
    });

    document.addEventListener('touchstart', function(e) {
        if (!e.touches.length) return;
        const t = e.touches[0];
        const hit = pick(t.clientX, t.clientY);
        if (hit) hit.el._mreszStart(hit.dir, t.clientX, t.clientY);
    }, { passive: true, capture: true });
};

// 파일이 다 읽히는 즉시 한 번 — _makeResizable 안의 호출은 그보다 먼저 일어날 수 있다.
window._installModalResizeHost();

// 💡 [2026-10-22] `_makeDraggable`을 거치지 않아 크기조절이 안 걸려 있던 모달들.
//    **데이터로 적는다**(코드에 if 를 늘리지 않는다 — CLAUDE.md). 요소가 없으면 조용히 건너뛴다.
window.RESIZABLE_EXTRA_MODALS = window.RESIZABLE_EXTRA_MODALS || [
    'drive-file-modal',     // 구글 드라이브 프로젝트 열기
    'inbox-dist-modal',     // 보관함 → 프로젝트 배분
    'cal-sync-help-modal'   // 캘린더 동기화 도움말
];
document.addEventListener('DOMContentLoaded', function() {
    (window.RESIZABLE_EXTRA_MODALS || []).forEach(function(id) {
        if (document.getElementById(id)) window._makeResizable(id);
    });
});

window.addEventListener('resize', function() {
    clearTimeout(window._clampModalsTimer);
    window._clampModalsTimer = setTimeout(window._clampAllModals, 120);
});

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
// 💡 [2026-09-11 버그 수정] 이전 코드는 cand의 직계 TEXT_NODE만 읽어서
//    <span>💬 <span id="qa-title">AI 문답</span></span> 구조에서 "💬" 이모지만
//    잡고 멈췄다(서브 span 텍스트 누락) → 칩 라벨이 이모지 하나만 나오는 버그.
//    cloneNode로 버튼·말풍선 도움말 요소를 제거한 뒤 전체 textContent를 읽어 정확한 제목을 추출.
function _modalTitleFor(handle, modalId) {
    if (!handle) return modalId;
    const cand = handle.querySelector('span, h3, strong');
    let text = '';
    if (cand) {
        var clone = cand.cloneNode(true);
        var removeEls = clone.querySelectorAll('button, .modal-min-btn, .inbox-help-ico, .modal-icon-btn');
        for (var ri = 0; ri < removeEls.length; ri++) {
            if (removeEls[ri].parentNode) removeEls[ri].parentNode.removeChild(removeEls[ri]);
        }
        text = clone.textContent;
    } else {
        text = handle.textContent;
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 20) : modalId;
}

// 🐛 [2026-09-11 버그 수정] "여러 프로젝트를 오가며 이런저런 모달을 연 뒤, AI 문답을 타스크바에서
//    복원하면 화살표(▲/▼)는 정상적으로 바뀌는데 창 자체는 안 보인다" 제보의 원인 — AI 문답은
//    toggleTarget이 실제 열고닫히는 바깥 오버레이(gantt-qa-modal)가 아니라 그 자식 박스
//    (gantt-qa-box)라서(_modalToggleTarget 참고), 복원 시 bringModalToFront(toggleEl.id)를 그대로
//    부르면 "박스" 자신의 z-index만 올라간다. 그런데 바깥 오버레이가 이미 자체 z-index를 갖고 있어
//    별도의 쌓임 맥락(stacking context)을 만들어버리므로, 그 안의 자식 z-index를 아무리 올려도
//    "다른 모달과 비교했을 때"는 전혀 반영되지 않는다(바깥 오버레이의 z-index가 그대로 상한선).
//    그 결과 AI 문답보다 나중에 연 다른 모달(예: 우선순위 점수 설정 등)이 있으면 그 뒤에 가려진 채
//    "열렸지만 안 보이는" 상태가 됨 — 어떤 모달을 그 사이에 열었었는지에 따라 달라지니 "특정 경우를
//    확정할 수 없다"는 제보와도 일치. 진짜 오버레이 조상(.modal-overlay 클래스가 붙어있거나, body의
//    직계 자식인 지점)까지만 거슬러 올라가서 그 요소를 최상단으로 올리도록 고친다 — toggleTarget이
//    이미 그 오버레이 자신인 대다수 모달은 한 바퀴만 돌고 자기 자신을 그대로 반환하므로 동작 변화 없음.
//    🐛 [2026-09-11 버그 수정 2] 처음엔 "body 직계 자식까지"만 보고 멈췄는데, task-inbox-overlay처럼
//    body가 아니라 #app-main 밑에 정적으로 박혀 있는 오버레이도 있어서(반대로 이런 건 body 직계
//    자식으로 착각하고 #app-main까지 계속 더 올라가버려 엉뚱한 요소의 z-index를 건드릴 뻔했다) —
//    ".modal-overlay" 클래스를 우선 신호로 먼저 확인하도록 고쳤다.
//    🐛 [2026-09-11 버그 수정 3] 그런데 그 보조 신호("일단 부모가 있으면 한 칸 더 올라가고, body
//    직계 자식에서 멈춘다")가 너무 느슨했다 — alarm-modal/alarm-settings-modal/alarm-schedule-modal/
//    notice-modal처럼 ".modal-overlay" 클래스도 없고 애초에 감싸는 오버레이 래퍼 자체가 없이(자기
//    자신이 이미 최상위 모달 박스) 그냥 #app-main 아래 나란히 배치된 정적 HTML 모달들까지, 부모가
//    #app-main이라는 이유만으로 그 #app-main까지 잘못 걸어 올라가서 최소화 시 앱 전체 화면
//    (#app-main)을 통째로 숨겨버리는 훨씬 심각한 회귀를 만들 뻔했다(실측 테스트로 발견).
//    실제 오버레이 래퍼와 "그냥 어쩌다 안에 있는 평범한 레이아웃 컨테이너(#app-main)"를 구분하는
//    믿을 만한 신호는 CSS position — 이 앱의 모든 모달 오버레이는 화면 전체를 덮도록 항상
//    position:fixed이고, #app-main 등 일반 레이아웃 컨테이너는 그렇지 않다(static/relative).
//    "부모가 fixed가 아니면 거기서 멈추고 지금 요소 자신을 반환"으로 바꿔서, 진짜 fixed 오버레이가
//    한 겹 이상 겹쳐 있는 경우에만 올라가고, 그 밖의 경우(alarm-modal류)는 절대 부모로 넘어가지
//    않도록 고쳤다.
function _modalStackingRoot(el) {
    let cur = el;
    while (cur && cur !== document.body) {
        if (cur.classList && cur.classList.contains('modal-overlay')) return cur;
        const parent = cur.parentElement;
        if (!parent || parent === document.body) return cur;
        if (getComputedStyle(parent).position !== 'fixed') return cur;
        cur = parent;
    }
    return el;
}
function _bringModalStackToFront(el) {
    const root = _modalStackingRoot(el);
    if (!root) return;
    if (root.id && window.bringModalToFront) { window.bringModalToFront(root.id); return; }
    // id가 없는 동적 요소는 bringModalToFront(id 조회 필요)를 못 쓰므로 직접 z-index를 올린다
    // (아래 "새 모달 자동 최상단" 옵저버의 폴백과 동일한 방식).
    window._topModalZ = (window._topModalZ || 9999) + 1;
    root.style.zIndex = String(window._topModalZ);
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
    //    open/closeXxx() 로직은 항상 부모(오버레이 wrapper)의 display만 토글하고 자식 박스 자신의
    //    인라인 display는 절대 건드리지 않으므로, 최소화가 자식만 display:none으로 숨긴 뒤엔 그
    //    뒤로 openXxx()를 아무리 다시 불러도(부모만 다시 보이는 값으로 "재확인"될 뿐 자식은 그대로
    //    none) 화면에 아무것도 안 보여 "모달이 안 열리는" 것처럼 보였다.
    // 🐛 [2026-09-11 버그 수정] 위 최초 수정은 부모에 ".modal-overlay" 클래스가 붙어있을 때만
    //    잡아냈는데, AI 문답(gantt-qa-modal/gantt-qa-box)·새 프로젝트 등록 위자드(npw-modal/npw-box)
    //    처럼 그 클래스 없이 그냥 body 바로 아래 오버레이 div로만 만들어진 모달은 여전히 못 잡아서
    //    같은 증상(+ 타스크바 복원 시 z-index도 이 자식 기준으로 잘못 올라감 — 73c249f 참고)이 났다.
    //    클래스 이름에 의존하지 않고, "body의 직계 자식까지 거슬러 올라간 실제 조상"을 구조적으로
    //    찾는 _modalStackingRoot로 일반화 — 새 모달이 어떤 클래스를 쓰든 상관없이 항상 정확히 잡는다.
    if (modalEl) {
        const root = _modalStackingRoot(modalEl);
        if (root && root !== modalEl) return root;
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
    minBtn.title = (window._currentLang === 'en') ? 'Minimize' : '최소화';
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
    chip.title = (window._currentLang === 'en') ? 'Double-click to restore' : '더블클릭하면 원래대로 복원됩니다';

    // 💡 [2026-09-02 신규] 상자 기본 폭을 상단 시트탭과 같은 값(MT_TAB_W)으로 — 제목이 잘려도
    //    title 속성(말풍선)으로 전체를 볼 수 있으니 자르는 걸 허용.
    const label = document.createElement('span');
    label.className = 'mtc-label';
    label.textContent = _modalTitleFor(handle, modalId);
    label.title = label.textContent;
    label.style.cssText = 'flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

    // 💡 [2026-09-11 UX 수정] 칩 화살표가 현재 상태를 직관적으로 표시하도록 통일:
    //    ▼ = 지금 내려가 있음(최소화), ▲ = 지금 올라와 있음(열림).
    //    이전 코드는 "클릭하면 어디로 가는지(액션)"를 표시(▲=복원 클릭, ▼=최소화 클릭)했는데,
    //    사용자에게는 현재 상태를 보여주는 쪽이 더 직관적이었다.
    const _tbEn = window._currentLang === 'en';
    const restoreBtn = _modalIconBtn('<i class="ti ti-chevron-up"></i>', _tbEn ? 'Restore' : '복원');
    restoreBtn.className += ' mtc-restore-btn';
    restoreBtn.addEventListener('click', function(e) { e.stopPropagation(); window._restoreModal(modalId); });

    const xBtn = _modalIconBtn('<i class="ti ti-x"></i>', (window._currentLang === 'en') ? 'Close' : '닫기');
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
        _bringModalStackToFront(toggleEl);
    });
    observer.observe(toggleEl, { attributes: true, attributeFilter: ['style'] });

    // 💡 [2026-09-12 i18n] handle을 같이 저장해서, 나중에 언어를 토글해도 이 칩의 라벨을 다시
    // 계산할 수 있게 함 — _refreshMinimizedChipLabels() 참고.
    window._modalMinimized[modalId] = { toggleEl: toggleEl, prevDisplay: prevDisplay, chip: chip, observer: observer, handle: handle };
};

// 💡 [2026-09-12 i18n 버그수정] 페이지 로드 시 자동 최소화되는 모달(AI 문답/AI 요약/AI 업무분석 등)은
// 앱이 기본 한글 상태일 때 이미 칩이 만들어져 라벨이 그 시점 언어로 고정돼 있었다 — 이후 사용자가
// 영문으로 토글해도 모달 자신의 제목(handle 안)은 갱신되는데, 이미 만들어진 타스크바 칩의
// mtc-label은 아무도 다시 안 읽어서 계속 한글로 남아있었다(전수 점검 2차에서 "AI 문답"/"AI 요약"
// 칩이 영문 모드에서도 한글로 보인다는 제보). toggleLang()이 다른 모든 제목 갱신을 끝낸 뒤 이 함수를
// 호출하면, 현재 최소화된 모든 칩의 라벨을 그 시점의(이미 갱신된) handle 텍스트로 다시 뽑아온다.
window._refreshMinimizedChipLabels = function() {
    Object.keys(window._modalMinimized || {}).forEach(function(modalId) {
        const info = window._modalMinimized[modalId];
        if (!info || !info.chip || !info.handle) return;
        const label = info.chip.querySelector('.mtc-label');
        if (!label) return;
        const text = _modalTitleFor(info.handle, modalId);
        label.textContent = text;
        label.title = text;
    });
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
        if (restoreBtn) { restoreBtn.innerHTML = '<i class="ti ti-chevron-up"></i>'; restoreBtn.title = (window._currentLang === 'en') ? 'Restore' : '복원'; }
        // 외부 코드가 모달을 다시 열면 칩 자동 제거
        info.observer = new MutationObserver(function() {
            if (info.toggleEl.style.display === 'none') return;
            info.observer.disconnect();
            if (!window._modalMinimized[modalId]) return;
            const chip = window._modalMinimized[modalId].chip;
            if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
            delete window._modalMinimized[modalId];
            _relayoutTaskbarChips(bar);
            _bringModalStackToFront(info.toggleEl);
        });
        info.observer.observe(info.toggleEl, { attributes: true, attributeFilter: ['style'] });
        return;
    }

    // 최초 복원: 모달 열기, 칩 유지, 아이콘 ▲ → ▼
    if (info.observer) info.observer.disconnect();
    info.toggleEl.style.display = info.prevDisplay;
    _bringModalStackToFront(info.toggleEl);
    info.isRestored = true;
    // 🐛 [2026-09-07 버그수정] "페이지 로드 시 자동 최소화"(아래 DEFAULTS)로 열린 모달은 로그인/
    //    프로젝트 로드가 끝나기 전(300ms 시점)에 딱 한 번만 내용을 채운 채로 계속 최소화 상태였다 —
    //    이후 로그인하고 프로젝트를 열어도, 타스크바 칩을 눌러 복원하는 건 그냥 display만 되돌릴 뿐
    //    내용을 다시 채우지 않아서 옛날(로그인 전) 빈 상태 그대로 보였다(AI 문답의 "질문 대상"
    //    드롭다운이 대표적 — 상단 메뉴로 새로 열면 그 모달의 open 함수가 매번 다시 채워서 멀쩡했음).
    //    모달마다 내부 구조를 몰라도 되는 이 파일의 범용 철학을 유지하면서, 복원 시 다시 채워야 하는
    //    모달만 opt-in으로 등록해두면(window._modalRefreshOnRestore) 여기서 공통으로 호출해준다.
    const refreshFn = window._modalRefreshOnRestore && window._modalRefreshOnRestore[modalId];
    if (refreshFn) { try { refreshFn(); } catch (e) { console.warn('[modal-taskbar] 복원 시 새로고침 실패:', modalId, e); } }
    if (restoreBtn) { restoreBtn.innerHTML = '<i class="ti ti-chevron-down"></i>'; restoreBtn.title = (window._currentLang === 'en') ? 'Minimize' : '최소화'; }
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
