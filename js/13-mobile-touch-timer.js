    (function() {
        let touchTimer;
        let isTouchMoved = false;

        document.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) return; // 멀티터치 무시
            
            let targetTd = e.target.closest('td[ondblclick]') || e.target.closest('.no-td');
            // 수정 중인 셀이 아니면 실행
            if (!targetTd || targetTd.getAttribute('contenteditable') === 'true') return;

            isTouchMoved = false;

            touchTimer = setTimeout(function() {
                if (!isTouchMoved) {
                    if (navigator.vibrate) navigator.vibrate(50); // 진동 피드백 (안드로이드)
                    
                    if (targetTd.classList.contains('no-td')) {
                        let tr = targetTd.closest('tr');
                        let rowIndex = tr ? parseInt(tr.dataset.rowIndex, 10) : -1;
                        if (rowIndex !== -1) window.toggleRowActions(targetTd, rowIndex);
                    } else {
                        window.makeEditable(targetTd);
                        // 커서 맨 뒤로 보내고 강제 포커스
                        let range = document.createRange();
                        let sel = window.getSelection();
                        range.selectNodeContents(targetTd);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        targetTd.focus();
                    }
                }
            }, 500); // 0.5초 꾹 누르기
        }, { passive: true });

        document.addEventListener('touchmove', function() {
            isTouchMoved = true;
            if (touchTimer) clearTimeout(touchTimer);
        }, { passive: true });

        ['touchend', 'touchcancel'].forEach(evt => {
            document.addEventListener(evt, function() {
                if (touchTimer) clearTimeout(touchTimer);
            });
        });

        // 꾹 눌렀을 때 브라우저 기본 우클릭 메뉴(복사/공유) 차단
        document.addEventListener('contextmenu', function(e) {
            let targetTd = e.target.closest('td[ondblclick]');
            if (targetTd && targetTd.getAttribute('contenteditable') !== 'true' && window.matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
            }
        });
    })();
