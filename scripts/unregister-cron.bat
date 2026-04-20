@echo off
echo Deleting scheduled tasks...
schtasks /Delete /TN "NakuContentLab_Collect_0900" /F
schtasks /Delete /TN "NakuContentLab_Collect_1400" /F
schtasks /Delete /TN "NakuContentLab_Collect_1800" /F

echo.
echo Done.
pause
