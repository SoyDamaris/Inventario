@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
echo Iniciando el inventario. No cierres esta ventana mientras lo uses.
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:3000"
node server.js
echo.
echo El inventario se detuvo.
pause
