@echo off
where docker >nul 2>nul
if not errorlevel 1 (echo Docker already installed.&pause&exit /b 0)
winget install --id Docker.DockerDesktop --exact --accept-source-agreements --accept-package-agreements
pause
