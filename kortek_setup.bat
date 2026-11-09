@echo off
chcp 65001 > nul
setlocal EnableExtensions
title KORTEK 백엔드 — 한 번에 설치

:: ============================================================
::  KORTEK 간트차트 백엔드 설치 — 더블클릭 한 번
::
::  왜 이 파일이 있나 (2026-11-04):
::    웹 페이지는 PC 에서 프로그램을 실행할 수 없다(브라우저가 막는다).
::    그래서 "앱에서 버튼 한 번"은 원리상 불가능하고, 가장 가까운 것이
::    **버튼 → 이 파일 받기 → 더블클릭** 이다. 이 파일이 나머지를 다 한다:
::      (1) 이미 설치된 폴더 찾기 - 두 벌 생기면 업데이트가 갈라진다
::      (2) Python 확인 / 없으면 winget 으로 설치
::      (3) kortek_backend.zip 받아서 풀기
::      (4) 시작프로그램 등록 + 지금 바로 최소화 실행
::      (5) 정말 떴는지 /health 로 확인
::
::  ⚠️ 관리자 권한을 요구하지 않는다(사용자 범위 설치). 사내 PC 에서
::     관리자 권한을 받아야 하는 절차를 넣으면 그 자리에서 멈춘다.
::
::  ⚠️⚠️ 이 파일에 **괄호로 묶는 IF 블록을 쓰지 말 것.** PowerShell 한 줄에
::     들어 있는 닫는 괄호가 그 IF 블록을 닫아 버려서, 스크립트가 **조용히
::     잘린 채** 실행된다(2026-11-04 에 실제로 그렇게 깨졌다 - 처음 돌려보고
::     알았다). 전부 `if ... goto` 로 쓴다.
::  ⚠️ 임시 .ps1 파일도 쓰지 않는다 - 지우는 타이밍이 겹쳐
::     "다른 프로세스가 사용 중" 이 난다. 전부 `powershell -Command` 한 줄로,
::     경로는 따옴표 지옥을 피해 **환경변수**($env:DEST 등)로 넘긴다.
:: ============================================================

set "ZIPURL=https://raw.githubusercontent.com/yhparkkortek/ganttchart/main/kortek_backend.zip"
set "DEST=%USERPROFILE%\KORTEK_Backend"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KORTEK_Backend.lnk"
set "HEALTH=http://127.0.0.1:5000/health"
set "DRY="
set "SELFTEST="
if /i "%~1"=="/dryrun" set "DRY=1"
::   /selftest <폴더> - 진짜로 받고 풀고 바로가기까지 만들되, **그 폴더 안에서만** 한다.
::   서버를 띄우지는 않는다(이미 쓰고 있는 5000 번 포트와 부딪힌다). 이 모드가 있어야
::   "내려받기 - 압축 풀기 - 바로가기" 경로를 내 PC 를 망가뜨리지 않고 한 번 돌려볼 수 있다.
if /i not "%~1"=="/selftest" goto :noselftest
if "%~2"=="" goto :selftestusage
set "SELFTEST=1"
set "DEST=%~2"
set "LNK=%~2\_test_KORTEK_Backend.lnk"
:noselftest

echo.
echo  ===========================================================
echo    KORTEK 백엔드 — 한 번에 설치
echo  ===========================================================
if defined DRY echo  [점검 모드] 실제로 받거나 설치하지 않습니다.
echo.

:: ── (1) 이미 돌고 있나 / 어디에 깔려 있나 ───────────────────
echo  [1/5] 이미 설치되어 있는지 확인 중...
set "RUNNING="
if defined SELFTEST goto :skiprunning
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $env:HEALTH; if($r.StatusCode -eq 200){exit 0}}catch{}; exit 1" > nul 2>&1
if not errorlevel 1 set "RUNNING=1"
:skiprunning

set "FOUND="
if defined SELFTEST goto :nofound
if not exist "%LNK%" goto :nolnk
for /f "usebackq delims=" %%d in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK).WorkingDirectory"`) do set "FOUND=%%d"
:nolnk
if not defined FOUND goto :nofound
if not exist "%FOUND%\kortek_backend.bat" goto :nofound
::   이미 설치된 폴더가 있으면 **그 폴더를 쓴다** - 새 폴더에 또 풀면
::   시작프로그램은 옛 폴더를 가리킨 채라 "업데이트했는데 그대로"가 된다.
set "DEST=%FOUND%"
:nofound
echo         설치 폴더: %DEST%

