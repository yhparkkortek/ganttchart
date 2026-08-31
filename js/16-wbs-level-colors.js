    // 💡 WBS 레벨별 고정 회색 계조 (테마 기능 삭제 — 더 이상 사용자가 색을 바꿀 수 없음)
    const SOLID_GRAY = { 0: '#00a1b6', 1: '#828282', 2: '#b4b4b4', 3: '#e6e6e6', 4: '#ffffff' };

    // 💡 TEMP: 좌측 고정열 기능 비활성화 — 다른 탭(Summary/Brief SPEC/M.C Table)처럼 단순한 표로 통일
    window.updateStickyPositions = function() {
        const table = document.getElementById('myTable');
        if (!table) return;
        table.querySelectorAll('th, td').forEach(el => {
            el.classList.remove('sticky-col', 'sticky-last');
            el.style.position = '';
            el.style.left = '';
            el.style.backgroundColor = '';
            el.style.backgroundImage = '';
            el.style.zIndex = '';
            el.style.borderRight = '';
            el.style.borderLeft = '';
            el.style.boxShadow = '';
        });
    };
    // 💡 [버벅임 해결] 무한루프의 주범이었던 style 감지를 완벽하게 차단하고 오직 행이 바뀔 때만 작동하게 만듭니다.
    if (!window._stickyObserver) {
        window._stickyObserver = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (let m of mutations) {
                if (m.type === 'childList') { needsUpdate = true; break; }
            }
            if (needsUpdate) { clearTimeout(window._stickyTimer); window._stickyTimer = setTimeout(window.updateStickyPositions, 30); }
        });
        setTimeout(() => {
            const tableEl = document.getElementById('myTable');
            // 💡 중요: 오직 childList만 감시하도록 경량화하여 무한루프 소지를 원천 봉쇄합니다.
            if(tableEl) { window._stickyObserver.observe(tableEl, { childList: true, subtree: true }); window.updateStickyPositions(); }
        }, 500);
    }

    // 💡 사용자가 칸에 커서를 올리거나 수정을 종료할 때 즉시 색상을 동기화시키는 장치
    document.addEventListener('focusin', (e) => { if (e.target.tagName === 'TD') window.updateStickyPositions(); });
    document.addEventListener('focusout', (e) => { if (e.target.tagName === 'TD') window.updateStickyPositions(); });
    window.addEventListener('resize', () => { clearTimeout(window._stickyTimer); window._stickyTimer = setTimeout(window.updateStickyPositions, 50); });

    
