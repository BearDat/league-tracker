@echo off
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] starting >> logs\bot.log
"C:\Program Files\nodejs\node.exe" src\index.js >> logs\bot.log 2>&1
echo [%date% %time%] exited with %errorlevel%, restarting in 15s >> logs\bot.log
timeout /t 15 /nobreak >nul
goto loop
