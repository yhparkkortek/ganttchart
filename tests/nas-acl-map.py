#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🗺️ 어디에 **쓸 수 있나** — 공유/하위폴더 ACL 지도 (python tests/nas-acl-map.py)

왜 있나: "프로젝트를 본인 팀 폴더에 만든다"는 설계가 되는지는 **그 폴더에 쓸 수 있는지**에
  전부 달려 있다. 공유 루트가 읽기 전용(posix 555)이어도 **하위 폴더는 다를 수 있다** —
  공유 루트는 잠그고 팀 폴더만 그 팀에 쓰기를 주는 게 흔한 구성이다. 그러니 추측하지 말고 읽는다.

⚠️ 읽기만 한다. 파일을 만들어 보는 식의 확인은 **하지 않는다**(남의 팀 폴더에 쓰레기를 남긴다).
   `additional=["perm"]` 가 돌려주는 유효 ACL 을 읽는다.
⚠️ 한 계정으로 본 그림일 뿐이다. **다른 팀 계정에서 어떻게 보이는지는 이걸로 알 수 없다** —
   "개발3팀 폴더가 개발1팀 사람에게 보이는가"는 그 계정으로 직접 돌려 봐야 한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nas_dsm  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def rights(perm):
    """유효 권한을 'R/W/D' 한 줄로. 모르면 '?'."""
    if not isinstance(perm, dict):
        return '?'
    acl = perm.get('acl') or {}
    if not acl:
        return '?'
    r = 'R' if acl.get('read') else '-'
    w = 'W' if acl.get('write') else '-'
    a = 'A' if acl.get('append') else '-'      # append = 새 파일 추가
    d = 'D' if acl.get('del') else '-'
    return '%s%s%s%s posix=%s' % (r, w, a, d, perm.get('posix'))


def main():
    res = nas_dsm.login_once()
    if not res.get('ok'):
        print('❌ %s' % res.get('message'))
        return 1
    print('%s\n' % res.get('message'))
    print('표기: R읽기 W쓰기(기존파일수정) A추가(새파일/폴더 생성) D삭제\n')

    writable = []
    for s in nas_dsm.list_shares():
        print('■ 공유 %-12s %s' % (s['name'], rights(s.get('perm'))))
        try:
            top = nas_dsm.list_folder(s['path'], limit=300)
        except Exception as e:
            print('    목록 실패: %s' % e)
            continue
        subs = [i for i in top['items'] if i['isdir'] and not i['name'].startswith('#')]
        # `list` 의 perm 이 비어 오는 경우가 있어 폴더 자신의 권한을 getinfo 로 보강한다.
        need = [i['path'] for i in subs if not isinstance(i.get('perm'), dict)]
        if need:
            try:
                got = {x['path']: x.get('perm') for x in nas_dsm.path_info(need)}
                for i in subs:
                    if i['path'] in got and got[i['path']]:
                        i['perm'] = got[i['path']]
            except Exception as e:
                print('    (권한 보강 실패: %s)' % e)
        for sub in subs:
            rt = rights(sub.get('perm'))
            mark = '✍️' if ('W' in rt or 'A' in rt) else '  '
            print('   %s %-32s %s' % (mark, sub['name'], rt))
            if 'A' in rt or 'W' in rt:
                writable.append('%s/%s' % (s['name'], sub['name']))
        print('')

    print('== 쓸 수 있는 곳 (프로젝트 파일을 둘 수 있는 후보) ==')
    if writable:
        for w in writable:
            print('  ✍️ %s' % w)
    else:
        print('  (없음 — 하위 폴더 어디에도 쓰기 권한이 없습니다)')
    print('\n⚠️ 다른 팀 계정에서 어떻게 보이는지는 이 결과로 알 수 없습니다 —')
    print('   "공용 데이터를 어디 둘 것인가"는 **다른 팀 계정으로 한 번 더** 돌려 봐야 정해집니다.')
    nas_dsm.logout()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
