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
  const sa = s22b.indexOf('// 🔍 [2026-11-24 사용자 요청] 페이지 안 찾기');
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
  // Document 본문(같은 설치기, 다른 뿌리) — 문서 표 한 줄 + 칸 + 접혀서 안 보이는 칸
  const docRow = N('tr', {}, [T('td', 'MODEL NAME'), N('td', {}, [I('KTS320DPS01')])]);
  const docHidden = I('숨은 KTS 값'); docHidden.getClientRects = () => [];
  const docVisible = I('PROTO A 출고'); docVisible.getClientRects = () => [1];
  const docBody = N('div', { id: 'doc-page-body' }, [N('table', {}, [N('tbody', {}, [docRow])]), docVisible, docHidden]);
  const ids = { 'tab-summary': tab, 'sum-search-count': { textContent: '' }, 'sum-search-input': {},   // 칸이 이미 있으면 설치기는 건너뛴다
                'doc-page-body': docBody, 'doc-search-count': { textContent: '' }, 'doc-search-input': {} };
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
  // Document — 같은 설치기, 상태는 따로
  const D = W._pageFind.doc;
  const drun = q => { D.term = q; D.apply(); return D.groups.length; };
  chk(drun('model kts320') === 1 && docRow.children[1].children[0].classList.has('search-hit'), '[Document] 표 행(라벨+값) AND');
  chk(drun('proto a') === 1 && docVisible.classList.has('search-cur'), '[Document] 입력칸 찾고 지금 칸 표시');
  chk(drun('kts') === 1 && !docHidden.classList.has('search-hit'), '[Document] 접혀서 안 보이는 칸은 세지 않음');
  chk(ids['doc-search-count'].textContent === '1 / 1' && W._sumSearch.term === '', '[Document] 개수는 제 칸에만, Summary 상태와 섞이지 않음');
}
// ── JIRA 연결 이슈(js/70 viewRows) — 진짜 js/70 전체를 스텁 DOM 위에서 불러 돌린다 ──
{
  const s70 = fs.readFileSync(path.join(__dirname, '..', 'js', '70-jira-tab.js'), 'utf8');
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, appendChild: noop, querySelectorAll: () => [], querySelector: () => null, dataset: {} });
  const doc = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, createElement: el, readyState: 'complete', body: el() };
  const W = { addEventListener: noop, localStorage: { getItem: () => null, setItem: noop }, _currentLang: 'ko' };
  new Function('window', helpers)(W);
  new Function('window', 'document', 'localStorage', 'setTimeout', 'clearInterval', 'setInterval', s70)(W, doc, W.localStorage, noop, noop, noop);
  const J = W._jiraFindInternals;
  J.setRows([
    { key: 'GABJO-7', summary: 'TSP Tail 접촉 Risk 검토', status: 'Open', assignee: '박용훈', reporter: '임희철', priority: 'Major', updated: '2026-11-20', src: ['project'] },
    { key: 'GABJO-12', summary: '외관 불량 — 벤트 홀 버 발생', status: 'Resolved', assignee: '임희철', reporter: '박용훈', priority: 'Minor', updated: '2026-11-21', src: ['project'] },
    { key: 'GABKJ-3', summary: 'Noise on HDMI', status: 'Open', assignee: '김시윤', reporter: '김시윤', priority: 'Major', updated: '2026-11-22', src: ['keyword'] }]);
  const keys = q => { J.state().q = q; return J.viewRows('main').map(r => r.key).sort().join(','); };
  [['', 'GABJO-12,GABJO-7,GABKJ-3', '빈 검색 = 전부'],
   ['박용훈 open', 'GABJO-7', '담당자+상태 AND(열이 달라도)'],
   ['gabjo_12', 'GABJO-12', '키 기호 무시(하이픈↔밑줄)'],   // ⚠️ 'gabjo 12' 는 GABJO-7 도 맞다 — 수정일 2026-11-20 안에 12 가 있다
   ['벤트', 'GABJO-12', '요약'],
   ['임희철', 'GABJO-12,GABJO-7', '담당자·보고자 둘 다'],
   ['noise resolved', '', 'AND — 한 이슈에 둘 다 없음']
  ].forEach(([q, want, label]) => { const got = keys(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [JIRA] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  J.state().q = 'major'; J.state().filters = { status: { Open: true } };
  chk(J.viewRows('main').map(r => r.key).sort().join() === 'GABJO-7,GABKJ-3', '[JIRA] 열 필터와 같이 걸린다');
  W._jiraClearAllFilters();
  chk(J.state().q === '' && Object.keys(J.state().filters).length === 0, '[JIRA] 필터 초기화가 찾기칸도 비운다');
}
// ── Daily Report 하루 보기(js/59 keepItems) — 진짜 js/59 전체를 스텁 DOM 위에서 불러 돌린다 ──
{
  const s59 = fs.readFileSync(path.join(__dirname, '..', 'js', '59-daily-report.js'), 'utf8');
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, appendChild: noop, querySelectorAll: () => [], querySelector: () => null, dataset: {} });
  const doc = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, createElement: el, readyState: 'complete', body: el(), visibilityState: 'visible' };
  const W = { addEventListener: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, _currentLang: 'ko' };
  new Function('window', helpers)(W);
  new Function('window', 'document', 'localStorage', s59)(W, doc, W.localStorage);
  const D = W._dailySearchInternals;
  const items = [
    { cat: 'HW', name: 'HARNESS 길이 검토', project: 'LNW_STELLAR32_32.0.json', note: '40P 300mm 로 확정', next: '', issue: '' },
    { cat: 'FW', name: 'EDID 수정', project: 'LNW_OBSIDIAN27_27.0.json', note: 'V1.02 배포', next: '고객 확인', issue: '' },
    { cat: 'ME', name: 'Back cover 도금', project: 'KONAMI_KGP-4_55.0.json', note: '', next: '', issue: '도금 불량 재발' }];
  const names = (q, who) => { W._dailyFilter = { who: '', proj: '', cat: '', q }; return D.keepItems(items, who || '박용훈').map(i => i.name).join('|'); };
  [['', 'HARNESS 길이 검토|EDID 수정|Back cover 도금', '빈 검색 = 전부'],
   ['박용훈 harness', 'HARNESS 길이 검토', '이름+업무 AND(이름은 사람 칸)'],
   ['stellar 300mm', 'HARNESS 길이 검토', '프로젝트+내용 AND'],
   ['kgp4', 'Back cover 도금', '프로젝트 파일명 기호 무시'],
   ['고객 확인', 'EDID 수정', '해야 할 일 칸'],
   ['불량', 'Back cover 도금', '막힌 일 칸'],
   ['임희철', '', '다른 사람 이름이면 0']
  ].forEach(([q, want, label]) => { const got = names(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Daily] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  W._dailyFilter = { who: '', proj: '', cat: 'FW', q: 'v1 02' };
  chk(D.keepItems(items, '박용훈').map(i => i.name).join() === 'EDID 수정', '[Daily] 구분 선택과 같이 걸린다');
  W._dailyFilter = { who: '', proj: '', cat: 'HW', q: 'edid' };
  chk(D.keepItems(items, '박용훈').length === 0, '[Daily] 구분과 찾기가 AND');
}
// ── Weekly Report(js/20 showWeeklyReport) — 진짜 js/20 을 불러 진짜 그리기 함수를 돌린다(DOM·주간 분류만 가짜) ──
{
  const s20 = fs.readFileSync(path.join(__dirname, '..', 'js', '20-weekly-report.js'), 'utf8');
  const noop = () => {};
  const container = { innerHTML: '', querySelectorAll: () => [], parentNode: { insertBefore: noop } };
  const ids = { 'weekly-report-page': container, 'wr-search-input': {}, 'wr-search-count': { textContent: '' } };   // 칸이 있으면 설치기는 건너뛴다
  const doc = { getElementById: id => ids[id] || null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, createElement: () => ({ style: {} }), readyState: 'complete', body: {} };
  const W = { addEventListener: noop, _currentLang: 'ko', wrBaseDate: new Date() };
  new Function('window', helpers)(W);
  new Function('window', 'document', 'colIdx', 'escapeHtml', 'globalData', 'setTimeout', s20)(W, doc, { content: 1 }, s => String(s), [], noop);
  const mk = (text, content) => ({ text, idx: 0, row: Object.assign(['', content], { _calcStartTs: 0, _calcPlanTs: 0 }) });
  let calls = 0;
  W.wrClassifyTasks = () => { calls++; return { thisWeek: { start: 0, end: 0 }, nextWeek: { start: 0, end: 0 }, thisWeekNo: 1, nextWeekNo: 2,
    thisList: [mk('HARNESS 검토', '[핵심내용] 40P 300mm\n담당: 박용훈'), mk('EDID 수정', 'V1.02 배포')],
    nextList: [mk('Back cover 도금', '[문제점] 도금 불량\n[대책] 재도금')] }; };
  W.wrSyncLevelFilterUI = noop; W.wrSyncTaskModeBtn = noop; W.wrAutoActivateNearest = noop;
  W.wrGetLevel0Timeline = () => ({ items: [], minTs: 0, maxTs: 1 });
  const show = q => { W._wrSearchTerm = q; W.showWeeklyReport(); const h = container.innerHTML;
    return ['HARNESS', 'EDID', 'Back cover'].filter(k => h.indexOf(k) !== -1).join('|') + ' #' + ids['wr-search-count'].textContent; };
  [['', 'HARNESS|EDID|Back cover #', '빈 검색 = 전부, 개수 비움'],
   ['harness 300mm', 'HARNESS #1 / 3건', '업무명+상세내용 AND'],
   ['v1 02', 'EDID #1 / 3건', '기호 무시'],
   ['도금 대책', 'Back cover #1 / 3건', '문제점·대책 줄도 찾음(문제점 표까지 같이)'],
   ['harness edid', ' #0 / 3건', 'AND — 한 업무에 둘 다 없음']
  ].forEach(([q, want, label]) => { const got = show(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Weekly] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  // PPT 출력은 화면 찾기를 안 탄다 — 진짜 출력 함수 본문이 찾기 상태를 읽지 않고 분류를 새로 부르는지 소스로 본다
  const pa = s20.indexOf('window.exportWeeklyReportPPT = ');
  const pbody = pa < 0 ? '' : s20.slice(pa, s20.indexOf('\n  window.', pa + 10));
  chk(pa >= 0 && pbody.indexOf('wrClassifyTasks()') !== -1 && pbody.indexOf('_wrSearch') === -1, '[Weekly] PPT 출력은 분류를 새로 부르고 찾기 상태를 안 읽는다(화면만 거른다)');
}
// ── Calendar(js/24 calRender · 날짜 팝업) — 진짜 js/24 를 불러 진짜 그리기 함수를 돌린다(DOM·간트 행만 가짜) ──
{
  const s24 = fs.readFileSync(path.join(__dirname, '..', 'js', '24-calendar-tab.js'), 'utf8');
  const noop = () => {};
  const page = { innerHTML: '', parentNode: { insertBefore: noop }, querySelectorAll: () => [] };
  const popBody = { innerHTML: '' }, popTitle = { textContent: '' }, overlay = { style: {} };
  const ids = { 'cal-page': page, 'cal-search-input': {}, 'cal-search-count': { textContent: '' }, 'cal-header-label': { textContent: '' },
                'cal-day-popup-overlay': overlay, 'cal-day-popup-body': popBody, 'cal-day-popup-title': popTitle };
  const doc = { getElementById: id => ids[id] || null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop,
                createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop } }), readyState: 'complete', body: {} };
  const W = { addEventListener: noop, _currentLang: 'ko', localStorage: { getItem: () => null, setItem: noop }, _t: (k) => k };
  new Function('window', helpers)(W);
  const now = new Date(); const ts = d => new Date(now.getFullYear(), now.getMonth(), d).getTime();
  const row = (name, content, status, d) => Object.assign([name, content, status], { _level: 4, _알림: true, _calcStartTs: ts(d), _calcPlanTs: ts(d) });
  const gd = [['h'], row('HARNESS 검토', '40P 300mm', '진행', 5), row('EDID 수정', 'V1.02 배포', '완료', 12), row('Back cover 도금', '도금 불량', '지연', 20), row('EDID 재검토', 'V1.03', '진행', 12)];
  new Function('window', 'document', 'globalData', 'colIdx', 'wrTaskName', 'escapeHtml', 'wrFormatMD', 'localStorage', 'setTimeout', s24)
    (W, doc, gd, { content: 1, status: 2 }, r => r[0], s => String(s), () => '', W.localStorage, noop);
  W.getSummaryAssignee = () => '박용훈'; W.calSyncLevelFilterUI = noop; W.calSyncTaskModeBtn = noop;
  W.calState.year = now.getFullYear(); W.calState.month = now.getMonth(); W.calState.viewMode = 'month';
  const show = q => { W._calSearchTerm = q; W.calRender(); const h = page.innerHTML;
    return ['HARNESS', 'EDID 수정', 'EDID 재검토', 'Back cover'].filter(k => h.indexOf(k) !== -1).join('|') + ' #' + ids['cal-search-count'].textContent; };
  [['', 'HARNESS|EDID 수정|EDID 재검토|Back cover #', '빈 검색 = 전부'],
   ['harness 300mm', 'HARNESS #1 / 4건', '업무명+내용 AND'],
   ['v1 02', 'EDID 수정 #1 / 4건', '기호 무시'],
   ['박용훈 지연', 'Back cover #1 / 4건', '담당자+상태 AND'],
   ['edid', 'EDID 수정|EDID 재검토 #2 / 4건', '같은 날 두 건 중 둘 다']
  ].forEach(([q, want, label]) => { const got = show(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Calendar] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  // 날짜 팝업도 달력에 보인 것과 같게
  W._calSearchTerm = '완료';
  const key12 = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-12';
  W.calShowDayPopup(key12);
  chk(popBody.innerHTML.indexOf('EDID 수정') !== -1 && popBody.innerHTML.indexOf('EDID 재검토') === -1, '[Calendar] 날짜 팝업 목록도 같은 찾기로 거른다');
}
// ── Gantt(js/26 _rowMatches) — 진짜 js/26 전체를 스텁 DOM 위에서 불러 행 판정을 돌린다 ──
{
  const s26 = fs.readFileSync(path.join(__dirname, '..', 'js', '26-gantt-search.js'), 'utf8');
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop, appendChild: noop, querySelectorAll: () => [], querySelector: () => null, dataset: {}, setAttribute: noop, getAttribute: () => null });
  const doc = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, createElement: el, readyState: 'complete', body: el(), documentElement: el() };
  const W = { addEventListener: noop, _currentLang: 'ko', localStorage: { getItem: () => null, setItem: noop } };
  new Function('window', helpers)(W);
  new Function('window', 'document', 'colIdx', 'globalData', 'localStorage', 'setTimeout', 'setInterval', 'MutationObserver', s26)
    (W, doc, { assignee: -1, content: 1, status: 2 }, [], W.localStorage, noop, noop, function () { return { observe: noop }; });
  const R = (t2, content, status, extra) => Object.assign(['', content, status], { _origDev: '개발', _origT1: '', _origT2: t2, _origT3: '', _origT4: '' }, extra || {});
  const rows = [R('HARNESS 검토', '[핵심내용] 40P 300mm', '진행'),
                R('EDID 수정', 'V1.02 배포', '완료', { _aiMatchedProjectName: 'LNW STELLAR32', _aiMatchKeywords: ['GABJO'] }),
                R('Back cover 도금', '[문제점] 도금 불량', '지연')];
  const hit = (kw, isProject) => rows.map((r, i) => W._gsRowMatches(r, kw, !!isProject, false, false) ? i : null).filter(i => i !== null).join(',');
  [['harness 300mm', '0', '업무명+상세내용 AND'],
   ['v1 02', '1', '기호 무시'],
   ['도금 지연', '2', '내용+상태 AND'],
   ['gabjo 완료', '1', 'AI 매칭 키워드+상태'],
   ['harness 완료', '', 'AND — 한 행에 둘 다 없음'],
   ['HARNESS', '0', '한 낱말은 예전과 같다']
  ].forEach(([q, want, label]) => { const got = hit(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Gantt] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  chk(hit('lnw stellar32', true) === '1', '[Gantt] @프로젝트명도 같은 규칙');
  // 📅 [2026-11-25] 날짜 — 행의 기간 [_calcStartTs, _calcPlanTs] 과 겹치면 걸린다(글자로만 맞추던 땐 0건)
  const Y = new Date().getFullYear();
  const ts = (y, m, d) => new Date(y, m - 1, d).getTime();
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  rows[0]._calcStartTs = ts(2026, 10, 20); rows[0]._calcPlanTs = ts(2026, 10, 28);   // 기간
  rows[1]._calcStartTs = ts(2026, 3, 25);  rows[1]._calcPlanTs = ts(2026, 3, 25);    // 하루짜리 (글자 "32" 가 날짜 안에 안 걸리는지도)
  rows[2]._calcStartTs = t0.getTime();     rows[2]._calcPlanTs = t0.getTime();       // 오늘
  // 📅 [2026-11-25 2차] 기본은 시작일만 — 시작일이 아닌 날짜는 안 걸린다
  W._gsSetDateSpan(false);
  [['2026-10-25', '', '[Gantt 날짜·시작일] 기간 한가운데는 안 걸림'], ['2026-10-20', '0', '[Gantt 날짜·시작일] 시작일 당일'],
   ['2026-10', '0', '[Gantt 날짜·시작일] 그 달에 시작'], ['2026-10-28', '', '[Gantt 날짜·시작일] 완료일은 안 걸림']
  ].forEach(([q, want, label]) => { const got = hit(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' "' + q + '" → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  // 🗓 기간 "A~B" (시작일만 모드: 시작일이 그 안)
  [['2026-10-01~2026-10-31', '0', '[Gantt 기간·시작일] 시작일이 기간 안'], ['2026-10-21 ~ 2026-10-31', '', '[Gantt 기간·시작일] 시작일이 기간 밖(띄어 써도 한 기간)'],
   ['2026-10-31~2026-10-01', '0', '[Gantt 기간] 거꾸로 적어도'], ['2026-03-01~', '0,1', '[Gantt 기간] 열린 끝 — 그 뒤 전부(오늘 행은 올해가 2026 이면)'],
   ['~2026-03-31', '1', '[Gantt 기간] 열린 시작'], ['2026-09~2026-10', '0', '[Gantt 기간] 월~월']
  ].forEach(([q, want, label]) => { let got = hit(q); if (q === '2026-03-01~') got = got.split(',').filter(x => x !== '2').join(','); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' "' + q + '" → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  W._gsSetDateSpan(true);
  [['2026-10-25~2026-10-30', '0', '[Gantt 기간·기간포함] 기간끼리 겹치면 걸림'], ['2026-10-29~2026-10-30', '', '[Gantt 기간·기간포함] 안 겹치면 안 걸림']
  ].forEach(([q, want, label]) => { const got = hit(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' "' + q + '" → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  W._gsSetDateSpan(true);   // 아래는 '기간 포함' 켠 상태
  [['2026-10-25', '0', '[Gantt 날짜] YYYY-MM-DD 가 기간 안'],
   ['2026.10.25', '0', '[Gantt 날짜] 점'], ['20261025', '0', '[Gantt 날짜] 8자리'], ['26-10-20', '0', '[Gantt 날짜] 2자리 연도 · 시작일 당일'],
   ['2026-10-29', '', '[Gantt 날짜] 기간 밖은 안 걸림'],
   ['2026-03-25', '1', '[Gantt 날짜] 하루짜리'], ['2026-02-30', '', '[Gantt 날짜] 없는 날짜는 날짜로 안 읽음'],
   ['2026-03', '1', '[Gantt 날짜] 연-월 = 그 달 전체'],
   ['오늘', '2', '[Gantt 날짜] 오늘'],
   ['harness 2026-10-25', '0', '[Gantt 날짜] 다른 낱말과 AND'],
   ['도금 2026-10-25', '', '[Gantt 날짜] AND — 날짜가 안 맞으면 빠짐'],
   ['32', '', '[Gantt 날짜] 숫자 하나는 날짜로 안 읽는다(2026-03-25 안의 "32" 가 걸리면 안 됨)']
  ].forEach(([q, want, label]) => { const got = hit(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' "' + q + '" → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  if (Y === 2026) {
    [['10/25', '0', 'M/D(올해)'], ['10-25', '0', 'M-D'], ["10/25'26", '0', "화면 모양 11/25'26"], ['10월 25일', '0', '11월 25일(띄어 써도)'], ['3월', '1', '3월 = 그 달']]
      .forEach(([q, want, label]) => { const got = hit(q); const ok = got === want; ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' [Gantt 날짜] ' + label + ' → ' + got + (ok ? '' : ' (기대 ' + want + ')')); });
  }
}
// 📅 [2026-11-25] 다른 페이지 찾기의 날짜·기간 — js/04a 공용 규칙(_searchMatchAll 이 글 속 날짜와 넘겨준 기간을 본다)
{
  const W = { _currentLang: 'ko' }; new Function('window', helpers)(W);
  const ts = (y, m, d) => new Date(y, m - 1, d).getTime();
  const tk = q => W._searchTokens(q);
  const M = (hay, q, dates) => W._searchMatchAll(hay, tk(q), dates);
  chk(JSON.stringify(tk('2026-11-01 ~ 2026-11-20, LNW')) === JSON.stringify(['2026-11-01~2026-11-20', 'lnw']), '[날짜 공용] "A ~ B" 는 띄어 써도 한 낱말');
  chk(JSON.stringify(tk('11월 25일 회의')) === JSON.stringify(['11월25일', '회의']), '[날짜 공용] "11월 25일" 은 한 낱말');
  chk(M('수정일 2026-11-20T09:10:00', '2026-11-15~2026-11-25'), '[날짜 공용] 글 속 ISO 날짜가 기간 안이면 걸림(JIRA 수정일)');
  chk(!M('수정일 2026-11-20T09:10:00', '2026-11-21~2026-11-25'), '[날짜 공용] 기간 밖이면 안 걸림');
  chk(M("시작 11/25'26", '2026-11-25'), "[날짜 공용] 간트 모양 11/25'26 도 날짜로 읽음");
  chk(M('2026-11-01~2026-11-30 출장', '2026-11-10'), '[날짜 공용] 글 속 기간 "A~B" 는 한 기간(사이 날짜도 걸림)');
  chk(!M('비율 1/2 · 수량 2026', '2026-01-02'), '[날짜 공용] 연도 없는 1/2·숫자만은 날짜로 안 읽음');
  chk(M('EDID 검토', '2026-11-12', W._searchSpan(ts(2026, 11, 10), ts(2026, 11, 14))), '[날짜 공용] 넘겨준 기간(달력 일정)과 겹치면 걸림');
  chk(!M('EDID 검토', '02', W._searchSpan(ts(2026, 11, 10), ts(2026, 11, 14))), '[날짜 공용] 기간을 글로 안 넣으니 "02" 가 연도에 안 걸림');
  chk(M('EDID 검토', 'edid, 2026-11', W._searchSpan(ts(2026, 11, 10), ts(2026, 11, 14))), '[날짜 공용] 낱말+월 AND');
  chk(M('EDID', '2026-11-12~', W._searchSpan(ts(2026, 11, 20), null)) && !M('EDID', '~2026-11-12', W._searchSpan(ts(2026, 11, 20), null)), '[날짜 공용] 열린 기간');
  chk(W._searchDateRange('32') === null && W._searchDateRange('2026-02-30') === null, '[날짜 공용] 숫자 하나·없는 날짜는 날짜 아님');
}
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
