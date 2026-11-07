@echo off
rem Abre o Sonoplastia (compila e inicia). Clique duas vezes neste arquivo.
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Instale a versao LTS em https://nodejs.org e tente de novo.
  goto erro
)
if not exist node_modules (
  echo Instalando as dependencias pela primeira vez. Aguarde...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
)
if not exist node_modules\electron\dist\electron.exe (
  echo Baixando o Electron...
  pushd node_modules\electron
  node install.js
  if errorlevel 1 ( popd & goto erro )
  popd
)
echo Abrindo o Sonoplastia...
call npm start
if errorlevel 1 goto erro
exit /b 0
:erro
echo.
echo Algo deu errado. Veja a mensagem acima.
pause
exit /b 1
