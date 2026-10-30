
@echo off
title Smart Healthcare SPMS (MERN)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
)

if not exist dist\index.html (
  echo Building the React frontend...
  call npm run build
  if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
)

start "" cmd /c "timeout /t 6 >nul && start http://localhost:5000"
call npm start
pause
