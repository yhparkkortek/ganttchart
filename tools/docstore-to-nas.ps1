<#
📦 개발자료실(문서 저장소) → NAS 이사

  옛 파일 서버의 공유 폴더를 NAS 앱 폴더 아래 `개발자료실` 로 **복사**한다.
  Drive → NAS 이사(js/58)와 달리 여기선 **양쪽 다 Windows 가 직접 읽는 경로**라
  HTTP·base64·DSM API 가 전혀 필요 없다. robocopy 한 번이면 된다.

왜 robocopy 인가 (파이썬으로 짜지 않은 이유)
  · 같은 파일은 **알아서 건너뛴다**(크기+시각 동일) → 멱등·재개가 공짜다
  · 260자 넘는 경로를 **원래 다룬다**. 개발자료실은 한글 폴더가 깊어 파이썬 복사는 터진다
  · 수정시각을 그대로 들고 간다 → `since` 기반 스캔(/doc/list)이 이사 뒤에도 맞는다
  · 실패한 파일만 다시 시도하고, 로그를 남긴다

⚠️ **복사다. 원본을 지우지 않는다.** /MIR 를 쓰지 않는 이유도 같다 — /MIR 는 대상에만 있는
   파일을 **지운다**. 지우는 건 사람이 대조를 끝내고 직접 할 일이다.
⚠️ **권한이 바뀐다.** 옛 공유의 ACL 은 따라오지 않는다. 대상이 앱 폴더 아래라서
   앱을 쓰는 사람은 전부 읽게 된다 — 그래도 되는 자료인지는 사람이 판단할 것.
⚠️ 원본 공유에 로그인이 안 되면(WinError 1326) 아무것도 못 한다. 탐색기에서 그 공유를
   한 번 열어 계정을 다시 넣은 뒤에 돌릴 것. ⚠️ 여러 번 틀리면 계정이 잠긴다.

쓰는 법
  # 1) 먼저 반드시 모의 실행 — 무엇이 몇 개 갈지만 본다(아무것도 안 쓴다)
  powershell -ExecutionPolicy Bypass -File tools/docstore-to-nas.ps1 -DryRun

  # 2) 진짜 복사 (중간에 끊겨도 같은 명령을 다시 돌리면 이어서 한다)
  powershell -ExecutionPolicy Bypass -File tools/docstore-to-nas.ps1

  # 3) 대조 — 양쪽 파일 수/바이트를 센다
  powershell -ExecutionPolicy Bypass -File tools/docstore-to-nas.ps1 -VerifyOnly

  -Source / -Dest 를 주면 그 경로로, 안 주면 docstore_config.json 의 root 와
  nas_login_config.json 의 앱 폴더에서 알아서 만든다(사내 경로를 코드에 안 박기 위해서다).
