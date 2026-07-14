@echo off
chcp 65001 >nul
title Gantt 메일 수집 로컬 서버

echo ============================================
echo   Gantt 메일 수집 서버 (로컬)
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo python.org 에서 Python을 먼저 설치해주세요.
    echo ^(설치 시 "Add Python to PATH" 체크 필수^)
    echo.
    pause
    exit /b
)

echo Flask 설치 확인 중...
python -m pip show flask >nul 2>nul
if errorlevel 1 (
    echo Flask 설치 중... ^(최초 1회만, 잠시 기다려주세요^)
    python -m pip install flask --quiet
)

echo.
echo 서버를 시작합니다. 앱 사용 중에는 이 창을 닫지 마세요.
echo 종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
python "%~dp0mail_fetch_server.py"

pause
