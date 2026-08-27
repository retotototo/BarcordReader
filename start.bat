@echo off
chcp 65001 > nul
title CodeReader Local Server

echo ==================================================
echo   CodeReader サーバーを起動しています...
echo ==================================================

where python >nul 2>nul
if %errorlevel% equ 0 (
    python server.py
    pause
    exit /b
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    py server.py
    pause
    exit /b
)

echo [エラー] Python が見つかりませんでした。
echo Python がインストールされているかご確認ください。
pause
