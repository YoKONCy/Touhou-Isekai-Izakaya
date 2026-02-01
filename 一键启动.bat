@echo off
setlocal

echo ======================================================
echo          Touhou Isekai Izakaya - Starter
echo ======================================================
echo.

rem 1. Check Node.js
echo [1/3] Checking Node.js environment...
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
echo.

rem 2. Check node_modules
if not exist "node_modules\" (
    echo [2/3] node_modules not found. Installing dependencies...
    echo This may take a few minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo Installation complete.
) else (
    echo [2/3] node_modules exists. Skipping install.
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
echo Once started, visit the URL in your browser (usually http://localhost:4173)
echo.

call npm run preview

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Preview stopped.
    pause
)
