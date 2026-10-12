@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
echo.
echo AYUSH EPR requires .env secrets for the central database.
echo If this is the first run, edit .env and replace every CHANGE_ME value.
findstr /C:"CHANGE_ME" .env >nul
if not errorlevel 1 (
 echo.
 echo SECURITY SETUP REQUIRED: edit .env before starting.
 echo Then run this file again.
 pause
 exit /b 1
)
where docker >nul 2>nul || (echo Docker Desktop is required.&pause&exit /b 1)
docker compose up -d --build
if errorlevel 1 (echo Failed to start AYUSH EPR.&pause&exit /b 1)
for /l %%i in (1,1,30) do (
 powershell -NoProfile -Command "try{$r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}"
 if not errorlevel 1 goto ready
 timeout /t 2 /nobreak >nul
)
echo Server did not become ready. Run CHECK_AYUSH_EPR.bat
pause
exit /b 1
:ready
start "" http://localhost:3000
echo AYUSH EPR is running.
pause
