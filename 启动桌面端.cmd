@echo off
setlocal
cd /d "%~dp0"

rem Launch the packaged build first (whale icon on taskbar).
if exist "dist\win-unpacked\DeepSeek Harness.exe" (
  start "" "dist\win-unpacked\DeepSeek Harness.exe"
  exit /b 0
)

rem Fallback to dev mode when no packaged build exists.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 22.5+ from https://nodejs.org/ first.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [INFO] Installing dependencies via npmmirror ...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check network and retry.
    pause
    exit /b 1
  )
)

npm start
