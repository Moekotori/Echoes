@echo off
cd /d E:\ECHO

echo [1/2] Removing lock files...
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\packed-refs.lock" del /f /q ".git\packed-refs.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"
if exist ".git\refs\heads\backup-my-code.lock" del /f /q ".git\refs\heads\backup-my-code.lock"
if exist ".git\refs\heads\ECHORe.lock" del /f /q ".git\refs\heads\ECHORe.lock"
if exist ".git\refs\stash.lock" del /f /q ".git\refs\stash.lock"
if exist ".git\refs\tags\1.3.5.lock" del /f /q ".git\refs\tags\1.3.5.lock"
if exist ".git\refs\tags\1.3.6.lock" del /f /q ".git\refs\tags\1.3.6.lock"
echo Done.

echo [2/2] Moving main pointer to backup-my-code (no checkout needed)...
git branch -f main backup-my-code
if errorlevel 1 ( echo ERROR: branch move failed & pause & exit /b 1 )

echo.
echo SUCCESS! Current state:
git log --oneline -4 main
echo.
echo backup-my-code and main are now at the same commit.
pause
