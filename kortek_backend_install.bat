@echo off
chcp 65001 > nul
title KORTEK Backend 설치

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   KORTEK Backend — 시작프로그램 자동 등록            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  이 스크립트는 kortek_backend.bat을 Windows 시작프로그램에 등록해서,
echo  PC를 켤 때마다 서버가 자동으로(최소화 상태로 조용히) 실행되게 합니다.
echo  바로가기 만들기 → shell:startup 폴더에 붙여넣기를 대신 해주는 것뿐이라,
echo  안 하셔도 kortek_backend.bat을 그때그때 직접 더블클릭해서 쓰셔도 됩니다.
echo.

:: ── 이 파일 기준 폴더로 이동 ────────────────────────────
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "PS1=%TEMP%\kortek_backend_make_shortcut.ps1"

if not exist "%HERE%\kortek_backend.bat" (
    echo  [오류] 이 설치 스크립트와 같은 폴더에 kortek_backend.bat이 없습니다.
    echo         압축을 푼 폴더 안에서(다른 곳으로 옮기지 말고) 실행해주세요.
    pause
    exit /b 1
)
if not exist "%HERE%\kortek_backend_start_minimized.vbs" (
    echo  [오류] kortek_backend_start_minimized.vbs 파일이 없습니다.
    echo         zip을 새로 받아서 다시 압축을 풀어주세요.
    pause
    exit /b 1
)

:: ── PowerShell 스크립트를 임시 파일로 생성해서 실행 (인라인 -Command 따옴표 지옥 회피) ──
echo  [1/2] Windows 시작프로그램에 등록 중...
echo $ws = New-Object -ComObject WScript.Shell> "%PS1%"
echo $lnk = $ws.CreateShortcut('%STARTUP%\KORTEK_Backend.lnk')>> "%PS1%"
echo $lnk.TargetPath = 'wscript.exe'>> "%PS1%"
echo $lnk.Arguments = '"%HERE%\kortek_backend_start_minimized.vbs"'>> "%PS1%"
echo $lnk.WorkingDirectory = '%HERE%'>> "%PS1%"
echo $lnk.WindowStyle = 7>> "%PS1%"
echo $lnk.Description = 'KORTEK 간트차트 백엔드 서버 (자동 시작, 최소화)'>> "%PS1%"
echo $lnk.Save()>> "%PS1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
del "%PS1%" > nul 2>&1

if exist "%STARTUP%\KORTEK_Backend.lnk" (
    echo         ✅ 등록 완료 — 다음 PC 재시작부터 자동으로 최소화 실행됩니다.
) else (
    echo         ⚠️ 등록 실패 — 관리자 권한이나 보안 정책으로 막혀있을 수 있습니다.
    echo            안 되면 웹앱의 "처음 사용자 - 설치 안내" 안의 수동 설치 방법을 참고해주세요.
)

echo.
echo  [2/2] 지금 서버를 최소화 상태로 바로 시작할까요?
echo        원치 않으면 이 창을 그냥 닫으세요. 시작하려면 아무 키나 누르세요...
pause > nul

wscript.exe "%HERE%\kortek_backend_start_minimized.vbs"
echo.
echo  ✅ 서버가 최소화 상태로 시작되었습니다 (작업 표시줄에서 확인 가능).
echo.
echo  💡 이후 kortek_backend.py가 새 버전으로 바뀌어도, "같은 폴더 경로"에
echo     그대로 덮어써서 압축을 풀기만 하면 됩니다 — 폴더 위치가 바뀌지 않는 한
echo     이 설치 스크립트를 다시 실행할 필요 없이, PC를 재부팅하면 새 버전으로
echo     자동 반영됩니다 (지금 당장 반영하려면 작업 표시줄의 기존 서버 창을 닫고
echo     kortek_backend.bat을 한 번 더 실행하세요).
echo.
pause
