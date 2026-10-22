@echo off
cd /d "%~dp0"
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
echo Creating PostgreSQL backup...
docker compose exec -T db sh -c "pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc" > "backups\ayush_epr_%TS%.dump"
if errorlevel 1 (echo BACKUP FAILED&pause&exit /b 1)
echo Creating documents backup...
docker compose exec -T server tar -C /app/storage -cf - . > "backups\ayush_documents_%TS%.tar"
if errorlevel 1 (echo DOCUMENT BACKUP FAILED&pause&exit /b 1)
echo Backups created in backups\ (copy them off this computer).
pause
