/* ============================================================================
   🔍🙈 간트 검색 "비매칭 숨기기" — DOM-lite 로직 하네스 (2026-11-11)

       node tests/gantt-search-hide.test.js

   사람이 세 번 연달아 "숨기기가 반대로 보인다/안 먹는다"고 신고했는데, 그때마다 실제 배포된
   파일(curl 로 직접 받아 확인)엔 고친 내용이 이미 있었다 — 그래서 "코드가 틀렸나, 캐시
   문제인가"를 가르기 위해 **DOM 을 흉내 내서 진짜 js/26 코드를 실행**해 본다(이 세션에서
   브라우저 도구의 로컬 preview·file: 스냅샷 둘 다 안정적으로 재현이 안 됐다 — 이 Node
   하네스가 유일하게 믿을 수 있는 실행 경로다).

   ⚠️ 가짜는 최소한의 **DOM-lite 셰임**뿐 — `_ensureSearchBar`·`_applySearch`·`_rowMatches`·
      체크박스 토글까지 전부 js/26 의 **진짜 함수**가, 그 함수가 실제로 만드는 `innerHTML`
      문자열을 그대로 받아 돈다(문자열은 가짜로 만들지 않는다 — 셰임은 그 문자열을 "해석"만
      한다). CSS 는 적용하지 않으므로(jsdom 아님) opacity 수치 자체는 못 보지만, **display:none
      이 실제로 켜지고 꺼지는지**는 100% 확인된다 — 이게 "행 숨기기 미적용" 신고의 핵심 주장이다.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); } };

// ── DOM-lite 셰임 ───────────────────────────────────────────────────────────
function toAttrKey(prop) { return 'data-' + prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()); }

class FakeEl {
    constructor(tag) {
        this.tagName = String(tag || 'div').toUpperCase();
        this.attrs = {};
        this.style = {};
        this.children = [];
        this.parentNode = null;
        this._classes = new Set();
        this._listeners = {};
        const self = this;
        this.classList = {
            add: (...c) => c.forEach((x) => self._classes.add(x)),
            remove: (...c) => c.forEach((x) => self._classes.delete(x)),
            contains: (c) => self._classes.has(c)
        };
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }
    get className() { return [...this._classes].join(' '); }
    set className(v) { this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
    get type() { return this.attrs.type || ''; }
    set type(v) { this.attrs.type = String(v); }
    get textContent() { return this._text || ''; }
    set textContent(v) { this._text = String(v); }
    get value() { return this._value || ''; }
    set value(v) { this._value = String(v); }
    get checked() { return !!this._checked; }
    set checked(v) { this._checked = !!v; }
    get innerHTML() { return this._html || ''; }
    set innerHTML(html) {
        this._html = html;
        this.children = [];
        // 🧩 정교한 파서가 아니다 — id 가 붙은 태그만 평평하게(중첩 무시) 자식으로 만든다.
        //    js/26 은 만든 요소를 전부 getElementById 로만 다시 찾으므로(부모/자식 순회 안 함)
        //    실제 코드가 쓰는 범위에선 이걸로 충분하다.
        const re = /<(\w+)([^>]*)>/g;
        let m;
        while ((m = re.exec(html))) {
            const tag = m[1], attrStr = m[2];
            const idm = attrStr.match(/\bid=["']([^"']+)["']/);
            if (!idm) continue;
            const el = new FakeEl(tag);
            el.attrs.id = idm[1];
            const typeM = attrStr.match(/\btype=["']([^"']+)["']/);
            if (typeM) el.attrs.type = typeM[1];
            this.appendChild(el);
        }
    }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; }
    removeAttribute(k) { delete this.attrs[k]; }
    get dataset() {
        const self = this;
        return new Proxy({}, {
            get(_, prop) { return self.attrs[toAttrKey(String(prop))]; },
            set(_, prop, val) { self.attrs[toAttrKey(String(prop))] = String(val); return true; }
        });
    }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    insertBefore(c, ref) {
        c.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.unshift(c); else this.children.splice(i, 0, c);
        return c;
    }
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((fn) => fn.call(this, ev)); return true; }
    click() { this.dispatchEvent({ type: 'click' }); }
    focus() {}
    select() {}
    closest(sel) { let n = this; while (n) { if (matchesSimple(n, sel)) return n; n = n.parentNode; } return null; }
    querySelector(sel) {
        if (sel === ':scope > div') return this.children.find((c) => c.tagName === 'DIV') || null;
        if (sel === 'td:first-child') return this.children.find((c) => c.tagName === 'TD') || null;
        return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) { const out = []; walk(this, sel, out); return out; }
}

function matchesSimple(el, sel) {
    sel = String(sel || '').trim();
    let m = sel.match(/^([a-zA-Z]*)\[([a-zA-Z0-9_-]+)\]$/);
    if (m) { const tag = m[1].toUpperCase(); return (!tag || el.tagName === tag) && el.hasAttribute(m[2]); }
    m = sel.match(/^([a-zA-Z]*)\.([a-zA-Z0-9_-]+)$/);
    if (m) { const tag = m[1].toUpperCase(); return (!tag || el.tagName === tag) && el.classList.contains(m[2]); }
    if (/^[a-zA-Z]+$/.test(sel)) return el.tagName === sel.toUpperCase();
    m = sel.match(/^\.([a-zA-Z0-9_-]+)$/);
    if (m) return el.classList.contains(m[1]);
    return false;
}
function walk(rootEl, sel, out) {
    (rootEl.children || []).forEach((c) => {
        if (matchesSimple(c, sel)) out.push(c);
        walk(c, sel, out);
    });
}
function findById(rootEl, id) {
    if (rootEl.attrs && rootEl.attrs.id === id) return rootEl;
    for (const c of rootEl.children || []) {
        const r = findById(c, id);
        if (r) return r;
    }
    return null;
}

const docRoot = new FakeEl('html');
const docHead = new FakeEl('head'); docRoot.appendChild(docHead);
global.document = {
    getElementById: (id) => findById(docRoot, id),
    createElement: (tag) => new FakeEl(tag),
    querySelectorAll: (sel) => { const out = []; walk(docRoot, sel, out); return out; },
    querySelector: (sel) => global.document.querySelectorAll(sel)[0] || null,
    addEventListener: () => {},
    body: docRoot,
    head: docHead
};

const container = new FakeEl('div'); container.id = 'table-container'; docRoot.appendChild(container);
const tbody = new FakeEl('tbody'); tbody.id = 'table-body'; container.appendChild(tbody);

const win = {}; global.window = win;
win.document = global.document;
win._currentLang = 'ko';
win._t = (ko) => ko;
win.escapeHtml = (s) => String(s == null ? '' : s);
win.showToast = () => {};
win.applyFilters = () => {};
win.colIdx = { assignee: -1, content: -1, model: -1, customer: -1, status: -1, no: 0, bogo: -1 };
win.globalData = [
    ['NO', 'WBS'],
    (() => { const r = ['1', 'A']; r._level = 3; r._origDev = 'A-OBSIDIAN 관련 업무'; return r; })(),
    (() => { const r = ['2', 'B']; r._level = 3; r._origDev = 'B-그냥 일반 업무'; return r; })(),
    (() => { const r = ['3', 'C']; r._level = 3; r._origDev = 'C-또 다른 일반 업무'; return r; })()
];
// ⚠️⚠️ 이 파일은 (순수 전역 스코프 공유를 전제하는 앱 설계대로) `globalData`/`colIdx`/
//    `applyFilters` 를 **window. 없이 맨 이름으로도** 쓴다(실제 브라우저에선 다른 <script>
//    태그가 `var globalData = …`로 선언해 자동으로 window 프로퍼티가 되므로 바로 보인다).
//    `new Function(...)` 로 돌리는 이 하네스에선 그 바깥 스코프가 Node 전역이라, 안 맞춰 주면
//    `typeof globalData === 'undefined'` 가 되어 **항상 매칭 0건**으로 떨어지는 가짜 실패가 난다.
global.globalData = win.globalData;
global.colIdx = win.colIdx;
global.applyFilters = win.applyFilters;
for (let i = 1; i < win.globalData.length; i++) {
    const tr = new FakeEl('tr');
    tr.setAttribute('data-row-index', String(i));
    const noTd = new FakeEl('td'); const flexDiv = new FakeEl('div');
    noTd.appendChild(flexDiv); tr.appendChild(noTd);
    const wbsTd = new FakeEl('td'); tr.appendChild(wbsTd);
    tbody.appendChild(tr);
}

const src = fs.readFileSync(path.join(__dirname, '..', 'js', '26-gantt-search.js'), 'utf8');
new Function('window', 'document', src)(win, global.document);

(function main() {
    win.ganttSearchInit();
    ok('검색바가 실제로 만들어졌다(innerHTML 해석 포함)', !!document.getElementById('gantt-ai-search-input'));
    ok('필터 체크박스도 만들어졌다', !!document.getElementById('gantt-ai-search-filtermode'));
    ok('🔍 지금검색 버튼도 만들어졌다(이번 요청으로 추가)', !!document.getElementById('gantt-search-now'));

    console.log('\n■ 체크 전(하이라이트 모드) — 비매칭 행은 display:none 이 아니다');
    win.ganttSearchQuery('OBSIDIAN');
    let rows = tbody.children;
    ok('A(매칭)는 숨지 않는다', rows[0].style.display !== 'none', rows[0].style.display);
    ok('A는 gantt-search-match 클래스', rows[0].classList.contains('gantt-search-match'));
    ok('B(비매칭)는 체크 전엔 숨지 않는다(디밍만)', rows[1].style.display !== 'none', rows[1].style.display);
    ok('B에 gantt-search-dim 클래스가 붙는다', rows[1].classList.contains('gantt-search-dim'));
    ok('C도 마찬가지로 안 숨는다', rows[2].style.display !== 'none', rows[2].style.display);

    console.log('\n■ "비매칭 숨기기" 체크 → 비매칭 행이 display:none 이 된다(실제 checked→change 이벤트로)');
    const fm = document.getElementById('gantt-ai-search-filtermode');
    fm.checked = true;
    fm.dispatchEvent({ type: 'change' });
    rows = tbody.children;
    ok('A(매칭)는 여전히 보인다', rows[0].style.display !== 'none', rows[0].style.display);
    ok('B(비매칭)는 이제 완전히 숨는다(display:none)', rows[1].style.display === 'none', rows[1].style.display);
    ok('C(비매칭)도 숨는다', rows[2].style.display === 'none', rows[2].style.display);

    console.log('\n■ 체크 해제 → 다시 전부 보이되(디밍만), display:none 은 풀린다');
    fm.checked = false;
    fm.dispatchEvent({ type: 'change' });
    rows = tbody.children;
    ok('B가 다시 보인다', rows[1].style.display !== 'none', rows[1].style.display);
    ok('C도 다시 보인다', rows[2].style.display !== 'none', rows[2].style.display);

    console.log('\n■ 🔍 지금검색 버튼 — 디바운스 중이던 입력을 즉시 반영한다');
    const inp = document.getElementById('gantt-ai-search-input');
    inp.value = 'B-';
    inp.dispatchEvent({ type: 'input' }); // 500ms 디바운스 예약됨 — 아직 안 돌았다
    rows = tbody.children;
    ok('디바운스 중엔 아직 안 바뀐다(이전 질의 상태 그대로)',
       rows[0].classList.contains('gantt-search-match'), rows.map((r) => r.className));
    document.getElementById('gantt-search-now').click();
    rows = tbody.children;
    ok('버튼을 누르면 즉시 반영된다 — 이번엔 B만 매칭', rows[1].classList.contains('gantt-search-match')
       && !rows[0].classList.contains('gantt-search-match'), rows.map((r) => r.className));

    console.log('\n■ 검색을 지우면 전부 원상복구(match/dim 클래스 제거)');
    document.getElementById('gantt-ai-search-clear').click();
    rows = tbody.children;
    ok('클래스가 다 빠졌다', rows.every((r) => !r.classList.contains('gantt-search-match') && !r.classList.contains('gantt-search-dim')),
       rows.map((r) => r.className));

    console.log('\n' + (fail ? ('❌ ' + fail + '건 실패, ') : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
    process.exit(fail ? 1 : 0);
})();
