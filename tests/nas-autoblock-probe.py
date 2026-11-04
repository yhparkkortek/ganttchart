# -*- coding: utf-8 -*-
"""NAS(DSM) 의 **자동 차단 정책**을 실제로 물어본다. (2026-11-04)

왜 — 우리 코드의 "1회 실패 후 잠금"은 **우리가 깔아 둔 가드**이고, 진짜 IP 차단은 DSM 의
자동 차단 설정(실패 N회/분 → 차단)이 한다. 몇 회까지 여유가 있는지 **추측하지 말고** 물어본다.
이 API 는 보통 관리자만 읽을 수 있으므로, 못 읽으면 "못 읽었다"고 적는다(기본값을 단정하지 않음).

⚠️ 로그인은 **성공 1회**만 한다(저장된 자격증명). 실패를 만들지 않으므로 차단 카운터에
   쌓이지 않는다. 비밀번호는 출력하지 않는다.

    py -3 tests/nas-autoblock-probe.py
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import nas_dsm  # noqa: E402

# 콘솔이 cp949 라도 한글/기호가 깨져 죽지 않게
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

cfg = nas_dsm.load_config()
if not cfg:
    print('NAS 로그인 정보가 없습니다 — 🔑 설정에서 먼저 저장하세요.')
    sys.exit(1)

r = nas_dsm.login_once()
print('login: %s' % json.dumps({k: v for k, v in r.items() if k != 'message'}, ensure_ascii=False))
if not r.get('ok'):
    print('  message: %s' % r.get('message'))
    sys.exit(1)

# 관리자 전용일 수 있는 조회 — 거부되면 그대로 적는다.
for api, ver in (('SYNO.Core.Security.AutoBlock', 1),
                 ('SYNO.Core.Security.AutoBlock.Rules', 1)):
    try:
        data = nas_dsm._call(cfg, api, 'get', ver, {}, path='entry.cgi')
        print('%s → %s' % (api, json.dumps(data, ensure_ascii=False)[:600]))
    except Exception as e:
        print('%s → 못 읽었습니다: %s' % (api, e))
