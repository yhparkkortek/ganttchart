#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🔌 /nas/* 라우트 검증 — 앱이 실제로 부르는 HTTP 경로를 통과시킨다
   (python tests/nas-routes-probe.py)

왜 있나: `nas_dsm` 함수가 되는 것과 **라우트가 되는 것은 다른 일**이다. 2026-10-29 칩 표
  사고가 바로 그 교훈이었다 — 렌더러만 직접 불러 "된다"고 보고했는데 깨져 있던 건 연결부였다.
  그래서 여기서는 `app.test_client()` 로 **라우트를 통해** 쓰고 읽고 지운다.

⚠️ 사용자가 돌리는 5000번 프로세스를 **죽이지 않는다** — `app.test_client()` 만 쓴다
   (예약 발송·SAP 작업이 돌고 있을 수 있다).
⚠️ 테스트는 앱 루트 아래 `_route_probe/` 안에서만 하고 **끝나면 지운다**(실패해도).
⚠️ 가드레일도 같이 시험한다 — 절대경로·상위참조가 **거부되는지**. 거부돼야 정상이다.
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kortek_backend import app  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DIR = '_route_probe'
TEAM = '개발3팀'
ok_n = 0
bad_n = 0


def check(label, cond, detail=''):
    global ok_n, bad_n
    if cond:
        ok_n += 1
        print('  ✅ %s %s' % (label, detail))
    else:
        bad_n += 1
        print('  ❌ %s %s' % (label, detail))
    return cond


def jpost(c, url, payload):
    r = c.post(url, data=json.dumps(payload), content_type='application/json')
    try:
        return r.status_code, r.get_json()
    except Exception:
        return r.status_code, None


