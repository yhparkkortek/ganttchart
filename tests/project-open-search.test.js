// 🔍 프로젝트 불러오기 검색(js/04c PROJECT_SEARCH_FIELDS + showDriveFileModal) — 진짜 소스를 잘라 돌린다.
// 가짜는 DOM 경계뿐(최소 스텁). 실행: node tests/project-open-search.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '04c-core-app-mail-pipeline.js'), 'utf8');
const a = src.indexOf('    const _arr = function(v)');
const b = src.indexOf('window.closeDriveModal = function');
const bEnd = src.indexOf('\n    }', b) + 6;
if (a < 0 || b < 0) { console.log('FAIL 소스 자르기'); process.exit(1); }
const piece = src.slice(a, bEnd);
// 🔍 2026-11-24 — 검색 규칙은 js/04a 한 벌(_searchMatchAll 등). 그 블록도 진짜 소스에서 잘라 온다.
const srcA = fs.readFileSync(path.join(__dirname, '..', 'js', '04a-core-app-globals.js'), 'utf8');
const hA = srcA.indexOf('    var _SEARCH_NOISE');
const hB = srcA.indexOf('window._searchMarkHtml = function');
if (hA < 0 || hB < 0) { console.log('FAIL 04a 소스 자르기'); process.exit(1); }
const helpers = srcA.slice(hA, srcA.indexOf('\n    };', hB) + 7);

const byId = {};
function el(tag) {
  const e = { tag, children: [], style: {}, dataset: {}, parentNode: null, _html: '', textContent: '', value: '',
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; },
    focus() {} };
  Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(v) {
    this._html = v; this.children = [];
    (v.match(/id="([^"]+)"/g) || []).forEach(m => { const id = m.slice(4, -1); byId[id] = byId[id] || el('x'); byId[id].children = []; });
  } });
  Object.defineProperty(e, 'id', { set(v) { byId[v] = this; }, get() { return ''; } });
  return e;
}
const parent = el('div'); const list = el('div'); parent.appendChild(list); byId['drive-file-list'] = list;
['drive-modal-title', 'drive-modal-desc', 'drive-modal-action-slot', 'drive-file-modal-overlay'].forEach(i => byId[i] = el('x'));
const document = { getElementById: i => byId[i] || null, createElement: el };
const window = { _currentLang: 'ko', executeLoadFile: (id) => { window._opened = id; } };
const escapeHtml = s => String(s);
const setTimeout = (fn) => fn();   // 디바운스·포커스는 즉시
const clearTimeout = () => {};
new Function('window', helpers)(window);
new Function('window', 'document', 'escapeHtml', 'setTimeout', 'clearTimeout', piece)(window, document, escapeHtml, setTimeout, clearTimeout);

function vis() { const out = []; (function walk(n) { if (n.dataset && n.dataset.fileId) out.push(n.dataset.fileId); n.children.forEach(walk); })(list); return out.sort().join(","); }
const now = new Date().toISOString();
const files = [
  { id: 'a', name: 'LNW_STELLAR32_32.0.json', modifiedTime: now, appProperties: { pm: '박용훈', team: '개발3팀', me: '김기구' } },
  { id: 'b', name: 'LNW_OBSIDIAN27_27.0.json', modifiedTime: now, appProperties: { pm: '임희철', team: '개발3팀' } },
  { id: 'c', name: 'ACME_K43_43.0.json', modifiedTime: now, appProperties: { pm: '권혁성', team: '개발1팀' } }];
const idx = [
  { drive_file_id: 'a', customer: 'LNW>STELLAR32', inch: '32', keywords: ['GABJO', '1647180-13P50'], members: ['박용훈', '홍회로'], units: ['MVD', 'TPR'] },
  { drive_file_id: 'b', customer: 'LNW>OBSIDIAN', inch: '27', keywords: ['K27'], members: ['임희철'], units: ['MVD'] },
  { drive_file_id: 'c', customer: 'ACME', inch: '43', keywords: ['DV430'], members: ['권혁성', '홍회로'], units: ['TVD'] }];
