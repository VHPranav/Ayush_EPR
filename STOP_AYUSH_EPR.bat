@echo off
cd /d "%~dp0"
docker compose stop
echo AYUSH EPR stopped. PostgreSQL volume is retained.
pause
