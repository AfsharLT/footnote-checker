@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-footnote-checker-windows.ps1"
exit /b %errorlevel%
