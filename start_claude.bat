@echo on
cd /d "%~dp0"
echo.
echo --- Step 1: in repo dir ---
cd
echo.
echo --- Step 2: git checkout ---
git checkout claude/rise8-operations-platform-rv9B6
echo errorlevel=%errorlevel%
echo.
echo --- Step 3: git pull ---
git pull
echo errorlevel=%errorlevel%
echo.
echo --- Step 4: launching claude ---
claude
echo errorlevel=%errorlevel%
echo.
echo --- Done. Press any key to close. ---
pause >nul
