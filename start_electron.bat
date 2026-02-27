@echo off
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies, please wait...
    npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
)
npm start
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start. See message above.
    pause
)
