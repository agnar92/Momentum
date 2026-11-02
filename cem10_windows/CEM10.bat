@echo off
rem CEM10: dwuklik pobiera sklad indeksow i ceny miesieczne, liczy liste i otwiera ja w przegladarce.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cem10.ps1"
if errorlevel 1 (
  echo.
  echo Cos poszlo nie tak - przeczytaj komunikat powyzej.
  pause
)
