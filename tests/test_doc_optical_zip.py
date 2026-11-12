# -*- coding: utf-8 -*-
"""🔬 /doc/parse-optical-zip — Gamma 리포트 zip(바코드별 Final_Report.txt)을 구조화한다 (2026-11-12)

왜 — 샘플 광학 측정 이력을 Gamma tuning 로그로 남기고 싶다는 요청. 실측(사용자가 준 실제
16개 샘플 zip)으로 포맷이 완전 고정이라 AI 없이 정규식으로 파싱한다. 이 테스트는 그 실제
파일을 저장소에 넣지 않고(사내 측정값), **같은 모양을 흉내 낸 합성 UTF-16 텍스트**로 돈다.

여기서 못 박는 것
  ① UTF-16(BOM 없음) 인코딩을 제대로 읽는다 — 바이트를 그대로 읽으면 글자 사이에 널바이트가
     공백처럼 보여 "한 글자씩 띄어 쓴 것"처럼 깨진다(실측, 이 파일들이 겪은 그 함정)
  ② Final_Report.txt 와 Log_File.txt 를 바코드(파일명 접두어)로 짝짓는다
  ③ Log_File.txt 가 없어도(짝이 안 맞아도) Final_Report.txt 는 읽는다 — 그 반대(Log_File 만
     있고 Final_Report 가 없음)는 **건너뛰고 경고만** 남긴다(빈 값을 쌓지 않는다)
  ④ "LNW PQ Check" 구간의 모든 Result 열(PASS/FAIL)을 세어 롤업한다
  ⑤ 알려진 포맷이 아닌 글자는 조용히 안 넣고 경고로 드러낸다

**진짜 zipfile.ZipFile + 진짜 `/doc/parse-optical-zip` 라우트를 `app.test_client()` 로 돈다**
— 가짜는 없음(파일시스템에 안 쓰는 라우트라 격리할 것도 없다).

    py -3 tests/test_doc_optical_zip.py
"""
import io
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as bk  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


def _report_text(barcode, native_x, native_y, fail_one=False):
    pq_rows = []
    for i in range(10):
        pq_rows.append('|        %d  |  0.00    |  0.1369       |  0.50     |  %s' % (i, 'FAIL' if (fail_one and i == 0) else 'PASS'))
    wx_rows = ['|        %d  |  0.29    |  0.3037       |  0.32     |  PASS' % i for i in range(3, 11)]
    wy_rows = ['|        %d  |  0.32    |  0.3339       |  0.35     |  PASS' % i for i in range(3, 11)]
    return (
        'Running Time\n'
        ' MODEL NAME   :: LNW_TEST_MODEL \n'
        ' BARCODE NUM :: ' + barcode + ' \n'
        ' Start Time   ::   2026.06.29    12:39:43 (hr:min:sec) \n'
        ' End Time    ::   2026.06.29    12:41:51 (hr:min:sec) \n'
        'PreCondition Check\n'
        ' 1. Target Color Coordinates \n'
        '             MIN                   TYP                 MAX \n'
        '         X : 0.3000              0.3050              0.3100 \n'
        '         Y : 0.3300              0.3350              0.3400 \n'
        ' 2. Measured Panel Native Color Coordinates ( Gamma & CT RGB = Max )\n'
        '         X : ' + native_x + ' \n'
        '         Y : ' + native_y + ' \n'
        ' 3. Measured Panel Luminance ( Gamma & CT RGB = Max )\n'
        '         Max PWM LV : 359.23 \n'
        '         Default PWM LV : 241.16 \n'
        'ColorGamut\n'
        ' Color Gamut (%NTSC) :: 64.4675 % \n'
        'LNW PQ Check\n'
        ' 1. Luminance Tracking \n' + '\n'.join(pq_rows) + '\n'
        ' 2. Color Tracking \n'
        '**** Wx ****\n' + '\n'.join(wx_rows) + '\n'
        '**** Wy ****\n' + '\n'.join(wy_rows) + '\n'
    )


