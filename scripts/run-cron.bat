@echo off
REM Launcher used by Windows Task Scheduler.
REM Do not rename/move — scheduled tasks reference this path.

set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"

"C:\Program Files\nodejs\node.exe" --env-file=".env.local" "scripts\cron-collect.mjs" --recent 30
