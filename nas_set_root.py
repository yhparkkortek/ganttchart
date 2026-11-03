#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""📁 NAS 앱 데이터 루트 지정 (python nas_set_root.py)

왜 따로 있나: **사내 공유 경로를 코드/문서에 쓰지 않기 위해서**다(이 저장소는 GitHub Pages
  로 공개). 경로는 각 PC 의 `nas_login_config.json`(.gitignore)에만 들어간다 —
  `docstore_config.json` 과 같은 방식.

  root       공용 루트. 앱의 모든 공용 데이터가 여기 들어간다.
  team_root  팀 파일(프로젝트 JSON·백업·메일원문)의 부모.
             **비워 두면 root 와 같은 곳** = 1단계(팀별 파일까지 한곳에서 운영).
             안정화 후 팀 폴더로 이사할 때 **이 값만 채우면** 끝난다.

사용:
  python nas_set_root.py --list                     쓸 수 있는 폴더 후보 보기
  python nas_set_root.py --root "/공유/공용폴더/앱폴더"   공용 루트 지정(폴더는 없으면 만든다)
  python nas_set_root.py --team-root "/공유"          2단계: 팀 파일을 팀 폴더로
  python nas_set_root.py --team-root ""              1단계로 되돌리기(공용과 같은 곳)

⚠️ 폴더를 **만들기만** 한다. 기존 파일을 지우거나 옮기지 않는다.
"""
import argparse
import json
import sys

import nas_dsm

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def rights(perm):
    acl = (perm or {}).get('acl') or {}
    if not acl:
        return '?'
    return '%s%s%s' % ('R' if acl.get('read') else '-',
                       'W' if acl.get('write') else '-',
                       'A' if acl.get('append') else '-')


def show_candidates():
    r = nas_dsm.login_once()
    if not r.get('ok'):
        print('❌ %s' % r.get('message'))
        return 1
    print('쓸 수 있는 폴더(= 앱 루트 후보). R읽기 W수정 A추가\n')
    found = 0
    for s in nas_dsm.list_shares():
        try:
            top = nas_dsm.list_folder(s['path'], limit=300)
        except Exception:
            continue
        subs = [i for i in top['items'] if i['isdir'] and not i['name'].startswith('#')]
        need = [i['path'] for i in subs if not isinstance(i.get('perm'), dict)]
        if need:
            try:
                got = {x['path']: x.get('perm') for x in nas_dsm.path_info(need)}
                for i in subs:
                    if got.get(i['path']):
                        i['perm'] = got[i['path']]
            except Exception:
                pass
        for i in subs:
            rt = rights(i.get('perm'))
            if 'A' in rt or 'W' in rt:
                found += 1
                print('  ✍️ %-50s %s' % (i['path'], rt))
    if not found:
        print('  (없음 — 쓰기 권한이 있는 폴더가 보이지 않습니다)')
    print('\n→ 앱 폴더를 그 아래 하나 만들어 쓰는 것을 권합니다(다른 자료와 섞이지 않게):')
    print('   python nas_set_root.py --root "<위 경로 중 하나>/KortekGantt"')
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('--list', action='store_true', help='쓸 수 있는 폴더 후보 보기')
    ap.add_argument('--root', help='공용 루트 절대경로 (/공유/... 로 시작)')
    ap.add_argument('--team-root', dest='team_root',
                    help='팀 파일의 부모. 빈 문자열이면 공용 루트와 같은 곳(1단계)')
    a = ap.parse_args()

    if a.list:
        return show_candidates()
    if a.root is None and a.team_root is None:
        ap.print_help()
        print('\n현재 설정:')
        cfg = nas_dsm.load_config() or {}
        print('  root      = %s' % (cfg.get('root') or '(없음)'))
        print('  team_root = %s' % (cfg.get('team_root') or '(없음 → root 와 같은 곳 = 1단계)'))
        return 0

    cfg = nas_dsm.load_config()
    if not cfg:
        print('❌ NAS 계정이 먼저 필요합니다 — python nas_set_login.py')
        return 1

    if a.root is not None:
        root = a.root.replace(chr(92), '/').rstrip('/')
        if not root.startswith('/') or root.count('/') < 2:
            print('❌ root 는 /공유이름/하위폴더 형태의 절대경로여야 합니다.')
            return 1
        r = nas_dsm.login_once()
        if not r.get('ok'):
            print('❌ %s' % r.get('message'))
            return 1
        try:
            nas_dsm.ensure_folder(root)
        except Exception as e:
            print('❌ 폴더를 만들지 못했습니다: %s' % e)
            return 1
        cfg['root'] = root
        print('✅ 공용 루트: %s' % root)

    if a.team_root is not None:
        t = a.team_root.replace(chr(92), '/').rstrip('/')
        if t and not t.startswith('/'):
            print('❌ team_root 는 절대경로여야 합니다(또는 빈 문자열).')
            return 1
        cfg['team_root'] = t
        print('✅ 팀 파일 부모: %s' % (t or '(공용 루트와 같은 곳 = 1단계)'))

    with open(nas_dsm.NAS_LOGIN_CFG, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print('\n설정을 저장했습니다 (nas_login_config.json — .gitignore)')
    print('다음: python tests/nas-write-probe.py  — 실제로 쓰고 읽고 덮어써 봅니다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
