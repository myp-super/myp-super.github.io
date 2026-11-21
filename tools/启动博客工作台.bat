@echo off
setlocal
"%SystemRoot%\System32\chcp.com" 936 >nul
title 博客工作台
cd /d "%~dp0"
set "WORKDIR=%~dp0"
set "PYTHON=%~dp0.venv\Scripts\python.exe"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "STDOUT_LOG=%~dp0workbench.stdout.log"
set "STDERR_LOG=%~dp0workbench.stderr.log"

if not exist "%PYTHON%" (
    echo 工作台独立运行环境缺失：.venv
    echo 请重新安装工作台运行环境。
    pause
    exit /b 1
)

echo 正在打开博客工作台，请稍候...
"%POWERSHELL%" -NoProfile -Command "function Test-Ready { try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 1; return ($r.ok -eq $true) } catch { return $false } }; if (Test-Ready) { exit 0 }; $p=Start-Process -FilePath $env:PYTHON -ArgumentList 'backend\app.py' -WorkingDirectory $env:WORKDIR -WindowStyle Minimized -RedirectStandardOutput $env:STDOUT_LOG -RedirectStandardError $env:STDERR_LOG -PassThru; $end=(Get-Date).AddSeconds(30); while ((Get-Date) -lt $end) { if (Test-Ready) { exit 0 }; if ($p.HasExited) { exit 2 }; Start-Sleep -Milliseconds 250 }; exit 1"
if errorlevel 1 (
    echo.
    echo 启动失败。下面是最近的错误日志：
    "%POWERSHELL%" -NoProfile -Command "if (Test-Path -LiteralPath $env:STDERR_LOG) { Get-Content -LiteralPath $env:STDERR_LOG -Tail 20 }"
    echo.
    echo 完整日志：%STDERR_LOG%
    pause
    exit /b 1
)

start "" "http://127.0.0.1:8765/"
echo 工作台已打开，后台服务在任务栏中最小化运行。
exit /b 0