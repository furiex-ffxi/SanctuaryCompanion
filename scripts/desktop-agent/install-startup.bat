@echo off
setlocal
echo Installing SanctuaryCompanion Desktop Agent to Windows Startup...

set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%start-desktop-agent-silent.vbs"
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SanctuaryCompanionAgent.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%..\..'; $s.WindowStyle = 7; $s.Save()"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Successfully installed! The desktop agent will now run silently at Windows startup.
    echo Shortcut: %SHORTCUT_PATH%
) else (
    echo.
    echo Failed to create startup shortcut.
)

pause
