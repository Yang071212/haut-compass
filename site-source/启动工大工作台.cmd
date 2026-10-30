@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist dist\server\index.js (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" http://127.0.0.1:4318
call npm start
pause