def _make_zip(entries):
    """entries: [(name, text_or_None)] — None 이면 그 이름의 항목을 안 넣는다(짝 없는 케이스)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, text in entries:
            if text is None:
                continue
            zf.writestr(name, text.encode('utf-16'))  # BOM 있는 UTF-16 — 실제 장비 로그도 이 계열
    buf.seek(0)
    return buf.read()


bk.app.testing = True
client = bk.app.test_client()


def post_zip(data):
    return client.post('/doc/parse-optical-zip', data={'file': (io.BytesIO(data), 'test.zip')},
                        content_type='multipart/form-data')


print('=== 1) 정상 2건(바코드 0001 PASS 전부, 0002 는 1건 FAIL) ===')
z = _make_zip([
    ('202606290001_Final_Report.txt', _report_text('202606290001', '0.2874', '0.3182')),
    ('202606290001_Log_File.txt', 'M 12:39:42  ALC START !'),
    ('202606290002_Final_Report.txt', _report_text('202606290002', '0.2900', '0.3200', fail_one=True)),
    ('202606290002_Log_File.txt', 'M 12:40:00  ALC START !'),
])
r = post_zip(z)
body = r.get_json()
check('200', r.status_code == 200, r.status_code)
check('ok:true', body.get('ok') is True, body)
check('2건', len(body.get('items', [])) == 2, body.get('items'))
it1 = body['items'][0]
check('바코드 순서 정렬', it1['barcode'] == '202606290001', it1.get('barcode'))
check('UTF-16 정상 디코딩(글자 안 깨짐)', it1.get('model') == 'LNW_TEST_MODEL', it1.get('model'))
check('nativeX', it1.get('nativeX') == '0.2874', it1.get('nativeX'))
check('targetX MIN/TYP/MAX', it1.get('targetX') == {'min': '0.3000', 'typ': '0.3050', 'max': '0.3100'}, it1.get('targetX'))
check('PQ 전부 PASS (26/26)', it1.get('pqTotal') == 26 and it1.get('pqPass') == 26 and it1.get('pqFail') == 0, it1)
check('Log_File 이름도 같이 돌려준다', it1.get('logFileName') == '202606290001_Log_File.txt', it1.get('logFileName'))
check('reportText 를 같이 돌려준다(프런트가 NAS 에 올릴 원본)', 'LNW_TEST_MODEL' in (it1.get('reportText') or ''))
it2 = body['items'][1]
check('PQ 롤업이 FAIL 1건을 센다 (25/26)', it2.get('pqPass') == 25 and it2.get('pqFail') == 1, it2)

print('\n=== 2) Log_File.txt 만 있고 Final_Report.txt 가 없는 바코드는 건너뛴다 ===')
z2 = _make_zip([
    ('202606290003_Final_Report.txt', _report_text('202606290003', '0.2800', '0.3100')),
    ('202606290004_Log_File.txt', 'M 12:40:00  ALC START !'),  # 짝(Final_Report)이 없다
])
r2 = post_zip(z2)
body2 = r2.get_json()
check('1건만 성공', len(body2.get('items', [])) == 1, body2.get('items'))
check('나머지는 경고로 드러난다(조용히 삼키지 않는다)', len(body2.get('warnings', [])) == 1, body2.get('warnings'))

print('\n=== 3) 알려진 포맷이 아니면(BARCODE/MODEL 둘 다 없음) 빈 값을 쌓지 않는다 ===')
z3 = _make_zip([('202606290005_Final_Report.txt', '이것은 Gamma 리포트가 아닙니다'.encode('utf-16').decode('utf-16'))])
r3 = post_zip(z3)
body3 = r3.get_json()
check('0건', len(body3.get('items', [])) == 0, body3.get('items'))
check('경고로 드러난다', len(body3.get('warnings', [])) == 1, body3.get('warnings'))

print('\n=== 4) zip 안에 Final_Report.txt 가 하나도 없으면 400 ===')
z4 = _make_zip([('readme.txt', '관계없는 파일')])
r4 = post_zip(z4)
check('400', r4.status_code == 400, r4.status_code)
check('ok:false', r4.get_json().get('ok') is False)

print('\n=== 5) file 파트가 없으면 400 ===')
r5 = client.post('/doc/parse-optical-zip', data={}, content_type='multipart/form-data')
check('400', r5.status_code == 400, r5.status_code)

print('\n' + '─' * 60)
print('%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('❌ 실패: ' + ', '.join(FAIL))
    sys.exit(1)
sys.exit(0)
