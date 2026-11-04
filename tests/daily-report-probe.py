# -*- coding: utf-8 -*-
"""일일 업무보고 설계 전제를 **다시 재는** 읽기 전용 프로브 (2026-11-04)

docs/daily-report-design.md §0-A 의 숫자가 여기서 나왔다. 데이터가 바뀌면 설계 전제도
바뀌므로(담당자 열이 생기거나, 메일 유래 비율이 달라지거나) 그때 다시 돌려 문서를 고친다.

    py -3 -I tests/daily-report-probe.py

⚠️ 읽기만 한다 — NAS 에 아무것도 쓰지 않는다. 사람이 쓰는 5000번 백엔드를 죽이지도 않는다.
⚠️ 사내 IP·경로를 출력하지 않는다(이 저장소는 GitHub Pages 로 공개돼 있다).
⚠️ 담당자 **이름은 출력하지 않는다** — 몇 명인지만 센다(옛 버전은 이름을 찍었다).
   재는 사람이 이름을 봐야 하면 --names 를 준다(그 출력은 저장소에 커밋하지 말 것).

전제: 백엔드가 떠 있고 NAS 에 로그인돼 있어야 한다(`/nas/status` 의 ok=true).
"""

import json
import sys
import io
import collections
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = 'http://127.0.0.1:5000'
TEAM = '개발3팀'          # 팀이 늘면 여기만 바꾼다
SHOW_NAMES = '--names' in sys.argv

# 메일 분석이 상세내용에 넣는 서식(js/04a 기본 프롬프트) — 1단 초안의 재료
MAIL_TAGS = ['[핵심내용]', '[To do]', '[출처]', '[문제점]']


def api(path, timeout=90):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return r.read()


def api_json(path, timeout=90):
    return json.loads(api(path, timeout).decode('utf-8'))


