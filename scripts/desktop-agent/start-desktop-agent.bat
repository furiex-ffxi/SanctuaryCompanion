@echo off
title SanctuaryCompanion Desktop Agent
cd /d "%~dp0\..\.."
echo Starting SanctuaryCompanion Desktop Agent...
node scripts/desktop-agent/desktop-agent.mjs %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Desktop Agent stopped or encountered an error.
    pause
)
