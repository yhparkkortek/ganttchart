    // 💡 [Drive 연동 레이스컨디션 방지] 이 문서가 워낙 커서(1MB+) 브라우저가
    //    아래쪽의 진짜 gapiLoaded/gisLoaded 정의(2000~8000행대)까지 파싱하기 전에
    //    구글 api.js/gsi client 스크립트 로드가 먼저 끝나버리는 경우가 실무에서 흔함.
    //    그러면 onload="gapiLoaded()" 호출 시점에 함수가 아직 없어 ReferenceError가 나고
    //    gapi.client가 영영 초기화되지 않아 Drive 저장/불러오기가 모두 조용히 실패함.
    //    → 진짜 정의가 나타나기 전엔 "로드 완료됨" 사실만 기록해두는 임시 스텁을 먼저 심어둔다.
    window._gapiReady = false;
    window._gisReady  = false;
    window.gapiLoaded = function() { window._gapiReady = true; };
    window.gisLoaded  = function() { window._gisReady  = true; };
