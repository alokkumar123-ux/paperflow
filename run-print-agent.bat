@echo off
title PaperFlow Silent Printer Agent
color 0A
cd /d "D:\paperflow"
echo ========================================================
echo   PaperFlow Silent Print Agent
echo   Connected to Canon G2010 series
echo ========================================================
echo.
echo Starting agent...
bun run print-agent.mjs
pause
