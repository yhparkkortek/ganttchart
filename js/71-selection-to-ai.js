// 🤖 [2026-11-12] 어디서든 텍스트를 선택하면(드래그 선택·더블클릭 단어선택) 뜨는
// "AI 문답으로" 버튼. 클릭하면 AI 문답 입력칸(#gantt-qa-input)에 선택한 글을 채우고
// 포커스만 준다 — 바로 전송은 안 한다(선택한 글 자체는 완전한 질문이 아니라서, 사람이
// 질문을 덧붙이고 Enter 치는 기존 흐름을 그대로 쓴다). 기존 입구 3개만 부른다
// (openGanttQaModal → #gantt-qa-input → sendGanttQaMessage, js/04h) — 복제하지 않음.
(function () {
    var MAX_LEN = 6000; // _pxExtractText(js/42)와 같은 성격의 길이 가드 — 어휘/규칙이 아니라 안전장치라 하드코딩 가능
    var btn = null;
    var pending = null; // { text, el } — mouseup/dblclick 시점에 잡힌 선택

    function ensureBtn() {
        if (btn) return btn;
        btn = document.createElement('button');
        btn.id = 'sel2ai-btn';
        btn.type = 'button';
        // 🎨 팔레트(테마색)를 안 타는 고정 색 — 토스트/크롬 권장 배너(js/11)와 같은 성격의
        // "앱 크롬"이라 테마와 무관하게 늘 같은 색이어야 알아보기 쉽다(ui-conventions.md 참고).
        btn.style.cssText = 'position:fixed; z-index:999999999; display:none; background:#1971c2; color:#fff; border:none; border-radius:6px; padding:6px 11px; font-size:12px; font-weight:bold; font-family:inherit; cursor:pointer; box-shadow:0 3px 10px rgba(0,0,0,0.25); white-space:nowrap; user-select:none;';
        btn.onmouseover = function () { btn.style.background = '#1a5fa8'; };
        btn.onmouseout = function () { btn.style.background = '#1971c2'; };
        // 💡 mouseup(선택 해제로 이어질 수 있음)이 이 버튼 자체에서 일어나 pending이 먼저
        // 지워져 버리는 레이스를 피하려고, mousedown 시점에 pending을 별도로 스냅샷해 둔다.
        btn.addEventListener('mousedown', function () { btn._captured = pending; });
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var hit = btn._captured || pending;
            btn._captured = null;
            hideBtn();
            if (hit) onPick(hit);
        });
        document.body.appendChild(btn);
        return btn;
    }

    function hideBtn() {
        if (btn) btn.style.display = 'none';
        pending = null;
    }

    function showBtnAt(x, y) {
        var b = ensureBtn();
        b.textContent = (window._currentLang === 'en') ? '🤖 Ask AI' : '🤖 AI 문답으로';
        b.style.display = 'inline-block';
        var w = b.offsetWidth || 110, h = b.offsetHeight || 28;
        var left = Math.min(Math.max(8, x), window.innerWidth - w - 8);
        var top = y - h - 10;
        if (top < 8) top = Math.min(y + 14, window.innerHeight - h - 8);
        b.style.left = left + 'px';
        b.style.top = top + 'px';
    }

    function isExcludedEl(el) {
        // AI 문답 입력칸 자신(및 이 버튼 자신) 안에서의 선택은 제외 — 재귀적으로 또 버튼을 띄우지 않음
        return !!(el && el.closest && el.closest('#gantt-qa-input, #sel2ai-btn'));
    }

    function collect() {
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
            if (isExcludedEl(ae)) return null;
            if (ae.tagName === 'INPUT' && ae.type === 'password') return null;
            var s, e;
            try { s = ae.selectionStart; e = ae.selectionEnd; } catch (errSel) { return null; } // 일부 input type은 selectionStart 접근이 예외를 던짐
            if (s == null || e == null || e <= s) return null;
            var t = ae.value.substring(s, e);
            return t.trim() ? { text: t, el: ae } : null;
        }
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        var anchor = sel.anchorNode;
        var anchorEl = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
        if (isExcludedEl(anchorEl)) return null;
        var txt = sel.toString();
        return (txt && txt.trim()) ? { text: txt, el: null } : null;
    }

    function onSelectionEvent(ev) {
        if (window._mreszDragging || window._mreszActive) return; // 모달 드래그/리사이즈(js/19) 중엔 끼어들지 않음
        var hit = collect();
        if (!hit) { hideBtn(); return; }
        pending = hit;
        showBtnAt((ev && ev.clientX) || 0, (ev && ev.clientY) || 0);
    }

    function onPick(hit) {
        var text = hit.text;
        if (text.length > MAX_LEN) {
            text = text.slice(0, MAX_LEN);
            if (window.showToast) {
                window.showToast((window._currentLang === 'en') ? 'Selection was long — only part of it was carried over.' : '선택한 글이 길어 일부만 옮겼습니다.', 'info');
            }
        }
        window.openGanttQaModal();
        var apply = function () {
            var inp = document.getElementById('gantt-qa-input');
            if (!inp) return;
            inp.value = text;
            inp.focus();
            try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (errSet) {}
        };
        apply();
        setTimeout(apply, 80); // openGanttQaModal 자체의 focus(50ms 뒤, js/04h)보다 늦게 한 번 더 — 레이스 방지
    }

    document.addEventListener('mouseup', onSelectionEvent);
    document.addEventListener('dblclick', onSelectionEvent);
    document.addEventListener('mousedown', function (ev) {
        if (btn && btn.style.display !== 'none' && !btn.contains(ev.target)) hideBtn();
    }, true);
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') hideBtn();
    });
    window.addEventListener('scroll', hideBtn, true);
    window.addEventListener('resize', hideBtn);
})();
