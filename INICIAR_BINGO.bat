@echo off
title BingoPro — Iniciador Automatico
color 0A

echo ===================================================
echo 🎱 INICIANDO BINGOPRO — SISTEMA AUTOMATIZADO
echo ===================================================
echo.

cd /d "%~dp0"

echo 1. Preparando base de datos local...
call npx prisma db push --skip-generate

echo.
echo 2. Abriendo Panel Admin Web en el navegador...
start http://localhost:3000

echo.
echo 3. Iniciando Motor de Juego y WhatsApp Bot...
echo ===================================================
echo Escanea el codigo QR que aparecera abajo en WhatsApp
echo ===================================================
echo.

call npm run dev

pause
