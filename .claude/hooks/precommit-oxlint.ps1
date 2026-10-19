# ──────────────────────────────────────────────────────────────────────────────
#  커밋 전 js/ 문법 검증 훅 (oxlint)
#
#  왜 있는가: 이 앱은 번들러가 없고 모든 <script>가 하나의 전역 스코프를 공유한다.
#  그래서 js/*.js 한 파일에 문법 오류가 생기면 그 파일 전체가 조용히 죽고, 증상은
#  "Tabler 아이콘이 □로 깨짐"처럼 엉뚱하게 나타난다 (CLAUDE.md 반복 사고 항목).
#  기존 방어선은 `node --check js/파일.js`를 파일마다 수동 실행하는 것이었다.
#  이 훅은 그 수동 단계를 없앤다 — 커밋 시 63개 파일 전체를 0.6초에 검사한다.
#
#  차단 기준: oxlint **오류(error)만**. 경고(warning)는 차단하지 않는다.
#  경고까지 막으면 쓸 수 없다 — 도입 당시 427건이었고, 그중 328건이
#  no-unused-vars 오탐이었다(전역 스코프라 한 파일 안에선 다 "미사용"으로 보인다).
#  규칙 조정은 .oxlintrc.json에서 한다.
#
#  실패 시 조용히 통과: node나 node_modules가 없는 PC, 클라우드 세션(claude.ai/code)
#  에서는 검증을 건너뛴다. 커밋 자체를 막지는 않는다.
# ──────────────────────────────────────────────────────────────────────────────

# ⚠️ 이 PC의 [Console]::OutputEncoding은 cp949(ks_c_5601-1987)다. 그대로 두면 아래
#    한국어 차단 메시지가 cp949 바이트로 나가고, Claude Code는 UTF-8 JSON을 기대하므로
#    메시지가 깨져 읽을 수 없게 된다. 출력 전에 UTF-8(BOM 없음)로 고정해야 한다.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# 훅 입력(JSON)은 stdin으로 들어온다. git commit이 아니면 즉시 통과.
try { $j = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { exit 0 }
$cmd = [string]$j.tool_input.command
if ($cmd -notmatch 'git\s+commit') { exit 0 }

$root = $env:CLAUDE_PROJECT_DIR
if (-not $root -or -not (Test-Path $root)) { $root = 'C:\Users\YHPARK\Documents\GitHub\ganttchart' }
if (-not (Test-Path $root)) { exit 0 }
Set-Location $root

# oxlint은 네이티브 node 애드온이라 bin/oxlint를 node로 직접 부르는 게 가장 빠르다
# (0.6초). npx는 매번 7.4초가 걸려 커밋 훅으로는 쓸 수 없다.
$ox = Join-Path $root 'node_modules\oxlint\bin\oxlint'
if (-not (Test-Path $ox)) { exit 0 }   # npm install 안 된 PC는 조용히 통과

# --quiet: 오류만 보고(경고 숨김). 차단 메시지에 경고 22건이 섞이면 정작 고쳐야 할
# 오류가 묻힌다. 경고는 `npm run lint`로 따로 본다.
try { $out = (& node $ox 'js/' '--quiet' 2>&1 | Out-String) } catch { exit 0 }
if ($LASTEXITCODE -eq 0) { exit 0 }    # 오류 없음 (경고만 있어도 0)

# 여기까지 왔으면 문법/정확성 오류가 있다 — 커밋을 막는다.
$msg = "커밋 차단: js/ 에 문법 오류가 있습니다. 이대로 커밋하면 해당 파일 전체가 " +
       "브라우저에서 조용히 죽습니다(아이콘 깨짐 등 엉뚱한 증상으로 나타남). " +
       "아래 oxlint 출력의 오류를 먼저 고치세요. 규칙 조정은 .oxlintrc.json 에서 합니다." +
       "`n`n" + $out
$o = @{ hookSpecificOutput = @{
          hookEventName            = 'PreToolUse'
          permissionDecision       = 'deny'
          permissionDecisionReason = $msg } } | ConvertTo-Json -Compress -Depth 5
Write-Output $o
exit 0
