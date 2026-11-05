# -*- coding: utf-8 -*-
"""🗂 /nas/docroot-auto + _docstore_autoconfig — 검증 하네스 (2026-11-05)

    py -3 tests/test_nas_docroot_auto.py

왜 있나 — 팀원 PC 신고: "프로젝트 파일은 불러오는데 다른 NAS 파일은 접속 못함".
원인은 **두 저장소가 다른 길**인데 입구가 하나뿐이었던 것:
  · 프로젝트 파일 = /nas/app/*  → DSM REST API(HTTPS)       → NAS 로그인만 하면 된다
  · 사양서·도면·자료실 = /doc/* → 윈도가 직접 읽는 SMB UNC  → docstore_config.json 이 따로 필요
그 4단계를 `🚀 간편 전환`(/nas/setup)만 밟고 있어서, 🔑 로그인 칸에서 계정만 저장한 PC 는
DSM 은 붙고 자료실은 경로가 **빈 채로** 남았다.

⚠️ 사용자가 돌리는 5000번 프로세스를 죽이지 않는다 — `app.test_client()` 로만 두드린다.
⚠️ NAS·SMB 없이 돈다. 가짜는 **경계에만**: `_docstore_probe_root`(윈도 SMB 접근)와
   `nas_dsm` 모듈(DSM API) 둘뿐. 안쪽(`_docstore_autoconfig`·라우트)은 진짜 코드가 돈다.
"""
import io, json, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('KORTEK_BACKEND_TEST', '1')

import kortek_backend as kb

PASS = []
FAIL = []


def ok(name, cond, extra=None):
    (PASS if cond else FAIL).append(name if cond else '%s  → %r' % (name, extra))


class FakeNas(object):
    """DSM 경계만 흉내 — 경로 조립(unc_of)은 진짜와 같은 규칙으로."""
    def __init__(self, root='/RND_ETC/100_공통/KORTEK_PM', host='nas.example'):
        self._root, self._host = root, host
        self.raised = False

    def roots(self):
        if self.raised:
            raise RuntimeError('앱 루트가 설정되어 있지 않습니다.')
        return self._root, self._root

    def unc_of(self, path):
        p = str(path or '').replace(chr(92), '/').strip('/')
        if not p:
            return ''
        return (chr(92) * 2) + self._host + chr(92) + p.replace('/', chr(92))


