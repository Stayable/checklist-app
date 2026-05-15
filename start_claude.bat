@echo off
REM ============================================================
REM  RISE8 Operations Platform - Claude Code launcher (Windows)
REM ------------------------------------------------------------
REM  - Anchors to the repo (this script's directory)
REM  - Optionally syncs the working branch from origin
REM  - Launches Claude Code CLI
REM
REM  Usage:
REM    start_claude.bat            (default: fetch + fast-forward)
REM    start_claude.bat --no-pull  (skip all git network ops)
REM    start_claude.bat --fetch    (fetch only, no merge)
REM ============================================================

setlocal EnableExtensions
set "BRANCH=claude/rise8-operations-platform-rv9B6"
set "SYNC_MODE=pull"
if /i "%~1"=="--no-pull" set "SYNC_MODE=none"
if /i "%~1"=="--fetch"   set "SYNC_MODE=fetch"

REM Anchor to the directory this .bat lives in (the repo root)
cd /d "%~dp0"

echo.
echo === RISE8 Operations Platform =============================
echo Repo:    %cd%
echo Branch:  %BRANCH%
echo Sync:    %SYNC_MODE%
echo ===========================================================
echo.

REM Verify git is available
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git not found on PATH. Install Git for Windows: https://git-scm.com/download/win
    goto :hold
)

REM Resolve the claude launcher (npm installs claude.cmd on Windows)
set "CLAUDE_CMD="
for %%I in (claude.cmd claude.exe claude.bat claude) do (
    if not defined CLAUDE_CMD (
        for %%P in (%%~$PATH:I) do if not defined CLAUDE_CMD set "CLAUDE_CMD=%%~fP"
    )
)
if not defined CLAUDE_CMD (
    echo [ERROR] claude CLI not found on PATH.
    echo Install with: npm install -g @anthropic-ai/claude-code
    goto :hold
)

REM Ensure we are on the working branch (create from origin if missing locally)
git rev-parse --verify "%BRANCH%" >nul 2>nul
if errorlevel 1 (
    echo [INFO] Local branch missing - checking out from origin...
    git fetch origin "%BRANCH%" || goto :branch_fail
    git checkout -b "%BRANCH%" "origin/%BRANCH%" || goto :branch_fail
) else (
    git checkout "%BRANCH%" >nul 2>nul || goto :branch_fail
)
goto :sync

:branch_fail
echo [WARN] Could not switch to %BRANCH%. Continuing on the current branch.

:sync
if /i "%SYNC_MODE%"=="none" goto :launch
if /i "%SYNC_MODE%"=="fetch" (
    echo [INFO] Fetching origin/%BRANCH% ...
    git fetch origin "%BRANCH%"
    goto :launch
)

echo [INFO] Pulling latest from origin/%BRANCH% (fast-forward only) ...
git pull --ff-only origin "%BRANCH%"
if errorlevel 1 (
    echo [WARN] git pull failed (offline, auth needed, or non-fast-forward). Continuing with local state.
)

:launch
echo.
echo [INFO] Launching Claude Code: %CLAUDE_CMD%
echo.

REM CALL is critical: claude.cmd is a batch shim from npm.
REM Without CALL, control transfers and the parent .bat terminates when claude exits.
call "%CLAUDE_CMD%"
set "EXITCODE=%ERRORLEVEL%"

echo.
echo [INFO] Claude Code exited with code %EXITCODE%.

:hold
echo.
echo Press any key to close this window . . .
pause >nul
endlocal
