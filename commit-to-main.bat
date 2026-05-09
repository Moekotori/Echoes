@echo off
chcp 65001 >nul
cd /d E:\ECHO

echo [1/4] 删除残留锁文件...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\index.stash.*.lock" 2>nul

echo [2/4] 暂存所有改动...
git add -A
if errorlevel 1 ( echo ERROR: git add 失败 & pause & exit /b 1 )

echo [3/4] 提交到当前分支 backup-my-code...
git commit -m "chore: update project files and normalize line endings"
if errorlevel 1 ( echo ERROR: git commit 失败 & pause & exit /b 1 )

echo [4/4] 切到 main 并 fast-forward merge...
git checkout main
if errorlevel 1 ( echo ERROR: 切换到 main 失败 & pause & exit /b 1 )
git merge backup-my-code --ff-only
if errorlevel 1 ( echo ERROR: merge 失败 & pause & exit /b 1 )

echo.
echo ✅ 完成！已成功 commit 并 merge 到 main。
git log --oneline -3
pause
