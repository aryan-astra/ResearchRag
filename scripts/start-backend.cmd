@echo off
REM Double-click to start the Research RAG backend in the background.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-background.ps1" %*
pause
