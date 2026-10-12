@echo off
cd /d "%~dp0"
echo === CONTAINERS ===
docker compose ps
echo.
echo === HEALTH ===
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 5|Select-Object -Expand Content}catch{Write-Host $_.Exception.Message}"
echo.
echo === SERVER LOGS ===
docker compose logs --tail=100 server
pause
