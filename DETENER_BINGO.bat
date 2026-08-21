@echo off
title BingoPro — Detener Sistema
color 0C

echo ===================================================
echo 🛑 DETENIENDO BINGOPRO
echo ===================================================
echo.

cd /d "%~dp0"

echo Deteniendo contenedores Docker...
docker-compose down

echo Sistema detenido exitosamente.
pause
