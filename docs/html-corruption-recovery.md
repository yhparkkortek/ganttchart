# HTML 인코딩 손상 복구 가이드

## 증상

아래 두 가지가 **동시에** 나타나면 HTML 인코딩 손상을 의심한다:

1. **한국어/이모지가 `?◆◆`으로 깨짐** — 사이드바, 헤더, 버튼 텍스트 전부
2. **`??/button>` `??/span>` 같은 태그 텍스트가 화면에 그대로 보임** — `</button>` 앞의 `<`가 유실된 것
3. **아이콘이 □ 또는 ? 박스로 깨짐** — tabler-icons CSS가 적용 안 된 것처럼 보이지만 JS 오류가 없어도 발생 가능

JS SyntaxError에 의한 아이콘 깨짐(→ `docs/gantt-internals.md`)과 구분 포인트:
- JS 오류는 개발자 콘솔에 빨간 SyntaxError 표시 → 인코딩 손상은 콘솔이 조용함
- JS 오류는 한국어 텍스트 자체는 정상 → 인코딩 손상은 한국어가 `?◆◆`으로 깨짐

## 원인

PowerShell `Set-Content` 또는 `Out-File` 로 `GANTT_CHART_V02_Color.html`을 덮어쓸 때 발생.

```powershell
# 이렇게 하면 안 됨 (UTF-8 손상)
(Get-Content file.html) -replace 'old','new' | Set-Content file.html
$content -replace 'old','new' | Out-File file.html
```

PowerShell 기본 인코딩(Windows-1252/cp1252)으로 읽어서 UTF-8 멀티바이트 시퀀스 중 Windows-1252로 매핑 불가한 바이트를 `?`(0x3F)로 치환한다. 그 과정에서 `<`(0x3C)도 특정 컨텍스트에서 함께 유실되어 `</a>` → `/a>`, `</button>` → `/button>`처럼 닫는 태그의 `<`가 사라진다.

**실제 사고 경위 (2026-09-29~30):**
- `e61eed8` 커밋부터 PostToolUse 훅 또는 수동 작업에서 `Set-Content`로 HTML 캐시버스터를 업데이트
- 이후 `c1df9ee` → `bf84267` → `e5a1b7f` → `b5023d1` 커밋이 전부 손상된 HTML 위에 쌓임
- `f2dc5ac`, `77b56dd`: 증상(Telegram 리다이렉트 + 아이콘 깨짐)만 쫓다가 닫는 태그만 수동 패치 → 한국어 깨짐은 여전히 미해결
- `6034049`: `6fa2c08`(손상 직전 정상 커밋)에서 HTML 복원 + Python `wb` 모드로 캐시버스터만 업데이트 → 완전 해결

## 올바른 캐시버스터 업데이트 방법

```python
# Python으로만 수정 (UTF-8 안전)
import re

with open('GANTT_CHART_V02_Color.html', 'rb') as f:
    data = f.read()

data = re.sub(rb'v=\d{8}[a-z]', b'v=20260930z', data)

with open('GANTT_CHART_V02_Color.html', 'wb') as f:
    f.write(data)
```

또는 PowerShell을 꼭 써야 한다면:

```powershell
# UTF-8 명시 필수
$text = [System.IO.File]::ReadAllText('GANTT_CHART_V02_Color.html', [System.Text.Encoding]::UTF8)
$text = $text -replace 'v=20260930x', 'v=20260930z'
[System.IO.File]::WriteAllText('GANTT_CHART_V02_Color.html', $text, [System.Text.Encoding]::UTF8)
```

## 복구 절차

### 1단계: 손상 여부 확인

```python
with open('GANTT_CHART_V02_Color.html', 'rb') as f:
    data = f.read()
try:
    data.decode('utf-8')
    print('정상')
except UnicodeDecodeError as e:
    print(f'손상됨 — 오류 위치: {e.start}')
```

### 2단계: 마지막 정상 커밋 찾기

```bash
# 최근 커밋들의 HTML UTF-8 유효성 확인
git log --oneline -20 | while read hash msg; do
  git show $hash:GANTT_CHART_V02_Color.html 2>/dev/null | python3 -c "
import sys
try:
    sys.stdin.buffer.read().decode('utf-8')
    print('OK $hash $msg')
except:
    print('CORRUPT $hash $msg')
"
done
```

### 3단계: 정상 버전에서 HTML 복원 후 캐시버스터 업데이트

```python
import subprocess, re

# 정상 커밋 해시로 교체
GOOD_COMMIT = '6fa2c08'
NEW_BUSTER = b'v=20260930z'

result = subprocess.run(['git', 'show', f'{GOOD_COMMIT}:GANTT_CHART_V02_Color.html'],
                        capture_output=True)
html = result.stdout  # bytes, clean UTF-8

# 캐시버스터 교체
html = re.sub(rb'v=\d{8}[a-z]', NEW_BUSTER, html)

with open('GANTT_CHART_V02_Color.html', 'wb') as f:
    f.write(html)

print('복원 완료')
```

### 4단계: 손실된 HTML 구조 변경 확인

정상 커밋 이후에 새 `<script>` 태그나 HTML 섹션이 추가됐다면 수동으로 병합 필요:

```python
import subprocess, re

good = subprocess.run(['git', 'show', 'GOOD_HASH:GANTT_CHART_V02_Color.html'],
                      capture_output=True).stdout.decode('utf-8')
bad  = subprocess.run(['git', 'show', 'LATEST_CORRUPT:GANTT_CHART_V02_Color.html'],
                      capture_output=True).stdout.decode('latin-1')

good_scripts = set(re.findall(r'src="(js/[^"?]+)', good))
bad_scripts  = set(re.findall(r'src="(js/[^"?]+)', bad))

print('추가된 script:', bad_scripts - good_scripts)
print('제거된 script:', good_scripts - bad_scripts)
```

## 예방

1. **HTML 파일은 Python `open(..., 'rb'/'wb')`으로만 수정** — PostToolUse 훅, 수동 작업 모두 동일
2. **`Set-Content` / `Out-File` 사용 금지** — `.claude/settings.json` 훅 코드에서 PowerShell을 쓴다면 `[System.IO.File]::WriteAllText(..., Encoding::UTF8)` 강제
3. **커밋 전 UTF-8 검증**: `python3 -c "open('GANTT_CHART_V02_Color.html','rb').read().decode('utf-8'); print('OK')"`
