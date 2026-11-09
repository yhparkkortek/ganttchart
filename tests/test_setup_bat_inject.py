# -*- coding: utf-8 -*-
"""🧪 설치 파일에 NAS 주소를 심었을 때 — 정말 `nas_defaults.json` 이 **읽히게** 써지나.

왜 이것까지 — 백엔드는 `open(..., encoding='utf-8')` 로 읽는다. **BOM 이 붙으면
조용히 `{}`** 가 되고(예외를 삼킨다), 사람은 "주소가 안 채워진다"만 보게 된다.
그래서 바이트로 확인한다.

    py -3 -I test_inject.py
"""
import io, json, os, shutil, subprocess, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', write_through=True)
ROOT = r'C:\Users\YHPARK\Documents\GitHub\ganttchart'
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, 'injtest')
BAT = os.path.join(HERE, 'KORTEK_설치_test.bat')
HOST = '10.11.12.13'                     # 시험용 가짜 주소

ok = []
def check(name, cond, why=''):
    ok.append(bool(cond))
    print(('  ✅ ' if cond else '  ❌ ') + name + (('  — ' + str(why)) if (not cond and why) else ''))

# 1) 앱이 하듯이 한 줄을 갈아 끼운다(js/04e 가 내려줄 때 하는 일)
src = io.open(os.path.join(ROOT, 'kortek_setup.bat'), 'rb').read()
old = b'set "NASHOST="\r\n'
check('심을 자리가 딱 한 곳', src.count(old) == 1, src.count(old))
inj = src.replace(old, ('set "NASHOST=%s"\r\n' % HOST).encode('utf-8'))
check('줄끝이 CRLF 그대로', inj.count(b'\n') - inj.count(b'\r\n') == 0)
io.open(BAT, 'wb').write(inj)

# 2) 자가점검으로 끝까지 돌린다
if os.path.isdir(DEST):
    shutil.rmtree(DEST, ignore_errors=True)
os.makedirs(DEST, exist_ok=True)
r = subprocess.run(['cmd', '/c', BAT, '/selftest', DEST, '<', 'NUL'],
                   capture_output=True, cwd=ROOT, timeout=600)
# ⚠️ 콘솔 코드페이지가 PC 마다 다르다(이 PC 는 UTF-8 로 뱉는다) — 둘 다 보고 고른다.
#    여기서 틀리면 **앱이 아니라 하네스가** 실패한다(실제로 한 번 그랬다).
def _dec(b):
    for enc in ('utf-8', 'cp949'):
        try:
            s = b.decode(enc)
            if '자가점검' in s or 'NAS' in s:
                return s
        except Exception:
            pass
    return b.decode('utf-8', 'replace')

out = _dec(r.stdout)
check('설치가 끝까지 돌았다', '자가점검 완료' in out, out[-300:])
check('주소를 넣었다고 알린다', 'NAS 주소를 미리 넣어' in out, out[-400:])

# 3) 써진 파일이 **백엔드가 읽는 방식 그대로** 읽히나
p = os.path.join(DEST, 'nas_defaults.json')
check('nas_defaults.json 이 생겼다', os.path.isfile(p))
if os.path.isfile(p):
    raw = io.open(p, 'rb').read()
    check('BOM 이 없다 (붙으면 백엔드가 조용히 {} 로 읽는다)', not raw.startswith(b'\xef\xbb\xbf'), raw[:6])
    try:
        d = json.loads(io.open(p, 'r', encoding='utf-8').read())
    except Exception as e:
        d = None
        check('utf-8 로 읽힌다', False, e)
    if d is not None:
        check('utf-8 로 읽힌다', True)
        check('host 가 그 주소다', d.get('host') == HOST, d)
        check('port·https 기본값이 들어 있다', d.get('port') == 5001 and d.get('https') is True, d)
    print('   실제 내용:', raw.decode('utf-8', 'replace'))

# 4) 주소를 안 심으면 파일을 만들지 않는다(저장소 원본 그대로)
DEST2 = DEST + '2'
if os.path.isdir(DEST2):
    shutil.rmtree(DEST2, ignore_errors=True)
os.makedirs(DEST2, exist_ok=True)
subprocess.run(['cmd', '/c', os.path.join(ROOT, 'kortek_setup.bat'), '/selftest', DEST2, '<', 'NUL'],
               capture_output=True, cwd=ROOT, timeout=600)
check('주소를 안 심으면 파일을 안 만든다', not os.path.isfile(os.path.join(DEST2, 'nas_defaults.json')))

for d in (DEST, DEST2):
    shutil.rmtree(d, ignore_errors=True)
try:
    os.remove(BAT)
except Exception:
    pass

bad = ok.count(False)
print('\n' + ('❌ 실패 %d건' % bad if bad else '✅ 전부 통과') + ' (%d개 검사)' % len(ok))
sys.exit(1 if bad else 0)
