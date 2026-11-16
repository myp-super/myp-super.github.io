@echo off
setlocal
"%SystemRoot%\System32\chcp.com" 936 >nul
title 博客工作台
cd /d "%~dp0"

rem 如果服务已经运行，直接打开页面
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "try { $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8765); $c.Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 (
    start "" "http://127.0.0.1:8765/"
    exit /b 0
)

echo 正在启动博客工作台，请稍候...
start "博客工作台服务" /min python backend\app.py

rem 最多等待 30 秒，服务就绪后再打开浏览器
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$end=(Get-Date).AddSeconds(30); while ((Get-Date) -lt $end) { try { $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8765); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
    echo.
    echo 启动失败，请检查 Python 是否安装以及依赖是否完整。
    pause
    exit /b 1
)

start "" "http://127.0.0.1:8765/"
echo 工作台已打开，后台服务在任务栏中最小化运行。
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul
exit /b 0