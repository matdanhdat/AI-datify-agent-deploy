@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   KHOI DONG PIXEL TRADING AGENT (Trinh duyet + Vercel)
echo ========================================================
echo.

:: 1. Kiem tra Node.js
where node >nul 2>nul
if errorlevel 1 goto :no_node
goto :check_env

:no_node
echo [LOI] May tinh chua cai dat Node.js!
echo Vui long tai va cai dat ban Node.js LTS tu:
echo   https://nodejs.org/
echo Sau khi cai dat xong, hay mo lai file start.bat nay.
echo.
pause
exit /b 1

:check_env
:: 2. Kiem tra va tao .env.local neu chua co
if exist ".env.local" goto :check_deps
if not exist ".env.example" goto :check_deps
copy ".env.example" ".env.local" >nul
echo [THONG BAO] Da tao file .env.local tu mau .env.example.
echo [LUU Y] Mo file .env.local va dan khoa Gemini vao de bat tinh nang AI.
echo (Neu khong co khoa, ung dung van chay o Che do du phong).
echo.

:check_deps
:: 3. Kiem tra thu vien node_modules
if exist "node_modules" goto :run_app
echo [CAI DAT] Dang cai dat thu vien can thiet (npm ci)...
call npm ci
if errorlevel 1 goto :npm_err
echo [XONG] Cai dat thu vien thanh cong!
echo.
goto :run_app

:npm_err
echo.
echo [LOI] Cai dat thu vien that bai.
echo Goi y: Kiem tra ket noi Internet hoac thu chay 'npm install' bang tay.
echo.
pause
exit /b 1

:run_app
:: 4. Chay ung dung
echo Dang khoi dong may chu tai http://localhost:8000...
call npm start
if errorlevel 1 goto :server_err
goto :end

:server_err
echo.
echo [LOI] May chu dung voi ma loi %errorlevel%.
echo.
pause
exit /b %errorlevel%

:end
pause
