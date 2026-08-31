    (function() {
        var userAgent = navigator.userAgent.toLowerCase();
        var targetUrl = location.href;

        // 카카오톡 인앱 브라우저 감지
        if (userAgent.match(/kakaotalk/i)) {
            if (userAgent.match(/android/i)) {
                // 안드로이드: 크롬 브라우저로 강제 이동 (Intent 사용)
                location.href = 'intent://' + targetUrl.replace(/https?:\/\//i, '') + '#Intent;scheme=https;package=com.android.chrome;end';
            } else if (userAgent.match(/iphone|ipad|ipod/i)) {
                // iOS: 카카오톡 전용 스킴을 사용하여 사파리로 강제 이동
                location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(targetUrl);
            }
        } 
        // 그 외 주요 인앱 브라우저 감지 (네이버, 라인, 페이스북, 인스타그램 등)
        else if (userAgent.match(/line|daum|naver|instagram|facebook|fb|twitter/i)) {
            if (userAgent.match(/android/i)) {
                // 안드로이드: 크롬 브라우저로 강제 이동
                location.href = 'intent://' + targetUrl.replace(/https?:\/\//i, '') + '#Intent;scheme=https;package=com.android.chrome;end';
            } else if (userAgent.match(/iphone|ipad|ipod/i)) {
                // iOS 애플 보안 정책상 다른 앱에서 사파리를 강제로 띄우는 것이 막혀있는 경우가 많습니다.
                // 따라서 사용자에게 직접 [다른 브라우저로 열기]를 안내하는 UI를 띄워줍니다.
                document.write(
                    '<div style="padding:20px; text-align:center; font-family:sans-serif; margin-top:50px; line-height:1.6;">' +
                    '<h3 style="color:#e03131;">⚠️ 현재 환경에서는 구글 로그인이 제한됩니다.</h3>' +
                    '<p>안전한 구글 드라이브 연동을 위해 외부 브라우저가 필요합니다.</p>' +
                    '<p>화면 우측 하단(또는 상단)의 <b>[ ⋮ ]</b> 또는 <b>[ ⋯ ]</b> 버튼을 눌러<br>' +
                    '<span style="color:#007bff; font-weight:bold; font-size:18px;">[다른 브라우저로 열기]</span><br>혹은 <b>[Safari로 열기]</b>를 선택해 주세요.</p>' +
                    '</div>'
                );
                window.stop(); // 화면 렌더링 중지
            }
        }
    })();
