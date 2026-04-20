@echo off
setlocal

set LAUNCHER=%~dp0run-cron.bat

echo [0/4] Clean up old tasks (if any)...
schtasks /Delete /TN "NakuContentLab_Collect_0900" /F >nul 2>&1
schtasks /Delete /TN "NakuContentLab_Collect_1400" /F >nul 2>&1
schtasks /Delete /TN "NakuContentLab_Collect_1800" /F >nul 2>&1

echo [1/3] Register 09:00 KST task...
schtasks /Create /TN "NakuContentLab_Collect_0900" /TR "\"%LAUNCHER%\"" /SC DAILY /ST 09:00 /F

echo [2/3] Register 14:00 KST task...
schtasks /Create /TN "NakuContentLab_Collect_1400" /TR "\"%LAUNCHER%\"" /SC DAILY /ST 14:00 /F

echo [3/3] Register 18:00 KST task...
schtasks /Create /TN "NakuContentLab_Collect_1800" /TR "\"%LAUNCHER%\"" /SC DAILY /ST 18:00 /F

echo.
echo Done. To run immediately for testing:
echo   schtasks /Run /TN "NakuContentLab_Collect_0900"
echo.
endlocal
pause