if defined RUNNING goto :already

:: ── (2) Python ──────────────────────────────────────────────
echo  [2/5] Python 확인 중...
call :haspython
if not errorlevel 1 goto :pyok
echo         Python 이 없습니다 — 자동으로 설치해 봅니다^(사용자 범위, 관리자 권한 없이^).
if defined DRY goto :pyok
where winget > nul 2>&1
if errorlevel 1 goto :nowinget
winget install --id Python.Python.3.12 -e --scope user --silent --accept-package-agreements --accept-source-agreements
::   ⚠️ winget 이 PATH 를 고쳐도 **지금 이 창에는 반영되지 않는다.**
::      레지스트리에서 사용자 PATH 를 다시 읽어 붙인다(그래도 안 되면 아래에서 정직하게 안내).
for /f "usebackq tokens=2,*" %%a in (`reg query HKCU\Environment /v PATH 2^^^>nul`) do set "UPATH=%%b"
if defined UPATH set "PATH=%PATH%;%UPATH%"
call :haspython
if errorlevel 1 goto :pyneedsrestart
:pyok
echo         Python 확인 완료

:: ── (3) 내려받기 + 풀기 ─────────────────────────────────────
echo  [3/5] 백엔드 파일 내려받는 중...
if defined DRY goto :skipdl
if not exist "%DEST%" mkdir "%DEST%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $u=$env:ZIPURL+'?cb='+[DateTimeOffset]::Now.ToUnixTimeSeconds(); $z=Join-Path $env:TEMP 'kortek_backend_dl.zip'; Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile $z; if((Get-Item $z).Length -lt 10000){throw 'too small'}; Expand-Archive -Path $z -DestinationPath $env:DEST -Force; Remove-Item $z -Force"
if errorlevel 1 goto :dlfail
:skipdl
echo         압축 풀기 완료

:: ── (4) 시작프로그램 등록 + 실행 ────────────────────────────
echo  [4/5] 시작프로그램 등록 + 서버 시작...
if defined DRY goto :skiprun
if not exist "%DEST%\kortek_backend_start_minimized.vbs" goto :missing
::   install.bat 은 끝에서 pause 로 멈춘다 - 자동 설치에는 그 자리에 사람이 없다.
::   그래서 바로가기 등록은 여기서 직접 하고, 실행도 .vbs 를 바로 띄운다.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $l=$w.CreateShortcut($env:LNK); $l.TargetPath='wscript.exe'; $l.Arguments='\"'+$env:DEST+'\kortek_backend_start_minimized.vbs\"'; $l.WorkingDirectory=$env:DEST; $l.WindowStyle=7; $l.Description='KORTEK 간트차트 백엔드 서버'; $l.Save()"
if defined SELFTEST echo         [자가점검] 서버는 띄우지 않습니다^(5000 번 포트 충돌^).
if defined SELFTEST goto :skiprun
start "" wscript.exe "%DEST%\kortek_backend_start_minimized.vbs"
:skiprun
::   📄 설치 파일 **옆에** nas_defaults.json 이 있으면 같이 깐다 — 그러면 그 PC 의 간편 전환이
::   주소·앱 폴더를 미리 채운다(팀원은 사번·비밀번호만 넣는다). 비밀번호는 안 들어 있다.
::   ⚠️ 저장소에는 없는 파일이다 — 이 저장소는 공개라 사내 주소를 올릴 수 없다.
::   🔑 앱이 설치 파일을 내려줄 때 **아래 한 줄에 NAS 주소를 심어** 준다.
::   그러면 팀원은 주소를 치지 않고 아이디·비밀번호만 넣으면 된다.
::   ⚠️ 비밀번호·아이디는 안 들어간다. 저장소의 이 파일엔 늘 비어 있다.
::   ⚠️ BOM 을 붙이면 백엔드가 조용히 {} 로 읽는다 — UTF8Encoding($false).
set "NASHOST="
if defined DRY goto :skipdefaults
if exist "%~dp0nas_defaults.json" goto :copydefaults
if not defined NASHOST goto :skipdefaults
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:DEST+'\nas_defaults.json'; $j=@{host=$env:NASHOST;port=5001;https=$true} | ConvertTo-Json -Compress; [IO.File]::WriteAllText($p,$j,(New-Object Text.UTF8Encoding $false))"
echo         NAS 주소를 미리 넣어 두었습니다 — 앱에서 아이디·비밀번호만 넣으면 됩니다.
goto :skipdefaults
:copydefaults
copy /y "%~dp0nas_defaults.json" "%DEST%\nas_defaults.json" > nul
echo         기본설정(nas_defaults.json)도 같이 두었습니다 — 주소를 칠 필요가 없습니다.
:skipdefaults

