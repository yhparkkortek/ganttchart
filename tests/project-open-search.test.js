// 🔍 프로젝트 불러오기 검색(js/04c PROJECT_SEARCH_FIELDS + showDriveFileModal) — 진짜 소스를 잘라 돌린다.
// 가짜는 DOM 경계뿐(최소 스텁). 실행: node tests/project-open-search.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '04c-core-app-mail-pipeline.js'), 'utf8');
const a = src.indexOf('    const _arr = function(v)');
const b = src.indexOf('window.closeDriveModal = function');
const bEnd = src.indexOf('\n    }', b) + 6;
if (a < 0 || b < 0) { console.log('FAIL 소스 자르기'); process.exit(1); }
const piece = src.slice(a, bEnd);

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
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
