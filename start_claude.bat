@echo off
REM ============================================================
REM  RISE8 Operations Platform - Claude Code launcher (Windows)
REM ------------------------------------------------------------
REM  - Anchors to the repo (this script's directory)
REM  - Pulls the latest from the working branch
REM  - Launches Claude Code CLI
REM ============================================================

setlocal
set "BRANCH=claude/rise8-operations-platform-rv9B6"

REM Move to the directory this .bat lives in (the repo root)
cd /d "%~dp0"

echo.
echo === RISE8 Operations Platform =============================
echo Repo:    %cd%
echo Branch:  %BRANCH%
echo ===========================================================
echo.

REM Verify git is available
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git not found on PATH. Install Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Verify claude CLI is available
where claude >nul 2>nul
if errorlevel 1 (
    echo [ERROR] claude CLI not found on PATH.
    echo Install with: npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

REM Make sure we are on the working branch (create from origin if missing locally)
git rev-parse --verify "%BRANCH%" >nul 2>nul
if errorlevel 1 (
    echo [INFO] Local branch missing - checking out from origin...
    git fetch origin "%BRANCH%"
    git checkout -b "%BRANCH%" "origin/%BRANCH%"
) else (
    git checkout "%BRANCH%"
)

REM Pull latest (non-fatal if offline)
echo [INFO] Pulling latest from origin/%BRANCH% ...
git pull origin "%BRANCH%" --ff-only
if errorlevel 1 (
    echo [WARN] git pull failed (offline or non-fast-forward). Continuing with local state.
)

echo.
echo [INFO] Launching Claude Code...
echo.
claude

endlocal
