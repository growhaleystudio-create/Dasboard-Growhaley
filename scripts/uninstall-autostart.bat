@echo off
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\Growhaley-Backend.lnk"

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo [OK] Auto-start Growhaley Backend berhasil dihapus.
) else (
    echo [INFO] Shortcut auto-start tidak ditemukan.
)

pause