:: ── (5) 정말 떴는지 확인 ────────────────────────────────────
echo  [5/5] 서버가 뜨는지 확인 중... ^(최초 1회는 패키지 설치로 몇 분 걸립니다^)
if defined DRY goto :dryend
if defined SELFTEST goto :selftestend
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; foreach($i in 1..90){ try{ $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $env:HEALTH; if($r.StatusCode -eq 200){$ok=$true; break} }catch{}; Start-Sleep -Seconds 2 }; if(-not $ok){exit 1}"
if errorlevel 1 goto :notup

echo.
echo  [완료] 서버가 떴습니다.
echo     폴더: %DEST%
echo     다음부터는 PC 를 켤 때 자동으로^(조용히^) 실행됩니다.
echo.
echo  이제 앱으로 돌아가 새로고침^(F5^) 하세요.
goto :end

:already
echo.
echo  [안내] 백엔드가 이미 돌고 있습니다 — 설치되어 있습니다.
echo     폴더: %DEST%
echo.
echo  업데이트는 이 파일이 아니라 **앱의 [지금 업데이트] 배너**로 하세요
echo  ^(파일을 받아 덮어쓰고 자동으로 재시작까지 합니다^).
echo  굳이 다시 설치하려면 백엔드 창을 먼저 닫고 이 파일을 다시 실행하세요.
goto :end

:nowinget
echo.
echo  [주의] 이 PC 에는 winget 이 없어 Python 을 자동 설치할 수 없습니다.
echo     브라우저에 python.org 를 열어 드립니다. 설치 화면에서
echo     "Add Python to PATH" 를 **반드시 체크**하고, 설치가 끝나면
echo     이 파일을 다시 더블클릭해주세요.
start "" https://www.python.org/downloads/
goto :end

:pyneedsrestart
echo.
echo  [안내] Python 은 설치했습니다. 다만 이 창은 설치 전의 환경을 들고 있어서
echo     바로 이어서 할 수가 없습니다 — **이 파일을 한 번만 더 더블클릭**해주세요.
goto :end

:dlfail
echo.
echo  [주의] 백엔드 파일을 받지 못했습니다^(사내망/보안 정책 차단일 수 있습니다^).
echo     앱의 설치 안내에서 kortek_backend.zip 을 직접 받아
echo     %DEST% 에 풀고 kortek_backend_install.bat 을 실행해주세요.
goto :end

:missing
echo.
echo  [주의] 압축은 풀렸는데 실행 파일이 없습니다 — zip 이 깨졌을 수 있습니다.
echo     %DEST% 폴더를 지우고 다시 실행해주세요.
goto :end

:notup
echo.
echo  [주의] 파일은 설치했는데 서버가 3분 안에 뜨지 않았습니다.
echo     %DEST%\kortek_backend.bat 을 직접 더블클릭해서
echo     검은 창의 오류 메시지를 확인해주세요.
goto :end

:dryend
echo.
echo  [점검 모드] 여기까지 문법·경로 확인만 했습니다. 실제 설치는 하지 않았습니다.
goto :end

:selftestend
echo.
echo  [자가점검 완료] 받기·풀기·바로가기까지 확인했습니다 — %DEST%
goto :end

:selftestusage
echo  사용법: kortek_setup.bat /selftest "C:\임시폴더"
goto :end

:haspython
::   ⚠️ `python --version` 만으로는 모자라다 - 윈도우의 **스토어 안내 스텁**이
::      python.exe 인 척 PATH 에 들어 있는 경우가 있다. 실제로 도는지 본다.
python -c "import sys" > nul 2>&1
exit /b %errorlevel%

:end
echo.
pause
endlocal
