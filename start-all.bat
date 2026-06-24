@echo off
REM ============================================================
REM ISRO Air-Gapped Predictive NOC Copilot — Full Stack Launcher
REM Starts ALL 3 services:
REM   - Phase 1 AI Backend API   (port 8001)
REM   - Phase 1-5 NOC Dashboard  (port 5175)
REM   - Phase 6 Self-Healing UI  (port 5176)
REM ============================================================

SET PROJECT_DIR=%~dp0
SET BACKEND_DIR=%PROJECT_DIR%backend
SET PHASE1_BACKEND=%PROJECT_DIR%phase1-backend
SET PHASE1_DASH=%PROJECT_DIR%phase1-dashboard
SET PHASE6_DASH=%PROJECT_DIR%phase6-dashboard
SET VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe

echo.
echo ============================================================
echo   ISRO Predictive NOC Copilot - Full Stack Launch
echo ============================================================
echo.

REM Check Python venv exists
IF NOT EXIST "%VENV_PYTHON%" (
    echo [ERROR] Python virtual environment not found at:
    echo         %VENV_PYTHON%
    echo.
    echo Please run:  cd backend ^&^& python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM --- Start Phase 1 AI Backend (port 8001) ---
echo [1/3] Starting Phase 1 AI Backend on port 8001...
start "ISRO-Phase1-API" /min cmd /c "cd /d "%PHASE1_BACKEND%" && "%VENV_PYTHON%" -m uvicorn phase1_api:app --host 127.0.0.1 --port 8001"
timeout /t 5 /nobreak > nul

REM --- Start Phase 1-5 Dashboard (port 5175) ---
echo [2/3] Starting Phase 1-5 NOC Dashboard on port 5175...
start "ISRO-Phase1-Dashboard" /min cmd /c "cd /d "%PHASE1_DASH%" && npm run dev -- --port 5175"
timeout /t 3 /nobreak > nul

REM --- Start Phase 6 Self-Healing Dashboard (port 5176) ---
echo [3/3] Starting Phase 6 Self-Healing Dashboard on port 5176...
start "ISRO-Phase6-Dashboard" /min cmd /c "cd /d "%PHASE6_DASH%" && npm run dev -- --port 5176"

echo.
echo ============================================================
echo   All services starting...
echo.
echo   Phase 1 AI Backend:      http://localhost:8001
echo   API Documentation:        http://localhost:8001/docs
echo   Phase 1-5 NOC Dashboard: http://localhost:5175
echo   Phase 6 Self-Healing:    http://localhost:5176
echo.
echo   Wait ~10 seconds then open the dashboards in your browser.
echo   Use the dashboard to START the Telemetry Generator.
echo ============================================================
echo.
pause
