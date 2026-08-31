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
