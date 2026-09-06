@echo off
setlocal
echo Removing SanctuaryCompanion Desktop Agent from Windows Startup...

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SanctuaryCompanionAgent.lnk"

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo Successfully removed from Windows Startup.
) else (
    echo Shortcut not found in Windows Startup.
)

pause