def main():
    # 0) 전제 확인 — 못 붙으면 정직하게 실패한다(0건을 "없음"으로 보고하지 않는다)
    try:
        st = api_json('/nas/status', timeout=20)
    except Exception as e:
        print('❌ 백엔드에 못 붙었습니다 — kortek_backend.bat 이 떠 있는지 확인하세요: %s' % e)
        return 1
    if not st.get('ok'):
        print('❌ NAS 에 로그인돼 있지 않습니다(🔑 설정에서 로그인). reason=%s' % st.get('reason'))
        return 1
    print('✅ NAS 연결됨 (계정 %s)\n' % st.get('user'))

    lst = api_json('/nas/app/list?rel=' + urllib.parse.quote(TEAM))
    files = [i['name'] for i in lst.get('items', [])
             if not i.get('isdir') and i['name'].endswith('.json')]
    sizes = {i['name']: (i.get('size') or 0) for i in lst.get('items', [])}
    if not files:
        print('❌ 프로젝트 파일이 0건입니다 — 팀 폴더 이름(%s)을 확인하세요.' % TEAM)
        return 1

    hdrs = collections.Counter()
    disc = collections.Counter()
    meta_keys = collections.Counter()
    names = collections.Counter()
    tag_hits = collections.Counter()
    rows_tot = mail_tot = disc_tot = 0
    no_assignee = no_answer = 0

    print('%-40s %6s %6s %6s %7s %8s' % ('파일', 'MB', '행', '메일', '담당구분', '담당자열'))
    print('-' * 80)
    for fn in files:
        d = json.loads(api('/nas/app/get?rel=' + urllib.parse.quote(TEAM + '/' + fn)
                           + '&_cb=probe').decode('utf-8'))
        ci = d.get('colIdx') or {}
        gd = d.get('globalData') or []
        if not gd:
            print('%-40s (globalData 없음)' % fn[:40])
            continue
        hdr = gd[0].get('data') if isinstance(gd[0], dict) else gd[0]
        hdrs[tuple(hdr or [])] += 1
        cidx = ci.get('content', -1)
        if ci.get('assignee', -1) == -1:
            no_assignee += 1
        if ci.get('answer', -1) == -1:
            no_answer += 1

        for k, v in (d.get('projectMeta') or {}).items():
            if '담당' in k and str(v).strip():
                meta_keys[k] += 1
                # 쉼표 다중 담당자 — 세는 단위는 "사람"이다(_addrSplitNames 와 같은 발상)
                for one in str(v).split(','):
                    one = one.strip()
                    if one and '@' not in one:
                        names[one] += 1

        body = [x for x in gd[1:] if isinstance(x, dict)]
        mail = 0
        for x in body:
            if x.get('_담당구분'):
                disc[str(x['_담당구분'])] += 1
            if not x.get('_mailRaw'):
                continue
            mail += 1
            cell = ''
            if cidx != -1:
                data = x.get('data') or []
                if cidx < len(data):
                    cell = str(data[cidx] or '')
            for t in MAIL_TAGS:
                if t in cell:
                    tag_hits[t] += 1
            if '→' in cell.split('\n')[0]:
                tag_hits['첫줄 발신→수신'] += 1

        rows_tot += len(body)
        mail_tot += mail
        disc_tot += sum(1 for x in body if x.get('_담당구분'))
        print('%-40s %6.2f %6d %6d %7d %8s' % (
            fn[:40], sizes.get(fn, 0) / 1048576.0, len(body), mail,
            sum(1 for x in body if x.get('_담당구분')),
            ('열%d' % ci['assignee']) if ci.get('assignee', -1) != -1 else '없음'))

    print('-' * 80)
    print('프로젝트 %d개 · 업무 행 %d · 메일 유래 %d (%.1f%%) · _담당구분 %d'
          % (len(files), rows_tot, mail_tot, 100.0 * mail_tot / max(1, rows_tot), disc_tot))
    print('담당자 열 없는 파일 %d/%d · 대응내용 열 없는 파일 %d/%d'
          % (no_assignee, len(files), no_answer, len(files)))
    print()

    print('■ 1단 초안 재료 — 메일 유래 %d건 중 서식 보유율' % mail_tot)
    for t in MAIL_TAGS + ['첫줄 발신→수신']:
        n = tag_hits[t]
        print('   %-16s %5d  %5.1f%%' % (t, n, 100.0 * n / max(1, mail_tot)))
    print()

    print('■ _담당구분 분포 (역할 코드)')
    for k, n in disc.most_common():
        print('   %-14s %5d' % (k, n))
    # ⚠️ 같은 뜻 다른 코드가 섞여 있으면 역할 비교 전에 _normalizeWbsDiscipline 이 필요하다
    pairs = [('SAL', '영업'), ('ME', '기구'), ('ETC', '기타')]
    mixed = [(a, b) for a, b in pairs if disc.get(a) and disc.get(b)]
    if mixed:
        print('   ⚠️ 정규화 안 된 쌍: ' + ', '.join('%s(%d)/%s(%d)' % (a, disc[a], b, disc[b])
                                                  for a, b in mixed))
    print()

    print('■ projectMeta 담당자 계열 키 (보유 파일 수)')
    for k, n in meta_keys.most_common():
        print('   %-20s %2d개 파일' % (k, n))
    print()
    print('■ 역할로 풀리는 사람: %d명 (이름은 출력하지 않음 — 필요하면 --names)' % len(names))
    if SHOW_NAMES:
        print('   ⚠️ 아래 출력은 저장소에 커밋하지 말 것')
        print('   ' + ', '.join('%s(%d)' % (k, n) for k, n in names.most_common()))
    print()

    print('■ 간트 머리글 조합 %d종' % len(hdrs))
    for h, n in hdrs.most_common():
        print('   %d개 파일: %s' % (n, list(h)))
    print()

    # 모바일·텔레그램 전제도 같이 본다 — 설계가 이 둘에 매여 있다
    print('■ 모바일 경로 전제')
    try:
        h = api_json('/health', timeout=10)
        print('   백엔드 ok · 텔레그램 %s · 등록 팀원 %s명' % (h.get('telegram'), h.get('members')))
        if (h.get('members') or 0) < 2:
            print('   ⚠️ 텔레그램 명단이 %s명이다 — 휴대폰 입력·미작성 알림 전에 팀원을 등록해야 한다'
                  % h.get('members'))
    except Exception as e:
        print('   /health 실패: %s' % e)
    print('   ⚠️ 백엔드 바인드 주소는 코드에서 확인할 것(127.0.0.1 이면 휴대폰에서 못 닿는다):')
    print('      grep -n "app.run(" kortek_backend.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
