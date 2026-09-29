    // 🌐 [2026-09-29] IE / 비크롬 브라우저 권장 배너 — 탭 세션 단위 1회 표시(sessionStorage)
    (function() {
        var ua = navigator.userAgent;
        var isIE = /Trident|MSIE/i.test(ua);
        var isEdgeLegacy = /Edge\//i.test(ua); // Chromium Edge는 "Edg/" 이므로 구분됨
        var isChrome = /Chrome\//i.test(ua) && !/Edge\//i.test(ua) && !/OPR\//i.test(ua);
        var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

        if (!isMobile && !isChrome) {
            var dismissed = false;
            try { dismissed = !!sessionStorage.getItem('gantt_chrome_banner_v1'); } catch(e) {}
            if (!dismissed) {
                function _showChromeBanner() {
                    if (document.getElementById('gantt-chrome-banner')) return;
                    var bgColor = isIE ? '#c92a2a' : '#e67700';
                    var msg = isIE
                        ? '⚠️ Internet Explorer는 이 앱을 지원하지 않습니다. 일부 기능이 동작하지 않을 수 있습니다. Google Chrome 사용을 권장합니다.'
                        : '🔔 이 앱은 Google Chrome에 최적화되어 있습니다. 현재 브라우저에서는 일부 기능이 정상 동작하지 않을 수 있습니다.';
                    var banner = document.createElement('div');
                    banner.id = 'gantt-chrome-banner';
                    banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:99999; background:' + bgColor + '; color:#fff; font-size:13px; padding:9px 48px 9px 16px; text-align:center; font-family:sans-serif; line-height:1.5; box-shadow:0 2px 8px rgba(0,0,0,.3);';
                    banner.innerHTML = msg + ' &nbsp;<a href="https://www.google.com/chrome/" target="_blank" rel="noopener" style="color:#fff; font-weight:bold; text-decoration:underline; white-space:nowrap;">&#128279; Chrome 다운로드</a>';
                    var closeBtn = document.createElement('button');
                    closeBtn.innerHTML = '&#10005;';
                    closeBtn.title = '닫기';
                    closeBtn.style.cssText = 'position:absolute; right:12px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,.25); border:none; color:#fff; font-size:14px; line-height:1; width:24px; height:24px; border-radius:4px; cursor:pointer;';
                    closeBtn.onclick = function() {
                        var b = document.getElementById('gantt-chrome-banner');
                        if (b && b.parentNode) b.parentNode.removeChild(b);
                        try { sessionStorage.setItem('gantt_chrome_banner_v1', '1'); } catch(e2) {}
                    };
                    banner.appendChild(closeBtn);
                    if (document.body.firstChild) {
                        document.body.insertBefore(banner, document.body.firstChild);
                    } else {
                        document.body.appendChild(banner);
                    }
                }
                if (document.body) {
                    _showChromeBanner();
                } else {
                    document.addEventListener('DOMContentLoaded', _showChromeBanner);
                }
            }
        }
    })();

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
