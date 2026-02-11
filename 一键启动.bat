@echo off
setlocal enabledelayedexpansion

title Touhou Isekai Izakaya - Starter

echo ======================================================
echo          Touhou Isekai Izakaya - Starter
echo ======================================================
echo.

rem 1. Check Node.js
echo Step 1/4: Checking environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js version:
node -v
echo npm version:
call npm -v
echo.

rem 2. Install dependencies
echo Step 2/4: Installing/Checking dependencies (npm install)...
echo This ensures all required packages are present.
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed!
    echo Suggestion: Try deleting the "node_modules" folder and run this script again.
    pause
    exit /b 1
)
echo.

rem 3. Build Project
echo Step 3/4: Building project (npm run build)...
echo This ensures all components are compiled and ready.
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo.

rem 4. Start Preview Server
echo Step 4/4: Starting preview server (npm run preview)...
echo Once started, visit the HTTPS URL in your browser (usually https://localhost:14791)
echo.

rem 临时忽略 SSL 验证，以允许 mkcert 插件在网络不佳时下载证书工具
set NODE_TLS_REJECT_UNAUTHORIZED=0

call npm run preview

if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Preview failed to start with HTTPS.
    echo This is usually caused by network issues downloading the SSL certificate tool.
    echo.
    set /p choice="Would you like to try starting in COMPATIBILITY MODE (HTTP instead of HTTPS)? (y/n): "
    if /i "!choice!"=="y" (
        echo.
        echo Starting in Compatibility Mode (HTTP)...
        echo Note: OPFS storage will ONLY work on "http://localhost:14791". 
        echo Mobile access via IP will NOT have persistent storage.
        echo.
        set VITE_NO_HTTPS=true
        call npm run preview
    ) else (
        echo.
        echo [INFO] Preview stopped.
        pause
    )
)
