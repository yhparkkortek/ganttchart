/* 🔀 js/57-storage-adapter.js 의 **조용히 틀리기 쉬운 부분**만 단독 검증
   (node tests/storage-adapter.test.js)

왜 있나: 어댑터가 하는 일은 "Drive 말을 NAS 말로 옮기는 것"이다. 여기서 틀리면
  오류가 나는 게 아니라 **엉뚱한 파일을 읽거나 조건을 덜 걸고 전건을 돌려준다** —
  조용한 오답이고, 사람이 눈치채기까지 오래 걸린다. 그래서 번역기(id 인코딩·q 파서·
  multipart 파서·Drive 응답 모양)를 NAS 도 백엔드도 브라우저도 없이 여기서 돌린다.

⚠️ 이 검증이 통과해도 **앱이 NAS 로 돌아간다는 증거는 아니다.** 번역기만 본 것이다.
   연결부(fetch 가로채기 → 백엔드 라우트 → NAS)는 브라우저에서 돌려야 한다
   → tests/storage-adapter.browser.js
   (2026-10-29 칩 표 사고의 교훈: 렌더러만 돌려 보고 "된다"고 하면 안 된다)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'js', '57-storage-adapter.js');
const ROOT_ID = '1ldb3Bc7dNNSKKgmNviw43aCgrvxQG9bS';   // js/04a 의 SHARED_FOLDER_ID

let ok = 0, bad = 0;
function check(label, cond, detail) {
    if (cond) { ok++; console.log('  ✅ ' + label + (detail ? ' · ' + detail : '')); }
    else { bad++; console.log('  ❌ ' + label + (detail ? ' · ' + detail : '')); }
    return cond;
}
function eq(label, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    return check(label, g === w, g === w ? '' : 'got ' + g + ' / want ' + w);
}

// ── 어댑터를 샌드박스에서 불러온다. localStorage 가 없으니 플래그는 꺼진 상태로 뜬다
//    (= 순수 함수만 노출되고 fetch/gapi 는 건드리지 않는다. 그 자체가 첫 검증이다)
const sandbox = {
    window: {}, console,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    SHARED_FOLDER_ID: ROOT_ID,
    setInterval: () => { throw new Error('플래그가 꺼져 있는데 setInterval 을 걸었습니다'); },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(FILE, 'utf8'), sandbox, { filename: FILE });

const SA = sandbox.window.STORAGE_ADAPTER;
const F = SA && SA._fn;

console.log('== ① 플래그 OFF — 아무것도 감싸지 않는다 ==');
check('STORAGE_ADAPTER 는 노출된다', !!SA, 'v' + (SA && SA.version));
check('installed=false', SA && SA.installed === false);
check('backend=drive', SA && SA.backend === 'drive', String(SA && SA.backend));
check('window.fetch 를 안 만들었다', sandbox.window.fetch === undefined);
check('window.gapi 를 안 만들었다', sandbox.window.gapi === undefined);
check('순수 함수는 쓸 수 있다', !!(F && F.parseQ));
if (!F) { console.log('\n통과 ' + ok + ' · 실패 ' + bad); process.exit(1); }

console.log('\n== ② id ↔ 경로 왕복 ==');
for (const rel of ['project.json', '개발3팀/한글 키-이름.json',
                   '_App_Config/AddressBook_Shared.json', 'Backups/개발1팀/백업_a.json']) {
    const id = F.idOf(rel, false);
    const back = F.relOf(id);
    check('왕복: ' + rel, back && back.rel === rel && back.isdir === false, id.slice(0, 28) + '…');
}
eq('빈 경로는 루트 id', F.idOf('', true), ROOT_ID);
eq('루트 id 는 빈 경로로', F.relOf(ROOT_ID), { rel: '', isdir: true });
check('폴더/파일 구분이 살아 있다', F.relOf(F.idOf('a/b', true)).isdir === true &&
      F.relOf(F.idOf('a/b', false)).isdir === false);
check('Drive 의 남의 id 는 건드리지 않는다(null)', F.relOf('1AbCdEfGhIjKlMnOpQrStUv') === null);
check('빈 id 도 null', F.relOf('') === null);

console.log('\n== ②-2 🗺 옛 Drive id 지도 — 전환해도 저장된 id 가 그대로 통해야 한다 ==');
// ⚠️⚠️ 이게 이 기능의 전부다. 앱 데이터 안에 Drive 파일 id 가 **5,089곳** 박혀 있고
//    코드는 `drive_file_id === currentDriveFileId` 처럼 **같은지 비교**한다.
//    id 체계가 바뀌면 그 비교가 전부 빗나가고, 오류가 아니라 **조용히 안 맞는다.**
const OLD_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz01234';
const n = F.adoptIdMap({ version: 1, map: { [OLD_ID]: '개발3팀/LNW_27.0.json' } });
eq('지도 1건을 들였다', n, 1);
eq('옛 id 가 경로로 풀린다', F.relOf(OLD_ID), { rel: '개발3팀/LNW_27.0.json', isdir: false });
eq('그 경로는 **옛 id 를 그대로** 돌려준다', F.idOf('개발3팀/LNW_27.0.json', false), OLD_ID);
check('목록 항목에도 옛 id 가 실린다',
      F.toDriveFile({ name: 'LNW_27.0.json', isdir: false, size: 10 }, '개발3팀').id === OLD_ID);
check('지도에 없는 파일은 여전히 만든 id', F.idOf('개발3팀/다른.json', false).indexOf('nas_f_') === 0);
check('폴더는 지도를 안 탄다', F.idOf('개발3팀/LNW_27.0.json', true).indexOf('nas_d_') === 0);
check('지도에 없는 남의 Drive id 는 그대로 null', F.relOf('1ZZZzzzNotInTheMapAtAll999') === null);
eq('지도를 비우면 원래대로', F.adoptIdMap({ map: {} }), 0);
check('비운 뒤엔 만든 id', F.idOf('개발3팀/LNW_27.0.json', false).indexOf('nas_f_') === 0);

console.log('\n== ③ 경로 가드 ==');
let threw = false;
try { F.normRel('../밖으로.json'); } catch (e) { threw = true; }
check('상위참조(..)는 거부', threw);
eq('슬래시/점 정리', F.normRel('/a//./b/'), 'a/b');
eq('역슬래시도 구분자로', F.normRel('a\\b'), 'a/b');
eq('joinRel 루트', F.joinRel('', 'x.json'), 'x.json');
eq('joinRel 하위', F.joinRel('개발3팀', 'x.json'), '개발3팀/x.json');

console.log('\n== ④ Drive q 파싱 — 앱이 **실제로 쓰는** 질의들 ==');
const FOLDER = 'application/vnd.google-apps.folder';
const T = ROOT_ID, A = F.idOf('개발1팀', true), B = F.idOf('개발2팀', true);

let q = F.parseQ("mimeType='" + FOLDER + "' and '" + T + "' in parents and trashed=false");
eq('하위 폴더 조회(js/04b:461)', [q.mime, q.parents, q.name, q.unknown], [FOLDER, [T], null, []]);

q = F.parseQ("mimeType='application/json' and trashed=false and '" + T + "' in parents");
eq('프로젝트 파일 조회(js/04b:578)', [q.mime, q.parents, q.unknown], ['application/json', [T], []]);

q = F.parseQ("mimeType='" + FOLDER + "' and name='Backups' and trashed=false and '" + T + "' in parents");
eq('이름+종류+부모(js/04b:757)', [q.mime, q.name, q.parents, q.unknown], [FOLDER, 'Backups', [T], []]);

q = F.parseQ("name='project_index.json' and trashed=false and '" + T + "' in parents");
eq('이름+부모(js/04b:945)', [q.name, q.parents, q.mime, q.unknown],
   ['project_index.json', [T], null, []]);

q = F.parseQ("'" + T + "' in parents and trashed=false");
eq('부모만(js/04b:1012)', [q.parents, q.name, q.mime, q.unknown], [[T], null, null, []]);

q = F.parseQ("'" + T + "' in parents or '" + A + "' in parents or '" + B + "' in parents");
eq('부모 OR 묶음(js/04b:486)', [q.parents.length, q.parents[0] === T, q.unknown], [3, true, []]);

q = F.parseQ("name='한글 파일.json' and '" + A + "' in parents and trashed=false");
eq('한글 이름(js/22a:1156)', [q.name, q.parents, q.unknown], ['한글 파일.json', [A], []]);

q = F.parseQ("name='O\\'Brien.json' and '" + T + "' in parents");
eq("이름 안 따옴표 이스케이프", [q.name, q.unknown], ["O'Brien.json", []]);

q = F.parseQ("name='a and b or c.json' and '" + T + "' in parents");
eq('이름 안의 and/or 는 이름이다', [q.name, q.parents.length, q.unknown],
   ['a and b or c.json', 1, []]);

q = F.parseQ("mimeType!='" + FOLDER + "' and '" + T + "' in parents");
eq('mimeType 아님', [q.mimeNot, q.unknown], [FOLDER, []]);

console.log('\n   ⚠ 모르는 절은 **무시하지 않고 신고**한다 (무시하면 전건을 돌려주는 조용한 오답)');
q = F.parseQ("fullText contains 'x' and '" + T + "' in parents");
check('모르는 절을 unknown 에 담는다', q.unknown.length === 1, JSON.stringify(q.unknown));
eq('그래도 아는 절은 읽는다', q.parents, [T]);
// ⚠️ 신고 문구는 **사람이 읽을 수 있어야** 한다. 내부 자리표시(\u0000N\u0000)가 그대로
//    새어 나가 "fullText contains \u00000\u0000" 이라고 찍힌 적이 있다(2026-11-03 실측).
eq('신고 문구에 원래 글자가 보인다', q.unknown[0], "fullText contains 'x'");
check('내부 자리표시가 안 샌다', q.unknown[0].indexOf('\u0000') < 0);

console.log('\n== ⑤ multipart 업로드 본문 파싱 — 앱이 손으로 조립한 **그 모양** ==');
// js/04b backupToDrive 가 만드는 모양 그대로(앞에 \r\n 이 붙고, 머리글에 charset 이 있다)
const bd = 'backup_boundary';
const meta = { name: '백업_test.json', mimeType: 'application/json', parents: [A],
               appProperties: { themeColor: '#123456' } };
const content = JSON.stringify({ rows: [1, 2, 3], note: '한글' });
const body = '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
             JSON.stringify(meta) +
             '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + content +
             '\r\n--' + bd + '--';
let mp = F.parseMultipart(body, 'multipart/related; boundary="' + bd + '"');
check('metadata 를 읽었다', mp && mp.meta && mp.meta.name === meta.name, mp && mp.meta && mp.meta.name);
eq('부모도 읽었다', mp.meta.parents, [A]);
eq('본문이 **한 글자도 안 틀리게** 나온다', mp.media, content);
check('base64 아님', mp.mediaIsB64 === false);

mp = F.parseMultipart(body, 'multipart/related; boundary=' + bd);   // 따옴표 없는 boundary
eq('따옴표 없는 boundary 도', mp.media, content);

const bodyB64 = '--X\r\nContent-Type: application/json\r\n\r\n{"name":"a.bin","parents":["' + A +
                '"]}\r\n--X\r\nContent-Type: application/octet-stream\r\n' +
                'Content-Transfer-Encoding: base64\r\n\r\nAAEC\r\n--X--';
mp = F.parseMultipart(bodyB64, 'multipart/related; boundary="X"');
check('base64 본문을 base64 로 표시', mp.mediaIsB64 === true, mp.media);
eq('base64 본문 그대로', mp.media, 'AAEC');
check('multipart 가 아니면 null', F.parseMultipart('x', 'application/json') === null);

console.log('\n== ⑥ NAS 목록 항목 → Drive 응답 모양 ==');
const df = F.toDriveFile({ name: 'project.json', isdir: false, size: 1234, mtime: 1762000000 },
                         '개발3팀');
eq('이름', df.name, 'project.json');
eq('mimeType', df.mimeType, 'application/json');
eq('부모 id 가 폴더 id', df.parents, [F.idOf('개발3팀', true)]);
eq('크기는 문자열(Drive 와 같게)', df.size, '1234');
check('modifiedTime 은 ISO', /^\d{4}-\d\d-\d\dT/.test(df.modifiedTime), df.modifiedTime);
check('id 가 경로로 되돌아간다', F.relOf(df.id).rel === '개발3팀/project.json');
eq('폴더는 폴더 mimeType', F.toDriveFile({ name: 'Backups', isdir: true }, '').mimeType, FOLDER);
check('폴더엔 size 가 없다', F.toDriveFile({ name: 'B', isdir: true }, '').size === undefined);
eq('.txt', F.mimeOf('a.txt', false), 'text/plain');
eq('.eml', F.mimeOf('a.eml', false), 'message/rfc822');
eq('.enc', F.mimeOf('mail_secure.enc', false), 'application/octet-stream');
eq('모르는 확장자', F.mimeOf('a.zzz', false), 'application/octet-stream');

console.log('\n통과 ' + ok + ' · 실패 ' + bad);
console.log('⚠ 번역기만 검증했다. 앱이 NAS 로 저장하는지는 브라우저에서 확인해야 한다' +
            ' (tests/storage-adapter.browser.js).');
process.exit(bad ? 1 : 0);