def run():
    tmp = tempfile.mkdtemp(prefix='docroot-auto-')
    kb.DOCSTORE_CONFIG_FILE = os.path.join(tmp, 'docstore_config.json')

    orig_probe, orig_nas = kb._docstore_probe_root, kb._nas
    probe = {'ok': True, 'err': ''}
    kb._docstore_probe_root = lambda root: (probe['ok'], probe['err'])
    fake = FakeNas()
    kb._nas = lambda: fake
    client = kb.app.test_client()

    def cfg_on_disk():
        try:
            with io.open(kb.DOCSTORE_CONFIG_FILE, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None

    try:
        EXPECT = (chr(92) * 2) + 'nas.example' + chr(92) + \
                 'RND_ETC' + chr(92) + '100_공통' + chr(92) + 'KORTEK_PM' + chr(92) + '개발자료실'

        # ── ① 팀원 PC: 자료실 경로가 비어 있다 → 앱 폴더에서 만들어 저장한다
        r = client.post('/nas/docroot-auto', json={}).get_json()
        ok('① 빈 PC 에서 ok', r.get('ok') is True, r)
        ok('① changed=True (새로 맞췄다)', r.get('changed') is True, r)
        ok('① 경로가 앱 폴더/개발자료실 UNC', r.get('root') == EXPECT, r.get('root'))
        ok('① 파일에 실제로 저장됐다', (cfg_on_disk() or {}).get('root') == EXPECT, cfg_on_disk())

        # ── ② 이미 닿고 있으면 **건드리지 않는다**(사람이 정해 둔 경로 보호)
        MINE = (chr(92) * 2) + 'other' + chr(92) + '내가정한폴더'
        with io.open(kb.DOCSTORE_CONFIG_FILE, 'w', encoding='utf-8') as f:
            f.write(json.dumps({'root': MINE, 'folders': ['PARTS']}, ensure_ascii=False))
        r = client.post('/nas/docroot-auto', json={}).get_json()
        ok('② 멀쩡하면 changed=False', r.get('ok') is True and r.get('changed') is False, r)
        ok('② 사람이 정한 경로를 안 덮어쓴다', (cfg_on_disk() or {}).get('root') == MINE, cfg_on_disk())
        ok('② folders 도 그대로', (cfg_on_disk() or {}).get('folders') == ['PARTS'], cfg_on_disk())

        # ── ③ SMB 자격증명 실패(WinError 1326 류) → 조용히 성공하지 않는다
        probe.update(ok=False, err='문서 저장소에 로그인하지 못했습니다 (Windows 오류 1326).')
        os.remove(kb.DOCSTORE_CONFIG_FILE)
        r = client.post('/nas/docroot-auto', json={}).get_json()
        ok('③ 못 닿으면 ok=False', r.get('ok') is False, r)
        ok('③ 사유를 그대로 돌려준다', '1326' in (r.get('message') or ''), r.get('message'))
        ok('③ 실패했으면 설정을 쓰지 않는다', cfg_on_disk() is None, cfg_on_disk())
        probe.update(ok=True, err='')

        # ── ④ 앱 폴더가 없으면 정직하게 실패한다(엉뚱한 경로를 지어내지 않는다)
        fake.raised = True
        r = client.post('/nas/docroot-auto', json={}).get_json()
        ok('④ 앱 폴더 없으면 ok=False', r.get('ok') is False, r)
        ok('④ 사유가 비어 있지 않다', bool(r.get('message')), r)
        ok('④ 설정 파일을 만들지 않는다', cfg_on_disk() is None, cfg_on_disk())
        fake.raised = False

        # ── ⑤ docRoot 를 직접 주면 그걸 쓴다(간편 전환이 기본값 파일에서 넘기는 길)
        GIVEN = (chr(92) * 2) + 'nas.example' + chr(92) + '별도자료실'
        r = client.post('/nas/docroot-auto', json={'docRoot': GIVEN}).get_json()
        ok('⑤ 준 경로를 그대로 쓴다', r.get('ok') is True and r.get('root') == GIVEN, r)

        # ── ⑥ 간편 전환과 **같은 함수**를 쓰는가 (두 벌로 갈라지면 이 버그가 돌아온다)
        os.remove(kb.DOCSTORE_CONFIG_FILE)
        okd, droot, _msg = kb._docstore_autoconfig(fake, '/RND_ETC/100_공통/KORTEK_PM')
        ok('⑥ 헬퍼 단독 호출도 같은 결과', okd is True and droot == EXPECT, (okd, droot))
        src = io.open(os.path.join(os.path.dirname(kb.__file__), 'kortek_backend.py'),
                      encoding='utf-8').read()
        seg = src[src.index('def nas_setup('):src.index('def nas_root_candidates(')]
        ok('⑥ /nas/setup 이 헬퍼를 쓴다', '_docstore_autoconfig' in seg)
        ok('⑥ /nas/setup 에 옛 복사본이 안 남아 있다',
           'DOCSTORE_CONFIG_FILE' not in seg, '복사본이 남아 있으면 또 갈라진다')
    finally:
        kb._docstore_probe_root, kb._nas = orig_probe, orig_nas

    for p in PASS:
        print('  OK   ' + p)
    for f in FAIL:
        print('  FAIL ' + f)
    print('\n%d / %d 통과%s' % (len(PASS), len(PASS) + len(FAIL),
                                '' if not FAIL else '   ** 실패 %d **' % len(FAIL)))
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(run())
