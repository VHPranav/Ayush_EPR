@echo off
cd /d "%~dp0"
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
echo Creating PostgreSQL backup...
docker compose exec -T db pg_dump -U ayush -d ayush_epr -Fc > "backups\ayush_epr_%TS%.dump"
if errorlevel 1 (echo BACKUP FAILED&pause&exit /b 1)
echo Backup created: backups\ayush_epr_%TS%.dump
pause
