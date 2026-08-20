@echo off
setlocal
echo ===================================================
echo   Memasang Auto-Start Growhaley Backend di Windows
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%start-silent.vbs"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\Growhaley-Backend.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%..'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Auto-Start berhasil dipasang!
    echo Backend akan otomatis berjalan di background setiap kali laptop dinyalakan.
    echo Lokasi shortcut: %SHORTCUT_PATH%
) else (
    echo [ERROR] Gagal memasang shortcut auto-start.
)

echo.
pause
