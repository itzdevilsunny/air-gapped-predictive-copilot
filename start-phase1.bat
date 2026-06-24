@echo off
REM ============================================================
REM ISRO Predictive NOC - Startup Script
REM Starts: Backend API (port 8000) + Frontend (port 5173)
REM ============================================================

SET PROJECT_DIR=c:\Users\Pinky\Desktop\my projects\isro poject
SET BACKEND_DIR=%PROJECT_DIR%\backend
SET FRONTEND_DIR=%PROJECT_DIR%\frontend
SET VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe

echo ============================================================
echo  ISRO Predictive NOC - Launch
echo ============================================================

REM --- Start Backend API ---
echo [1/2] Starting Backend API on port 8000...
start "ISRO-Backend" /min cmd /c "cd /d "%BACKEND_DIR%" && "%VENV_PYTHON%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
timeout /t 4 /nobreak > nul

REM --- Start Frontend ---
echo [2/2] Starting Frontend Dashboard on port 5173...
start "ISRO-Frontend" /min cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo  Services starting:
echo  - Backend API:  http://localhost:8000
echo  - Dashboard:    http://localhost:5173
echo.
echo  Wait ~10 seconds, then open http://localhost:5173 in your browser.
echo.
pause
