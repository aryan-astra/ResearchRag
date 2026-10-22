@echo off
REM Double-click to start the Research RAG frontend in the background.
REM Start the backend first (start-backend.cmd) - the dev UI needs its /api.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-frontend.ps1" %*
pause
