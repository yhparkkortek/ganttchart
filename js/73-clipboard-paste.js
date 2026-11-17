// ══════════════════════════════════════════════════════════════════════════
// 📋 클립보드 붙여넣기(Ctrl+V) 공용 헬퍼 — 2026-11-17 사용자 요청
// ──────────────────────────────────────────────────────────────────────────
// "그림도 파일이 아니고 복사 붙여넣기로 가능하게 해줘(모든 드롭다운 전부 검토)" — 앱 전체
// 드래그앤드롭 전수조사(docs/file-upload-dragdrop-audit.md, 2026-11-12)가 찾은 자리들에
// **붙여넣기도 추가**하면서, "클립보드에서 파일을 뽑아내는" 부분만 여기 한 곳에 모은다.
// "지금 이 화면이 열려 있나"는 자리마다 다르므로(모달 하나뿐인 곳, 탭인 곳, 늘 떠 있는 곳)
// 그 판정은 각자 건다 — 일일보고(js/59 `bindFileDropOnce`)가 이미 증명한 패턴 그대로다.
(function () {
    'use strict';

    // 클립보드 붙여넣기 이벤트에서 파일 배열을 뽑는다. 스크린샷은 파일 이름이 없거나
    // `image.png`/`blob`로 다 똑같이 와서, 그럴 때만 `namePrefix_날짜_시각.png`로 지어 준다
    // (실제 파일명이 있으면 그대로 둔다 — 지어내지 않는다).
    window._dzFilesFromClipboard = function (e, namePrefix) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        var out = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind !== 'file') continue;
            var f = items[i].getAsFile();
            if (!f) continue;
            var nm = String(f.name || '');
            if (!nm || nm === 'image.png' || nm === 'blob') {
                try {
                    var d = new Date();
                    var ymd = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
                    f = new File([f], (namePrefix || 'capture') + '_' + ymd + '_' + String(Date.now()).slice(-6) + '.png',
                        { type: f.type || 'image/png' });
                } catch (e2) { /* File 생성이 막히면 원본 이름으로 */ }
            }
            out.push(f);
        }
        return out;
    };

    // 드롭존에 "붙여넣기도 됩니다" 안내를 붙인다(모양은 손 안 대고 title만) — 사람이 Ctrl+V가
    // 되는지 몰라서 못 쓰는 게 가장 흔한 실패 모드라 눈에 보이는 힌트를 남긴다.
    window._dzHintPaste = function (text) {
        return (text || '') + ' · ' + (window._t ? window._t('붙여넣기(Ctrl+V)도 됩니다', 'Ctrl+V to paste too') : '붙여넣기(Ctrl+V)도 됩니다');
    };
})();
