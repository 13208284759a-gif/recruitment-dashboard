@echo off
cd /d "%~dp0"
start "Recruitment Dashboard Server" cmd /c "npm start"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3210"
