@echo off
title Gantt Mail Server

pip show flask >nul 2>&1
if errorlevel 1 pip install flask flask-cors

pip show flask-cors >nul 2>&1
if errorlevel 1 pip install flask-cors

python "%~dp0mail_server.py"
pause