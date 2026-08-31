    // =========================================================
    // 🛡️ 데이터 유실 방지 안전장치 (오류 수정 및 최신 브라우저 대응)
    // =========================================================

    // 1. 백스페이스(뒤로가기) 오작동 완벽 차단
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' || e.keyCode === 8) {
            let activeEl = document.activeElement;
            // 현재 마우스 커서가 텍스트를 수정 중인 상태인지 확인
            let isInput = activeEl.tagName === 'INPUT' || 
                          activeEl.tagName === 'TEXTAREA' || 
                          activeEl.isContentEditable || 
                          activeEl.getAttribute('contenteditable') === 'true';
            
            // 입력 중이 아닐 때 백스페이스를 누르면 뒤로가기 실행을 막음
            if (!isInput) {
                e.preventDefault();
            }
        }
    });

    // 2. 사이트 이탈 방어
       window.addEventListener('beforeunload', function (e) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    });
