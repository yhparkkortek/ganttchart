// 🖱️ 드롭다운 메뉴 항목을 **마우스로 끌어 순서 바꾸기** — 공용 헬퍼 (2026-11-25)
//
// 헤더 맨 앞 글자형 드롭다운(`🔔 알람 ▾` · `🖥️ PANEL ▾` · `📄 문서 ▾` · `📋 주간 보고 ▾`)을 눌렀을 때 뜨는 `.row-action-popup` 의
// 항목을 사용자가 끌어서 원하는 순서로 바꾼다. 이미 있던 두 구현(js/23 사이드바 메뉴 · js/67 Document 드롭다운)과 **같은 방식**이다 —
// 별도 자리표시자 없이 마우스가 걸친 항목의 위/아래로 바로 옮기고, 놓을 때 저장한다. 그걸 한 곳으로 모았다.
//
// ■ 기본 기능 (사용자가 알아야 할 것 — docs/ui-conventions.md "드롭다운 순서 바꾸기")
//   · 기본 순서 = 코드/데이터에 정해진 순서. 아무것도 안 끌면 그대로다.
//   · 항목을 마우스로 잡아(⠿ 손잡이는 "끌 수 있다"는 표시일 뿐 — 항목 어디를 잡아도 된다) 위/아래로 놓으면 순서가 바뀐다.
//   · 순서는 **이 PC 의 브라우저(localStorage)** 에 저장된다 — 사람 취향이라 프로젝트 데이터가 아니고, 다른 PC 에는 안 따라간다.
//   · 저장 뒤 새로 생긴 항목은 **끝**에 붙는다. 없어진 항목은 저장 목록에 남아 있어도 무시된다.
//   · 클릭은 그대로 "고르기"다 — 끌었다 놓은 건 클릭으로 안 친다(브라우저가 click 을 안 쏜다).
//   · 기본 순서로 되돌리려면 그 드롭다운의 저장 키를 지운다: `localStorage.removeItem('<키>')` 또는 `_ddReorder.reset('<키>')`.
//
// ■ 쓰는 법 — 드롭다운마다 **저장 키 하나**와 **항목 id** 만 정하면 된다:
//     var items = _ddReorder.order('gantt_xxx_order_v1', options, function (o) { return o.key; });   // 저장된 순서로
//     pop.innerHTML = items.map(function (o) { return _ddReorder.itemHtml({ id: o.key, onclick: '…', active: …, labelHtml: '…' }); }).join('');
//     _ddReorder.init(pop, 'gantt_xxx_order_v1');                                                    // 끌기 켜고 놓을 때 저장
//   ⚠️ 항목 마크업은 **`div` 하나 + `span` 만** — js/67 하네스가 `dd.querySelectorAll('div')` 로 항목 수를 센다(안에 div 를 더 넣지 말 것).
//   ⚠️ 팝업은 **열 때마다 다시 그린다**(innerHTML) — 그래서 `init` 도 열 때마다 부른다(핸들러가 새 노드에 붙어야 한다).
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var ATTR = 'data-dd-id';

    /** `#rrggbb` → `rgb(r, g, b)` — 켜진 항목 위에서는 hover 색을 안 덮으려고 인라인 style 값과 같은 모양으로 비교한다. */
    function rgbOf(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        return m ? 'rgb(' + parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16) + ')' : '';
    }

    window._ddReorder = {
        /** 저장된 순서대로 — 저장 뒤 새로 생긴 항목은 원래 순서 그대로 끝에 붙는다. items 는 배열, idOf 는 항목 → id. */
        order: function (key, items, idOf) {
            var saved;
            try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
            if (!saved || !saved.length) return items;
            var byId = {};
            items.forEach(function (it) { byId[idOf(it)] = it; });
            var out = [];
            saved.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
            items.forEach(function (it) { if (byId[idOf(it)]) out.push(it); });
            return out;
        },

        /**
         * 항목 한 줄의 마크업 — **네 드롭다운이 같은 모양**이게 여기서 만든다(⠿ 손잡이 · `cursor:grab` · 켜진 항목 채움).
         * @param {{id:string, onclick:string, active:boolean, labelHtml:string, activeBg?:string, attr?:string}} o
         *   onclick 은 이미 이스케이프된 인라인 JS 문자열(골랐을 때 팝업을 닫는 것까지 호출 쪽이 적는다).
         *   attr 는 항목 id 를 싣는 속성 이름 — 기본 `data-dd-id`(Document 는 옛 시험이 `data-doc-form-id` 를 본다).
         */
        itemHtml: function (o) {
            var bg = o.activeBg || '#2c5f8a', on = !!o.active, rgb = rgbOf(bg), attr = o.attr || ATTR;
            return '<div ' + attr + '="' + _esc(o.id) + '" onclick="' + o.onclick + '"'
                 + ' style="padding:7px 10px; cursor:grab; border-radius:4px; font-size:12.5px; font-weight:bold; white-space:nowrap;'
                 + ' display:flex; align-items:center; gap:6px; background:' + (on ? bg : 'transparent') + '; color:' + (on ? '#fff' : '#333') + ';"'
                 + ' onmouseover="if(this.style.background!==\'' + rgb + '\') this.style.background=\'#f1f3f5\';"'
                 + ' onmouseout="if(this.style.background!==\'' + rgb + '\') this.style.background=\'transparent\';">'
                 // ⠿ 손잡이 — BOM(js/04j `.row-drag-handle`)·Document 도안 표시 목록과 **같은 기호·색**. 끌기는 손잡이가 아니라 행 전체에 걸려 있다.
                 + '<span title="' + _esc(_t('끌어서 순서 바꾸기', 'drag to reorder')) + '"'
                 + ' style="flex:0 0 auto; color:' + (on ? 'rgba(255,255,255,.7)' : '#adb5bd') + '; user-select:none;">⠿</span>'
                 + '<span style="flex:1 1 auto;">' + o.labelHtml + '</span></div>';
        },

        /** 팝업 안 `[attr]` 항목을 끌 수 있게 하고, 놓을 때 지금 순서를 저장한다. 열 때마다 부를 것. */
        init: function (pop, key, attr) {
            attr = attr || ATTR;
            var dragEl = null;
            var save = function () {
                var order = Array.prototype.map.call(pop.querySelectorAll('[' + attr + ']'), function (el) { return el.getAttribute(attr); });
                try { localStorage.setItem(key, JSON.stringify(order)); } catch (e) { /* 저장 못 해도 이번 화면 순서는 바뀐 채다 */ }
            };
            pop.querySelectorAll('[' + attr + ']').forEach(function (el) {
                el.setAttribute('draggable', 'true');
                el.addEventListener('dragstart', function (e) {
                    dragEl = el; el.style.opacity = '0.4';
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', el.getAttribute(attr)); } catch (err) { /* ignore */ }
                });
                el.addEventListener('dragend', function () { el.style.opacity = ''; dragEl = null; save(); });
                el.addEventListener('dragover', function (e) {
                    if (!dragEl || dragEl === el) return;
                    e.preventDefault();
                    var rect = el.getBoundingClientRect();
                    var before = (e.clientY - rect.top) < rect.height / 2;
                    pop.insertBefore(dragEl, before ? el : el.nextSibling);   // 걸친 항목의 위/아래로 바로 옮긴다(자리표시자 없이)
                });
                el.addEventListener('drop', function (e) { e.preventDefault(); });
            });
        },

        /** 저장된 순서를 지워 기본 순서로 되돌린다. */
        reset: function (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
    };
})();