#>
[CmdletBinding()]
param(
    [string]$Source,
    [string]$Dest,
    [switch]$DryRun,
    [switch]$VerifyOnly,
    [int]$Threads = 16
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

function Read-JsonFile($path) {
    if (-not (Test-Path $path)) { return $null }
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

# ── 경로 정하기 ───────────────────────────────────────────────────────────────
# ⚠️ 사내 IP·공유 이름을 이 파일에 적지 않는다(저장소가 GitHub Pages 로 공개돼 있다).
#    설정 파일(.gitignore)에서 읽는다.
if (-not $Source) {
    $cfg = Read-JsonFile (Join-Path $repo 'docstore_config.json')
    if (-not $cfg -or -not $cfg.root) {
        throw "원본을 모르겠습니다. docstore_config.json 의 root 가 비어 있습니다 — -Source 로 직접 주세요."
    }
    $Source = $cfg.root
}
if (-not $Dest) {
    # NAS 설정의 `root` 는 DSM 경로(`/공유/폴더/...`)다. SMB 로는 그게 그대로 UNC 가 된다:
    #   /RND_ETC/a/b  →  \\<host>\RND_ETC\a\b   (SMB 는 대소문자를 안 가린다)
    $nas = Read-JsonFile (Join-Path $repo 'nas_login_config.json')
    if (-not $nas -or -not $nas.host -or -not $nas.root) {
        throw ("대상을 모르겠습니다. nas_login_config.json 에 host/root 가 없습니다 — " +
               "-Dest 로 직접 주세요 (앱 폴더 아래 '개발자료실').")
    }
    $uncRoot = '\\' + $nas.host + ($nas.root -replace '/', '\')
    $Dest = Join-Path $uncRoot '개발자료실'
}

Write-Host "원본: $Source"
Write-Host "대상: $Dest"
Write-Host ''

# ── 양쪽에 닿는지 ─────────────────────────────────────────────────────────────
# ⚠️ 원본은 **한 번만** 두드린다. 자격증명이 틀렸을 때 반복하면 계정이 잠긴다.
if (-not (Test-Path -LiteralPath $Source)) {
    # ⚠️ throw 를 안 쓴다 — 파워션 스택 추적이 길게 쪽아져 정작 읽어야 할 줄이 묻힌다.
    Write-Host ''
    Write-Host "❌ 원본에 접근할 수 없습니다: $Source"
    Write-Host '   → 탐색기에서 그 공유 폴더를 한 번 열어 계정/비밀번호를 다시 넣어 주세요(자격 증명 기억 체크).'
    Write-Host '   ⚠️ 여러 번 틀리면 계정이 잠깁니다 — 한 번에 맞히세요.'
    Write-Host '   (여기서 더 시도하지 않고 멈춥니다.)'
    exit 1
}

function Measure-Tree($path) {
    if (-not (Test-Path -LiteralPath $path)) { return [pscustomobject]@{ Files = 0; Bytes = 0 } }
    $f = 0; $b = 0
    Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $f++; $b += $_.Length }
    return [pscustomobject]@{ Files = $f; Bytes = $b }
}

function Show-Size($m, $label) {
    "{0,-6} 파일 {1,8:N0} 개 · {2,10:N1} GB" -f $label, $m.Files, ($m.Bytes / 1GB)
}

if ($VerifyOnly) {
    Write-Host '── 대조 (양쪽을 세어 본다) ──'
    $a = Measure-Tree $Source; $b = Measure-Tree $Dest
    Write-Host (Show-Size $a '원본'); Write-Host (Show-Size $b '대상')
    if ($a.Files -eq $b.Files -and $a.Bytes -eq $b.Bytes) {
        Write-Host "`n✅ 파일 수와 바이트가 같습니다."
    } else {
        Write-Host ("`n⚠️ 다릅니다 — 파일 {0:N0} 개, {1:N0} 바이트 차이. " -f
                    ($a.Files - $b.Files), ($a.Bytes - $b.Bytes))
        Write-Host '   이사를 한 번 더 돌리면 모자란 것만 채웁니다(같은 파일은 건너뜁니다).'
    }
    exit 0
}

# ── 복사 ──────────────────────────────────────────────────────────────────────
$logDir = Join-Path $repo '.docstore-move'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("robocopy_{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))

# /E      하위 폴더까지(빈 폴더 포함)
# /COPY:DAT  내용·속성·시각 (ACL 은 일부러 안 가져온다 — 대상 폴더 권한을 따른다)
# /R:2 /W:2  실패 시 2회만, 2초 간격 (기본값은 100만 회 × 30초다 — 한 파일에서 영영 멈춘다)
# /MT     다중 스레드. 작은 파일이 많은 자료실에서 제일 크게 듣는다
# /XJ     정션(심볼릭 링크) 따라가지 않기 — 무한 루프 방지
# /NFL /NDL  파일·폴더 이름을 화면에 안 뿌린다(로그에는 남는다)
$opts = @('/E', '/COPY:DAT', '/DCOPY:DAT', '/R:2', '/W:2', "/MT:$Threads",
          '/XJ', '/NFL', '/NDL', '/NP', '/TEE', "/LOG+:$log")
if ($DryRun) {
    $opts += '/L'        # 목록만 — 아무것도 안 쓴다
    Write-Host '🔍 모의 실행입니다 — 아무것도 쓰지 않습니다.'
}

$t0 = Get-Date
& robocopy $Source $Dest @opts
$code = $LASTEXITCODE
$secs = [int]((Get-Date) - $t0).TotalSeconds

# robocopy 종료코드: 0~7 성공(비트 플래그), 8 이상이 진짜 실패
Write-Host ''
Write-Host ("걸린 시간: {0}초 · robocopy 종료코드 {1}" -f $secs, $code)
Write-Host "로그: $log"
if ($code -ge 8) {
    Write-Host '❌ 실패한 파일이 있습니다 — 위 로그에서 ERROR 줄을 보세요.'
    exit 1
}
Write-Host '✅ robocopy 가 성공으로 끝났습니다.'
if (-not $DryRun) {
    Write-Host ''
    Write-Host '다음: 대조하세요 →  tools/docstore-to-nas.ps1 -VerifyOnly'
    Write-Host '그 다음: 설정의 문서 저장소 경로를 대상으로 바꾸고 백엔드를 재시작하세요.'
    Write-Host '⚠️ 그 설정은 PC마다 따로입니다 — 팀원 PC 에서도 각각 바꿔야 합니다.'
}
exit 0