def main():
    c = app.test_client()

    print('== ① /nas/paths — 앱 루트가 정해져 있나 ==')
    r = c.get('/nas/paths')
    d = r.get_json() or {}
    if not check('configured', d.get('configured'), '· %s' % (d.get('message') or '')):
        print('   → python nas_set_root.py --list  로 후보를 보고 --root 로 지정하세요.')
        return 1
    print('     root=%s · 팀 분리=%s' % (d.get('root'), d.get('teamSeparate')))
    check('layout 이름 옴', isinstance(d.get('layout'), dict),
          '· %s' % sorted((d.get('layout') or {}).keys()))

    try:
        print('\n== ② 가드레일 — 거부돼야 하는 입력 ==')
        st, _ = jpost(c, '/nas/app/put', {'rel': '/어떤공유/아무데나.json', 'text': 'x'})
        check('절대경로 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/app/put', {'rel': '../밖으로.json', 'text': 'x'})
        check('상위참조(..) 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/app/put', {'rel': '%s/x.json' % DIR})
        check('본문 없으면 거부', st == 400, '· HTTP %s' % st)

        print('\n== ③ 쓰기 → 읽기 (텍스트, 한글) ==')
        rel = '%s/검증.json' % DIR
        body = '{"안녕":"하세요","n":1}'
        st, d1 = jpost(c, '/nas/app/put', {'rel': rel, 'text': body})
        check('put 성공', st == 200 and (d1 or {}).get('ok'),
              '· HTTP %s · 원자적=%s' % (st, (d1 or {}).get('atomic')))
        r = c.get('/nas/app/get?rel=%s' % rel)
        got = r.data.decode('utf-8') if r.status_code == 200 else None
        check('get 이 같은 내용', got == body,
              '· HTTP %s%s' % (r.status_code, '' if got == body else ' · 받은 값 %r' % (got or '')[:60]))

        print('\n== ④ 덮어쓰기 ==')
        body2 = '{"안녕":"또 왔습니다","n":2}'
        jpost(c, '/nas/app/put', {'rel': rel, 'text': body2})
        r = c.get('/nas/app/get?rel=%s' % rel)
        got2 = r.data.decode('utf-8') if r.status_code == 200 else ''
        check('새 내용으로 바뀜', got2 == body2)
        check('옛 내용이 안 섞임', bool(got2) and '"n":1' not in got2)

        print('\n== ⑤ 이진 파일 (b64) ==')
        blob = bytes(range(256)) * 4
        relb = '%s/bin.dat' % DIR
        st, _ = jpost(c, '/nas/app/put',
                      {'rel': relb, 'b64': base64.b64encode(blob).decode('ascii')})
        r = c.get('/nas/app/get?rel=%s' % relb)
        check('이진 왕복 바이트 동일', st == 200 and r.data == blob,
              '· %d바이트 보냄 / %d바이트 받음' % (len(blob), len(r.data)))

        print('\n== ⑥ 팀 경로 — 1단계에선 앱 루트 아래 <팀>/ ==')
        st, dt = jpost(c, '/nas/app/put',
                       {'rel': 'project_test.json', 'team': TEAM, 'text': '{"team":1}'})
        check('팀 파일 쓰기', st == 200 and (dt or {}).get('ok'), '· HTTP %s' % st)
        if dt and dt.get('path'):
            check('경로에 팀 이름이 들어감', TEAM in dt['path'], '· %s' % dt['path'])
        r = c.get('/nas/app/get?rel=project_test.json&team=%s' % TEAM)
        check('팀 파일 읽기', r.status_code == 200 and r.data == b'{"team":1}',
              '· HTTP %s' % r.status_code)

        print('\n== ⑦ 목록 ==')
        r = c.get('/nas/app/list?rel=%s' % DIR)
        dl = r.get_json() or {}
        names = [i['name'] for i in (dl.get('items') or [])]
        check('목록에 쓴 파일이 보임', '검증.json' in names and 'bin.dat' in names,
              '· %s' % names)

        print('\n== ⑦-2 앱 루트 자체 조회 — 이게 400 이면 프로젝트 목록이 통째로 빈다 ==')
        # ⚠⚠ 실제로 여기서 터졌다(2026-11-03). `_listProjectFiles` 는 **루트 직속**
        #    프로젝트 파일을 읽는다 — 빈 rel 을 거절하면 그 길이 통째로 막힌다.
        #    더 나빌 건 어댑터가 그 400 을 'ACL 거부'로 삼켜 **목록이 조용히 0건**이 됐다는 것.
        r = c.get('/nas/app/list?rel=')
        check('빈 rel = 앱 루트 목록(200)', r.status_code == 200, '· HTTP %s' % r.status_code)
        r = c.get('/nas/app/list')
        check('rel 아예 없어도 앱 루트(200)', r.status_code == 200, '· HTTP %s' % r.status_code)
        rootnames = [i['name'] for i in ((r.get_json() or {}).get('items') or [])]
        check('루트 목록에 검증 폴더가 보인다', DIR in rootnames, '· %s' % rootnames)

        print('\n== ⑦-3 그래도 **쓰기·삭제는 루트를 받으면 안 된다** ==')
        # 빈 rel 을 삭제에 허용하면 **앱 데이터를 통째로 지운다.** 그래서
        # 읽기(list/get)와 임시폴더 청소(sweep)만 루트를 받는다.
        st, _ = jpost(c, '/nas/app/delete', {'rel': ''})
        check('빈 rel 삭제 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/app/delete', {})
        check('rel 없는 삭제 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/app/put', {'rel': '', 'text': 'x'})
        check('빈 rel 쓰기 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/app/mkdir', {'rel': ''})
        check('빈 rel 폴더생성 거부', st == 400, '· HTTP %s' % st)

        print('\n== ⑧ 없는 파일 읽기 — 404 로 정직하게 ==')
        r = c.get('/nas/app/get?rel=%s/없는파일zzz.json' % DIR)
        msg = ((r.get_json() or {}).get('message') or '') if r.status_code != 200 else ''
        check('404 + 사람이 읽는 사유', r.status_code == 404 and '없습니다' in msg,
              '· HTTP %s · %s' % (r.status_code, msg[:70]))

        print('\n== ⑨ 설정 화면이 쓰는 라우트 — 거부돼야 하는 입력 ==')
        # ⚠ 여기서는 설정을 **바꾸지 않는다** — 검증이 사람 설정을 망가뜨리면 안 된다.
        st, _ = jpost(c, '/nas/config', {'host': '', 'user': 'x', 'password': 'y'})
        check('주소 없으면 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/config', {'host': 'h', 'user': '', 'password': 'y'})
        check('아이디 없으면 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/config', {'host': 'h', 'user': 'u', 'port': 'abc', 'password': 'y'})
        check('포트가 숫자가 아니면 거부', st == 400, '· HTTP %s' % st)
        st, _ = jpost(c, '/nas/root', {})
        check('앱 폴더를 안 주면 거부', st == 400, '· HTTP %s' % st)
        st, d9 = jpost(c, '/nas/root', {'root': 'relative/path'})
        check('상대경로 거부', st == 400, '· %s' % (d9 or {}).get('message', ''))
        # ⚠ 공유 루트 자체(`/공유`)를 앱 폴더로 삼으면 남의 자료와 섞이고,
        #   임시폴더 청소 같은 동작이 **남의 폴더를 건드리게 된다**.
        st, _ = jpost(c, '/nas/root', {'root': '/공유루트만'})
        check('공유 루트 자체 거부', st == 400, '· HTTP %s' % st)
        r = c.get('/nas/root-candidates')
        d9 = r.get_json() or {}
        check('앱 폴더 후보 목록(읽기 전용)', r.status_code == 200 and d9.get('ok'),
              '· %d건' % len(d9.get('items') or []))
        body = c.get('/nas/status').get_data(as_text=True)
        check('status 응답에 비밀번호가 안 실린다', 'pw_dpapi' not in body)

    finally:
        print('\n== 뒷정리 ==')
        st, dd = jpost(c, '/nas/app/delete', {'rel': DIR})
        check('테스트 폴더 삭제(확인까지)', st == 200 and (dd or {}).get('verified'),
              '· HTTP %s · %s' % (st, (dd or {}).get('message') or ''))
        st2, dd2 = jpost(c, '/nas/app/delete', {'rel': 'project_test.json', 'team': TEAM})
        check('팀 테스트 파일 삭제', st2 == 200 and (dd2 or {}).get('verified'),
              '· HTTP %s · %s' % (st2, (dd2 or {}).get('message') or ''))
        # 임시 폴더는 이 프로세스가 만든 것이므로 sweep 이 지워야 한다(그 라우트도 같이 검증).
        # staleSec=0 — 검증이 끝났으니 앞선 실행이 남긴 것까지 치운다.
        # (업로드가 create_parents=true 라, 남의 임시 폴더를 지워도 그쪽 다음 업로드가 다시 만든다)
        st3, ds3 = jpost(c, '/nas/app/sweep', {'rel': '', 'team': TEAM, 'staleSec': 0})
        r3 = c.get('/nas/app/list?rel=&team=%s' % TEAM)
        left = [i['name'] for i in ((r3.get_json() or {}).get('items') or [])
                if i['name'].startswith('.ganttput-')]
        check('/nas/app/sweep 이 임시 폴더를 치움', st3 == 200 and not left,
              '· 치움 %s · 남음 %s' % ((ds3 or {}).get('removed'), left))

    print('\n통과 %d · 실패 %d' % (ok_n, bad_n))
    print('⚠️ 이 검증은 test_client 로 돈다 — 사용자가 돌리는 5000번 프로세스에는'
          ' **백엔드를 재시작해야** 이 라우트가 생긴다.')
    return 1 if bad_n else 0


if __name__ == '__main__':
    raise SystemExit(main())
