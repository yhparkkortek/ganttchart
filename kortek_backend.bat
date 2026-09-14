@echo off
chcp 65001 > nul
title KORTEK Backend Server

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         KORTEK Backend Server                        ║
echo  ║  자동화 메일 · Telegram 알람 · AI 분석 서버          ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ── 서버 파일 위치로 이동 ──────────────────────────────
cd /d %~dp0

:: ── Python 설치 확인 ───────────────────────────────────
python --version > nul 2>&1
if errorlevel 1 (
    echo  [오류] Python이 설치되지 않았습니다.
    echo         https://www.python.org/downloads/ 에서 설치 후
    echo         "Add Python to PATH" 를 반드시 체크하세요.
    pause
    exit /b 1
)

:: ── 필수 패키지 설치 확인 ──────────────────────────────
echo  [1/3] 필수 패키지 확인 중...
python -c "import flask, flask_cors, requests, cryptography" > nul 2>&1
if errorlevel 1 (
    echo  [2/3] 패키지 설치 중... (최초 1회만 실행됩니다)
    pip install flask flask-cors requests cryptography --quiet
    if errorlevel 1 (
        echo  [오류] 패키지 설치 실패. 인터넷 연결을 확인하세요.
        pause
        exit /b 1
    )
    echo  [2/3] 패키지 설치 완료
) else (
    echo  [2/3] 패키지 확인 완료
)

:: ── SAP 조회(AI 문답) 전용 패키지 확인 — 없어도 서버는 정상 실행됨(선택 기능) ──
:: 2026-09-14: pywin32는 위 필수 패키지 자동설치 목록에서 빠져 있어, SAP 조회 기능을 쓰려는
:: 사람이 매번 pip install을 수동으로 쳐야 했다. 여기서도 동일하게 최초 1회만 자동 설치한다.
python -c "import win32com.client" > nul 2>&1
if errorlevel 1 (
    echo  [SAP] pywin32 설치 중... (AI 문답의 SAP 조회 기능에 필요, 최초 1회만 실행됩니다)
    pip install pywin32 --quiet
    if errorlevel 1 (
        echo  [안내] pywin32 설치 실패 — SAP 조회 기능만 비활성화된 채로 나머지는 정상 실행됩니다.
    ) else (
        echo  [SAP] pywin32 설치 완료
    )
) else (
    echo  [SAP] pywin32 확인 완료
)

:: ── 설정 파일 확인 ─────────────────────────────────────
if not exist telegram_config.json (
    echo  [안내] telegram_config.json 없음
    echo         앱 실행 후 알람 설정 ^> Telegram 탭에서 입력하세요
    echo.
)
if not exist mail_config.json (
    echo  [안내] mail_config.json 없음
    echo         앱 실행 후 알람 설정 ^> SMTP 탭에서 입력하세요
    echo.
)

:: ── 서버 실행 ──────────────────────────────────────────
echo  [3/3] KORTEK Backend 서버 시작 중...
echo.
python kortek_backend.py

echo.
echo  서버가 종료되었습니다.
pause
