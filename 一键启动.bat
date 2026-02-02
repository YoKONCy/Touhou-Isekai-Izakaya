@echo off
setlocal

echo ======================================================
echo          Touhou Isekai Izakaya - Starter
echo ======================================================
echo.

rem 1. Check Node.js
echo [1/4] Checking environment...
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
echo [2/4] Installing/Checking dependencies (npm install)...
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
echo [3/4] Building project (npm run build)...
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
echo [4/4] Starting preview server (npm run preview)...
echo Once started, visit the HTTPS URL in your browser (usually https://localhost:14791)
echo Note: You may need to accept the self-signed certificate in your browser.
echo.

call npm run preview

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Preview stopped.
    pause
)
