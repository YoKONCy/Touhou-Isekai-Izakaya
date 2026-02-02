@echo off
setlocal

echo ======================================================
echo          Touhou Isekai Izakaya - Starter
echo ======================================================
echo.

rem 1. Check Node.js and pnpm
echo [1/4] Checking environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found. Trying to install pnpm via npm...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install pnpm!
        pause
        exit /b 1
    )
)

echo Node.js version: 
node -v
echo pnpm version:
call pnpm -v
echo.

rem 2. Check node_modules
if not exist "node_modules\" (
    echo [2/4] node_modules not found. Installing dependencies with pnpm...
    echo This may take a few minutes...
    echo.
    call pnpm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] pnpm install failed!
        pause
        exit /b 1
    )
    echo Installation complete.
) else (
    echo [2/4] node_modules exists. Skipping install.
)
echo.

rem 3. Build Project
echo [3/4] Building project (pnpm build)...
echo This ensures all components are compiled and ready.
echo.
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    echo Suggestion: If you see "Cannot find module" errors, try deleting the "node_modules" folder and run this script again.
    pause
    exit /b 1
)
echo.

rem 4. Start Preview Server
echo [4/4] Starting preview server (pnpm preview)...
echo Once started, visit the HTTPS URL in your browser (usually https://localhost:14791)
echo Note: You may need to accept the self-signed certificate in your browser.
echo.

call pnpm preview

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Preview stopped.
    pause
)
