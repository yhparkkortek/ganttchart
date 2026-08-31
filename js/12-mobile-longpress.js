    // =========================================================
    // 📱 모바일 환경 최적화: 꾹 누르기(롱탭)로 텍스트 수정 모드 진입
    // =========================================================
    (function() {
        let touchTimer;
        let isTouchMoved = false;

        // 1. 손가락이 화면에 닿았을 때 타이머 시작
        document.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) return; // 두 손가락 이상 터치 시 무시

            let targetTd = e.target.closest('td');
            // 더블클릭 이벤트가 걸려있는 셀(수정 가능 셀 또는 No 셀)인지 확인
            if (!targetTd || !targetTd.hasAttribute('ondblclick')) return;

            isTouchMoved = false;

            touchTimer = setTimeout(function() {
                if (!isTouchMoved) {
                    // 진동 햅틱 피드백 (안드로이드 등 지원 기기 한정)
                    if (navigator.vibrate) navigator.vibrate(50);
                    
                    // 액션 실행 (No 셀이면 행 추가/삭제 메뉴, 일반 셀이면 텍스트 수정)
                    if (targetTd.classList.contains('no-td')) {
                        let tr = targetTd.closest('tr');
                        let rowIndex = tr ? parseInt(tr.dataset.rowIndex, 10) : -1;
                        if (rowIndex !== -1) window.toggleRowActions(targetTd, rowIndex);
                    } else {
                        window.makeEditable(targetTd);
                    }
                }
            }, 500); // 0.5초(500ms) 동안 꾹 누르고 있으면 실행됩니다.
        }, { passive: true });

        // 2. 손가락을 움직이면(스크롤 등) 꾹 누르기 취소
        document.addEventListener('touchmove', function() {
            isTouchMoved = true;
            if (touchTimer) clearTimeout(touchTimer);
        }, { passive: true });

        // 3. 손가락을 떼거나 터치가 취소되면 타이머 종료
        ['touchend', 'touchcancel'].forEach(evt => {
            document.addEventListener(evt, function() {
                if (touchTimer) clearTimeout(touchTimer);
            });
        });

        // 4. 모바일에서 꾹 눌렀을 때 뜨는 브라우저 기본 메뉴(복사하기 등) 방해 차단
        document.addEventListener('contextmenu', function(e) {
            let targetTd = e.target.closest('td');
            // 텍스트 편집 모드가 아닌 일반 상태에서 꾹 눌렀을 때만 브라우저 메뉴 팝업 차단
            if (targetTd && targetTd.hasAttribute('ondblclick') && targetTd.getAttribute('contenteditable') !== 'true') {
                // 터치 기기(모바일)에서만 우클릭(롱탭) 메뉴를 차단하여 PC 사용자 우클릭은 보호
                if (window.matchMedia("(pointer: coarse)").matches) {
                    e.preventDefault();
                }
            }
        });
    })();
