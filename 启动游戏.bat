@echo off
chcp 65001 >nul
title 耙耳朵麻将馆 - 一键启动

echo.
echo ==================================================
echo    🀄 耙耳朵麻将馆 - 一键启动
echo ==================================================
echo.

cd /d "%~dp0"

echo [1/3] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

echo.
echo [2/3] 启动游戏服务器...
start "麻将馆服务器" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul

echo.
echo [3/3] 启动公网隧道...
echo.
echo ==================================================
echo   🌐 正在获取公网地址，请稍候...
echo ==================================================
echo.

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 80:localhost:3000 nokey@localhost.run

echo.
echo 隧道已关闭，按任意键退出...
pause >nul
