# -*- coding: utf-8 -*-
"""🤖 열린 앱의 AI 문답에 **밖에서** 묻는다 — 텔레그램 다리와 같은 큐를 쓴다 (2026-11-08)

    py -3 tools/ask-app-ai.py "999001 재고 확인해줘"
    py -3 tools/ask-app-ai.py --timeout 120 "이번 주 마감 업무"

어떻게: NAS `App_Config/TelegramAI/<내key>__cli<ts>.json` 에 요청(reply:'file')을 떨어뜨리고,
`answers/cli<ts>.json` 이 생길 때까지 기다려 출력한다. 답하는 건 **그 PC 에 열린 앱**(js/60)이다 —
앱이 꺼져 있으면 시간 초과로 끝난다(이 스크립트는 AI 를 직접 부르지 않는다. 키는 앱에만 있다).

왜 이 모양인가: AI 문답(로컬 명령·SAP·그룹웨어·도구 루프)은 전부 프런트에 있다. 그걸 파이썬으로
베끼지 않고, 어떤 도구(배치·엑셀 매크로·다른 스크립트)든 이 큐 한 곳으로 묻게 한다.
"""
import argparse
import io
import json
import os
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

Q_DIR = 'App_Config/TelegramAI'          # kortek_backend.TG_AI_QUEUE_DIR / js/60 TG_QA_BRIDGE.dir 와 같다


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('question')
    ap.add_argument('--timeout', type=int, default=180)
    ap.add_argument('--key', default='', help='내 계정 key(비우면 nas_login_config 의 user)')
    a = ap.parse_args()

    import nas_dsm
    cfg = nas_dsm.load_config() or {}
    key = (a.key or cfg.get('user') or '').strip().lower()
    if not key:
        print('내 NAS 계정을 모른다 — nas_set_login.py 로 먼저 저장할 것')
        return 2
    if not nas_dsm.status().get('ok'):
        nas_dsm.login_once()
    rid = 'cli%d' % int(time.time() * 1000)
    rel = '%s/%s__%s.json' % (Q_DIR, key, rid)
    doc = {'id': rid, 'key': key, 'name': 'CLI', 'chatId': '', 'text': a.question,
           'via': 'cli', 'reply': 'file', 'at': time.strftime('%Y-%m-%dT%H:%M:%S')}
    nas_dsm.put(nas_dsm.abs_path(rel), json.dumps(doc, ensure_ascii=False).encode('utf-8'))
    ans_rel = '%s/answers/%s.json' % (Q_DIR, rid)
    print('접수: %s  (앱이 켜져 있어야 답합니다)' % rel)
    t0 = time.time()
    while time.time() - t0 < a.timeout:
        time.sleep(3)
        try:
            raw = nas_dsm.download(nas_dsm.abs_path(ans_rel))
        except Exception:
            continue
        try:
            j = json.loads(raw.decode('utf-8'))
        except Exception:
            continue
        print('\n' + str(j.get('text') or ''))
        try:
            nas_dsm.remove(nas_dsm.abs_path(ans_rel), verify=False)
        except Exception:
            pass
        return 0
    print('시간 초과(%ds) — 앱이 열려 있지 않거나 아직 처리 중입니다. 요청은 큐에 남아 있습니다(2시간 뒤 만료).' % a.timeout)
    return 1


if __name__ == '__main__':
    sys.exit(main())
