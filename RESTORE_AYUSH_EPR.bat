@echo off
cd /d "%~dp0"
set /p FILE=Enter backup .dump path (example backups\ayush_epr_20260929_120000.dump):
if not exist "%FILE%" (echo File not found.&pause&exit /b 1)
echo WARNING: restore replaces current database contents.
choice /M "Continue"
if errorlevel 2 exit /b 0
type "%FILE%" | docker compose exec -T db pg_restore -U ayush -d ayush_epr --clean --if-exists --no-owner --exit-on-error
pause