window.showDriveFileModal(files, 'open', idx);
const inp = byId['drive-modal-search-input'];
let pass = 0, fail = 0;
function q(v, field, want, label) {
  window._driveModalSearchState.field = field || 'all'; inp.value = v; inp.oninput();
  const got = vis(); const ok = got === want;
  ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')'));
}
q('', 'all', 'a,b,c', '빈 검색 = 전부');
q('lnw', 'all', 'a,b', '고객사/이름');
q('홍회로', 'all', 'a,c', '멤버(색인 members)');
q('김기구', 'member', 'a', '멤버 칸 — M/E');
q('27', 'inch', 'b', '인치 칸만');
q('mvd', 'unit', 'a,b', '제품군');
q('tpr', 'all', 'a', '제품군 전체검색');
q('lnw 32', 'all', 'a', '낱말 AND');
q('gabjo', 'keyword', 'a', '연관 검색어');
q('1647180 13p50', 'keyword', 'a', '기호 무시(낱말 AND)');
q('lnwstellar32', 'customer', 'a', '기호·공백 뗀 모양');
q('개발1팀', 'team', 'c', '팀');
q('lnw', 'inch', '', '칸 한정 시 다른 칸은 안 봄');
q('zzz', 'all', '', '0건');
// 검색 중엔 행에 제품군·멤버를 같이 보여 준다(걸린 글자는 <mark>), 평소엔 안 보인다
function rowHtml(id) { let h = null; (function walk(n) { if (n.dataset && n.dataset.fileId === id) h = n.innerHTML; n.children.forEach(walk); })(list); return h || ''; }
function chk(cond, label) { cond ? pass++ : fail++; console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label); }
window._driveModalSearchState.field = 'all'; inp.value = '홍회로'; inp.oninput();
const ha = rowHtml('a');
chk(/🏷 MVD · TPR/.test(ha), '검색 중 행에 제품군 표시');
chk(/👥 .*박용훈/.test(ha) && /<mark[^>]*>홍회로<\/mark>/.test(ha), '멤버 표시 + 걸린 이름 강조');
chk(/김기구/.test(ha), 'M/E 도 멤버에');
window._driveModalSearchState.field = 'all'; inp.value = ''; inp.oninput();
chk(!/👥/.test(rowHtml('a')), '검색 안 할 땐 표시 안 함');
// Enter 로 1건 열기
window._driveModalSearchState.field = 'all'; inp.value = 'acme'; inp.oninput();
inp.onkeydown({ key: 'Enter', stopPropagation() {} });
(window._opened === 'c' ? pass++ : fail++); console.log((window._opened === 'c' ? 'ok  ' : 'FAIL') + ' Enter → 1건이면 연다');
// 닫으면 검색 초기화
window.closeDriveModal();
const reset = window._driveModalSearchState.q === '';
(reset ? pass++ : fail++); console.log((reset ? 'ok  ' : 'FAIL') + ' 닫으면 검색어 비움');
// ── Project list(js/55) — 같은 규칙으로 행을 거르는가. _visibleRows 를 진짜 소스에서 잘라 돌린다 ──
{
  const s55 = fs.readFileSync(path.join(__dirname, '..', 'js', '55-project-list.js'), 'utf8');
  const va = s55.indexOf('    var _visibleRows = function');
  const vb = s55.indexOf('\n    };', va) + 7;
  const body = s55.slice(va, vb) + '\nreturn _visibleRows;';
  const rows = [
    { _id: 'r1', no: 1, customer: 'LNW', model: 'OBSIDIAN27', inch: '27', pn: '1647180-13P50', pm: '박용훈' },
    { _id: 'r2', no: 2, customer: 'LNW', model: 'STELLAR32', inch: '32', pn: '1641445-ALT1', pm: '임희철' },
    { _id: 'r3', no: 3, customer: 'KONAMI', model: 'KGP-4', inch: '27', pn: '', pm: '박용훈' }];
  const W = { PL_COLUMNS: ['no', 'customer', 'model', 'inch', 'pn', 'pm'].map(k => ({ k })) };
  new Function('window', helpers)(W);
  const view = { search: '', filters: {}, sort: {}, pins: [] };
  const vis55 = new Function('window', 'D', '_view', '_colByKey', body)(W, () => ({ rows }), view, {});
  const ids = q => { view.search = q; return vis55().map(r => r._id).sort().join(','); };
  [['', 'r1,r2,r3', '빈 검색 = 전부'],
   ['lnw 27', 'r1', '낱말 AND — 칸이 달라도(고객사+인치)'],
   ['박용훈 27', 'r1,r3', '사람+인치'],
   ['1647180 13p50', 'r1', '기호 무시'],
   ['kgp4', 'r3', '하이픈 뗀 모양'],
   ['lnw konami', '', 'AND 라 둘 다 있는 행 없음']
  ].forEach(([q, want, label]) => { const got = ids(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Project list] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  chk(Array.isArray(W._plSearchToks) && W._plSearchToks.join() === 'lnw,konami', '[Project list] 강조용 낱말을 남긴다');
}
// ── 주소록(js/22f) — 같은 규칙. filterAddressRows 를 진짜 소스에서 잘라 돌린다(DOM 만 스텁) ──
{
  const s22 = fs.readFileSync(path.join(__dirname, '..', 'js', '22f-address-book.js'), 'utf8');
  const fa = s22.indexOf('window.filterAddressRows = function');
  const fb = s22.indexOf('\n};', fa) + 3;
  const mkInput = v => { const cls = new Set(); return { value: v, classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c), remove: c => cls.delete(c), has: c => cls.has(c) } }; };
  const people = [['박용훈', '개발3팀', 'yhpark@kortek.co.kr', '010-1234-5678'], ['임희철', '개발3팀', 'hc@kortek.co.kr', '010-2222-3333'], ['박지웅', '개발1팀', 'jw@kortek.co.kr', '']];
  const trs = people.map(p => ({ style: {}, inputs: p.map(mkInput), querySelectorAll() { return this.inputs; } }));
  const misc = { 'addr-search-count': { textContent: '' }, 'addr-search-clear': { style: {} } };
  const W = {}; new Function('window', helpers)(W);
  const doc = { querySelectorAll: () => trs, getElementById: id => misc[id] || null };
  new Function('window', 'document', s22.slice(fa, fb))(W, doc);
  const shownIdx = q => { W.filterAddressRows(q); return trs.map((t, i) => t.style.display === 'none' ? null : i).filter(i => i !== null).join(','); };
  [['', '0,1,2', '빈 검색 = 전부'],
   ['개발3팀 박', '0', '낱말 AND — 부서+이름(칸이 달라도)'],
   ['01012345678', '0', '하이픈 뗀 전화번호'],
   ['010 2222', '1', '전화 낱말 둘'],
   ['개발1팀 임희철', '', 'AND 라 없음']
  ].forEach(([q, want, label]) => { const got = shownIdx(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [주소록] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  W.filterAddressRows('개발3팀 박');
  chk(trs[0].inputs[0].classList.has('search-hit') && trs[0].inputs[1].classList.has('search-hit') && !trs[0].inputs[2].classList.has('search-hit'), '[주소록] 걸린 칸만 강조(이름·부서, 이메일 아님)');
  W.filterAddressRows('');
  chk(!trs[0].inputs[0].classList.has('search-hit'), '[주소록] 검색 지우면 강조도 지움');
  chk(misc['addr-search-count'].textContent === '', '[주소록] 검색 지우면 개수 표시 비움');
}
// ── PARTS 비교표(js/50 _partsSearchApply) — 진짜 소스를 잘라 돌린다(DOM 만 스텁) ──
{
  const s50 = fs.readFileSync(path.join(__dirname, '..', 'js', '50-parts-category-pages.js'), 'utf8');
  const pa = s50.indexOf('// 🔍 [2026-11-24 사용자 요청] PARTS 비교표 검색');
  if (pa < 0) { console.log('FAIL js/50 소스 자르기'); process.exit(1); }
  const cl = () => { const s = new Set(); return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), has: c => s.has(c) }; };
  const td = (text, inputVal) => ({ textContent: text, classList: cl(), querySelector: () => (inputVal != null ? { value: inputVal } : null) });
  const tr = (className, cells) => ({ className, cells, classList: cl(), textContent: cells.map(c => c.textContent).join('') });
  const rows = [
    tr('pc-section-row', [td('[General]')]),
    tr('', [td('Model'), td('LM270WQ1-SSA1'), td('M270DAN02.6'), td('', '')]),
    tr('pc-p2-row', [td('Brand'), td('LG Display'), td('AUO'), td('', '')]),
    tr('pc-section-row', [td('[Optical]')]),
    tr('', [td('Brightness'), td('350'), td('400'), td('', '고휘도 확인')]),
    tr('', [td('Contrast'), td('1000:1'), td('3000:1'), td('', '')])];
  const tbody = { rows };
  const view = { style: { display: 'flex' }, querySelector: () => tbody };
  const ids = { 'parts-search-count': { textContent: '' } };
  const W = { _currentLang: 'ko' }; new Function('window', helpers)(W);
  const doc = { readyState: 'complete', getElementById: id => ids[id] || null, querySelectorAll: () => [view], createElement: () => ({}) };
  new Function('window', 'document', 'setTimeout', 'clearTimeout', s50.slice(pa))(W, doc, f => f(), () => {});
  const vis = q => { W._partsSearchTerm = q; W._partsSearchApply();
    return rows.map((r, i) => r.classList.has('parts-search-hide') ? null : i).filter(i => i !== null).join(','); };
  [['', '0,1,2,3,4,5', '빈 검색 = 전부(클래스 없음)'],
   ['auo', '0,2', '값으로 — 구역 머리는 걸린 행이 있을 때만'],
   ['lm270wq1 ssa1', '0,1', '기호 무시 + AND'],
   ['brightness 400', '3,4', '라벨+값 AND'],
   ['고휘도', '3,4', 'Note 입력칸 값도'],
   ['optical', '3,4,5', '구역 이름이 걸리면 그 구역 전부'],
   ['auo 3000', '', 'AND — 한 행에 둘 다 없음']
  ].forEach(([q, want, label]) => { const got = vis(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [PARTS] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  vis('auo');
  chk(rows[2].classList.has('parts-search-show'), '[PARTS] 접힌 2순위 행도 걸리면 보인다');
  chk(rows[2].cells[2].classList.has('search-hit') && !rows[2].cells[1].classList.has('search-hit'), '[PARTS] 걸린 칸만 강조');
  chk(ids['parts-search-count'].textContent === '1 / 4항목', '[PARTS] 개수 ' + ids['parts-search-count'].textContent);
  vis('');
  chk(!rows[2].classList.has('parts-search-show') && !rows[2].cells[2].classList.has('search-hit'), '[PARTS] 검색 지우면 클래스 원상복구');
}
// ── BOM(js/38) — 검색은 뷰 상태 줄기(_bomVisibleRows) 안에서. 진짜 js/38 전체를 스텁 DOM 위에서 불러 돌린다 ──
{
  const s38 = fs.readFileSync(path.join(__dirname, '..', 'js', '38-bom-tab.js'), 'utf8');
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, appendChild: noop, querySelectorAll: () => [], querySelector: () => null, dataset: {} });
  const doc = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, createElement: el, readyState: 'complete', body: el() };
  const W = { addEventListener: noop, localStorage: { getItem: () => null, setItem: noop } };
  new Function('window', helpers)(W);
  new Function('window', 'document', 'localStorage', 'setTimeout', s38)(W, doc, W.localStorage, noop);
  const R = (lv, code, desc, grp) => ({ _level: lv, IDNRK: code, OJTXP: desc, WGBEZ60: grp });
  const st = { rows: [R(1, 'A100', 'MAIN BD ASSY', 'BD 반제품'), R(2, 'B200', 'PANEL 27 QHD', 'LCD/PANEL'), R(2, 'B201', 'HARNESS LVDS', 'HARNESS'),
                      R(1, 'C300', 'TAPE SET', 'TAPE'), R(2, 'C301', 'TAPE CONDUCTIVE', 'TAPE')],
               _collapsed: { 0: true }, notes: { C301: '도전 테이프 확인' }, locations: {} };
  const setQ = q => Object.defineProperty(st, '_searchToks', { value: W._searchTokens(q), enumerable: false, writable: true, configurable: true });
  const codes = q => { setQ(q); return W._bomVisibleRows(st).map(r => r.IDNRK).join(','); };
  [['', 'A100,C300,C301', '검색 없음 = 접힘 그대로(A100 접힘)'],
   ['panel', 'A100,B200', '접힌 가지 안도 찾고 상위 부품을 같이'],
   ['harness lvds', 'A100,B201', '낱말 AND'],
   ['tape', 'C300,C301', '상위·하위 둘 다 걸림'],
   ['도전', 'C300,C301', '비고(notes)도 검색'],
   ['b 200', 'A100,B200', '코드 낱말 둘'],
   ['panel tape', '', 'AND — 한 부품에 둘 다 없음']
  ].forEach(([q, want, label]) => { const got = codes(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [BOM] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  setQ('panel');
  chk(JSON.stringify(st).indexOf('_searchToks') === -1, '[BOM] 검색어는 저장 파일에 실리지 않는다(열거 안 됨)');
  st._sort = { key: 'IDNRK', dir: 'desc' };
  chk(codes('tape') === 'C300,C301' && codes('') === 'C300,C301,A100', '[BOM] 정렬과 같이 — 형제끼리만 재배열');
  st._sort = null;
  // 계층이 깨진 응답(레벨 블록 모드)도 걸린 행만
  const broken = { rows: [R(2, 'X1', 'PANEL A', ''), R(1, 'X2', 'TAPE', ''), R(3, 'X3', 'PANEL B', '')], _collapsed: {}, notes: {} };
  Object.defineProperty(broken, '_searchToks', { value: W._searchTokens('panel'), enumerable: false, writable: true, configurable: true });
  chk(W._bomVisibleRows(broken).map(r => r.IDNRK).join(',') === 'X1,X3', '[BOM] 계층 깨진 모드도 걸린 행만');
}
// ── M.C Table · Customer SPEC(js/22i 공용 설치기 _tblSearchApply) — 진짜 소스를 잘라 돌린다(DOM 만 스텁) ──
{
  const s22i = fs.readFileSync(path.join(__dirname, '..', 'js', '22i-brief-mc-common-2.js'), 'utf8');
  const ma = s22i.indexOf('// 🔍 [2026-11-24 사용자 요청] 입력칸 표 검색');
  if (ma < 0) { console.log('FAIL js/22i 소스 자르기'); process.exit(1); }
  const cl = () => { const s = new Set(); return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), has: c => s.has(c) }; };
  const inp = (field, value, type) => ({ value, type: type || 'text', dataset: { field }, classList: cl() });
  const mk = (cls, vals) => { const ins = vals.map(([f, v, t]) => inp(f, v, t)); return { className: cls, classList: cl(), inputs: ins,
      querySelectorAll: sel => sel === 'input[data-field]' ? ins.filter(i => i.dataset.field) : ins }; };
  const rows = [
    mk('', [['type', '회로'], ['item', 'AD Board'], ['group', 'BD'], ['pn', '502572'], ['spec', 'RTD2556'], ['note', '']]),
    mk('', [['type', '회로'], ['item', 'Harness'], ['group', 'LVDS'], ['pn', ''], ['spec', '40P 300mm'], ['note', '']]),
    mk('mc-summary-row', [['x', 'SUBTOTAL']]),
    mk('', [['type', '기구'], ['item', 'Back cover'], ['group', 'SECC'], ['pn', 'P-001', 'hidden'], ['spec', ''], ['note', '도금 확인']])];
  // Customer SPEC 표(TYPE·TYPE2·값·Note) — 같은 설치기, 다른 tbody
  const bsRows = [
    mk('', [['type', 'Optical'], ['sub', 'Brightness(Centre. Min)'], ['modelA', '1000 nit'], ['note', '']]),
    mk('', [['type', 'Optical'], ['sub', 'Color coordinate(x/y)'], ['modelA', '0.305 / 0.335'], ['note', '']]),
    mk('', [['type', 'Interface'], ['sub', 'F/W Version'], ['modelA', 'V1.02'], ['note', 'EDID 확인']])];
  const ids = { 'mctable-body': { rows }, 'mc-search-count': { textContent: '' },
                'briefspec-body': { rows: bsRows }, 'bs-search-count': { textContent: '' } };
  const W = { _currentLang: 'ko' }; new Function('window', helpers)(W);
  const doc = { readyState: 'complete', getElementById: id => ids[id] || null, createElement: () => ({}) };
  new Function('window', 'document', 'setTimeout', 'clearTimeout', s22i.slice(ma))(W, doc, f => f(), () => {});
  const vis = q => { W._tblSearchTerms.mc = q; W._tblSearchApply('mc'); return rows.map((r, i) => r.classList.has('parts-search-hide') ? null : i).filter(i => i !== null).join(','); };
  [['', '0,1,2,3', '빈 검색 = 전부(합계 행 포함)'],
   ['회로 lvds', '1', 'TYPE(이어받은 값)+GROUP AND'],
   ['rtd 2556', '0', '기호·공백 무시'],
   ['p001', '3', '숨은 P/N 칸도 검색'],
   ['도금', '3', 'Note 도 검색'],
   ['subtotal', '', '합계 행은 검색 중 숨김']
  ].forEach(([q, want, label]) => { const got = vis(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [M.C] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  vis('회로 lvds');
  chk(rows[1].inputs[2].classList.has('search-hit') && !rows[1].inputs[1].classList.has('search-hit'), '[M.C] 걸린 칸만 강조');
  chk(ids['mc-search-count'].textContent === '1 / 3행', '[M.C] 개수 ' + ids['mc-search-count'].textContent);
  vis('p001');
  chk(!rows[3].inputs[3].classList.has('search-hit'), '[M.C] 숨은 입력칸엔 강조 안 함');
  vis('');
  chk(!rows[1].classList.has('parts-search-show') && !rows[1].inputs[2].classList.has('search-hit'), '[M.C] 검색 지우면 원상복구');
  // Customer SPEC
  const bsVis = q => { W._tblSearchTerms.bs = q; W._tblSearchApply('bs'); return bsRows.map((r, i) => r.classList.has('parts-search-hide') ? null : i).filter(i => i !== null).join(','); };
  [['', '0,1,2', '빈 검색 = 전부'],
   ['optical color', '1', 'TYPE+TYPE2 AND'],
   ['0.305 0.335', '1', '색좌표 값 낱말 둘'],
   ['fw version', '2', '기호(/) 무시'],
   ['edid', '2', 'Note 도 검색'],
   ['optical edid', '', 'AND — 한 행에 둘 다 없음']
  ].forEach(([q, want, label]) => { const got = bsVis(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Customer SPEC] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  bsVis('optical');
  chk(ids['bs-search-count'].textContent === '2 / 3행' && ids['mc-search-count'].textContent === '', '[Customer SPEC] 개수는 제 표에만 ' + ids['bs-search-count'].textContent);
  chk(W._tblSearchTerms.mc === '' && rows.every(r => !r.classList.has('parts-search-hide')), '[Customer SPEC] M.C 표 검색 상태와 섞이지 않음');
}
// ── Summary(js/22b _sumSearchApply) — 페이지 안 찾기. 작은 가짜 DOM 나무 위에서 진짜 소스를 돌린다 ──
{
  const s22b = fs.readFileSync(path.join(__dirname, '..', 'js', '22b-summary-mctable-core1.js'), 'utf8');
  const sa = s22b.indexOf('// 🔍 [2026-11-24 사용자 요청] Summary 검색');
  if (sa < 0) { console.log('FAIL js/22b 소스 자르기'); process.exit(1); }
  // 아주 작은 DOM: tag/id/class 선택자와 쉼표 목록만
  const N = (tag, attrs, kids) => {
    const n = Object.assign({ tagName: tag.toUpperCase(), children: [], parentNode: null, type: '', value: '', id: '', _text: '' }, attrs || {});
    const cls = new Set(String((attrs && attrs.className) || '').split(/\s+/).filter(Boolean));
    n.classList = { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c), has: c => cls.has(c) };
    (kids || []).forEach(k => { k.parentNode = n; n.children.push(k); });
    n.children.forEach((k, i) => { k.previousElementSibling = n.children[i - 1] || null; });
    Object.defineProperty(n, 'textContent', { get() { return n._text + n.children.map(k => k.textContent).join(''); } });
    const one = (el, s) => s[0] === '#' ? el.id === s.slice(1) : s[0] === '.' ? el.classList.contains(s.slice(1)) : el.tagName === s.toUpperCase();
    const all = (el) => el.children.reduce((a, k) => a.concat([k], all(k)), []);
    n.querySelectorAll = sel => { const ss = sel.split(',').map(s => s.trim()); return all(n).filter(el => ss.some(s => one(el, s))); };
    n.querySelector = sel => n.querySelectorAll(sel)[0] || null;
    n.closest = sel => { for (let p = n; p; p = p.parentNode) if (one(p, sel)) return p; return null; };
    n.scrollIntoView = () => { N.scrolled = n; };
    return n;
  };
  const T = (tag, text, attrs) => N(tag, Object.assign({ _text: text }, attrs || {}));
  const I = (value, attrs) => N('input', Object.assign({ value, type: 'text' }, attrs || {}));
  const memLabel = I('H/W 담당자', { className: 'mem-label' }), hwName = I('조익현,조재준'), hwMail = I('ihjo@kortek.co.kr', { type: 'email' });
  const fwLabel = I('F/W 담당자', { className: 'mem-label' }), fwName = I('최종석'), fwMail = I('', { type: 'email' });
  const matRow = N('tr', {}, [N('td', {}, [I('PANEL')]), N('td', {}, [I('502572')]), N('td', {}, [I('LM270WQ1 SSA1')])]);
  const tab = N('div', { id: 'tab-summary' }, [
    N('div', { className: 'concept-header-box' }, [T('h2', 'Summary')]),
    T('h3', '프로젝트 개요'),
    N('div', {}, [T('label', '적용 목적'), N('textarea', { value: 'LNW UK 유럽 시장' })]),
    N('div', { className: 'concept-grid' }, [memLabel, hwName, hwMail, fwLabel, fwName, fwMail]),
    N('table', {}, [N('tbody', {}, [matRow])]),
    N('div', { id: 'sum-history-box' }, [T('td', '조익현 수정함')])]);
  const ids = { 'tab-summary': tab, 'sum-search-count': { textContent: '' }, 'sum-search-input': {} };   // 칸이 이미 있으면 설치기는 건너뛴다
  const W = { _currentLang: 'ko' }; new Function('window', helpers)(W);
  const doc = { readyState: 'complete', getElementById: id => ids[id] || null, createElement: () => N('span') };
  // ensureBar 는 헤더에 칸을 꽂으려다 btn-group 이 없으면 끝에 붙인다 — 그 칸은 시험에 안 쓴다
  W.MutationObserver = undefined;
  new Function('window', 'document', 'setTimeout', 'clearTimeout', 'Map', s22b.slice(sa))(W, doc, f => f(), () => {}, Map);
  const run = q => { W._sumSearch.term = q; W._sumSearchApply(); return W._sumSearch.groups.length; };
  chk(run('lnw 유럽') === 1 && tab.children[2].children[1].classList.has('search-hit'), '[Summary] 입력칸(개요) 찾기');
  chk(run('hw 조익현') === 1 && memLabel.classList.has('search-hit') && hwName.classList.has('search-hit') && !fwName.classList.has('search-hit'),
      '[Summary] 멤버 줄 = 역할+이름 한 묶음(AND)');
  chk(run('panel lm270wq1') === 1 && !matRow.children[1].children[0].classList.has('search-hit'), '[Summary] 주요자재 행 AND, 걸린 칸만 강조');
  chk(run('조익현') === 1, '[Summary] 변경 이력·헤더는 찾지 않음 ' + W._sumSearch.groups.length);
  chk(run('lnw') >= 1 && ids['sum-search-count'].textContent === '1 / ' + W._sumSearch.groups.length, '[Summary] 개수 ' + ids['sum-search-count'].textContent);
  run('담당자');
  const n = W._sumSearch.groups.length; W._sumSearchStep(1);
  chk(n === 2 && W._sumSearch.cur === 1 && fwLabel.classList.has('search-cur') && !memLabel.classList.has('search-cur'), '[Summary] ▼ 다음으로 옮기며 지금 칸 표시');
  W._sumSearchStep(1);
  chk(W._sumSearch.cur === 0, '[Summary] 끝에서 ▼ 는 처음으로');
  run('');
  chk(!memLabel.classList.has('search-hit') && !memLabel.classList.has('search-cur') && ids['sum-search-count'].textContent === '', '[Summary] 지우면 강조 원상복구');
}
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
