// ─── 구글 드라이브 불러오기 모달 드래그 기능 (업무 보관함 등과 동일 패턴) ───
(function() {
    let isDragging = false, startX, startY, origLeft, origTop;
    document.addEventListener('mousedown', function(e) {
        const handle = document.getElementById('drive-drag-handle');
        if (!handle || !handle.contains(e.target)) return;
        const modal = document.getElementById('drive-file-modal');
        if (!modal) return;
        isDragging = true;
        const rect = modal.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        startX = e.clientX; startY = e.clientY;
        modal.style.transform = 'none';
        modal.style.left = origLeft + 'px';
        modal.style.top  = origTop  + 'px';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const modal = document.getElementById('drive-file-modal');
        if (!modal) return;
        modal.style.left = (origLeft + e.clientX - startX) + 'px';
        modal.style.top  = (origTop  + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', function() { isDragging = false; });
})();
