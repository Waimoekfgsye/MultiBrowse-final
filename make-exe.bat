@echo off
setlocal enabledelayedexpansion

echo.
echo  ======================================================================
echo    MultiBrowse - Clean ^& Build EXE
echo  ======================================================================
echo.

:: Close anything still holding files open
:: -----------------------------------------------------------------
:: The #1 cause of "EBUSY: resource busy or locked" during packaging
:: is a MultiBrowse window (or a Camoufox/Firefox process it launched)
:: still running from a previous test — Windows won't let electron-
:: builder overwrite a file that process has a handle on. This closes
:: them first. /F force-kills, and the redirect hides "not found" noise
:: when nothing is running.
echo  [1/9] Closing any running MultiBrowse / Camoufox processes...
taskkill /IM MultiBrowse.exe /F >nul 2>&1
taskkill /IM camoufox.exe /F >nul 2>&1
taskkill /IM nimbus.exe /F >nul 2>&1
taskkill /IM electron.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul 2>&1
echo         Done.

:: Check Node.js
echo  [2/9] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo         ERROR: Node.js not found!
    echo         Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo         Found Node.js %%i

:: Clean
echo  [3/9] Cleaning old files...
:: A locked file can make rmdir fail silently and leave stale output for
:: electron-builder to trip over later, so this retries once before
:: giving up with a clear message instead of a raw EBUSY stack trace.
if exist node_modules rmdir /s /q node_modules >nul 2>&1
if exist dist rmdir /s /q dist >nul 2>&1
if exist release (
    rmdir /s /q release >nul 2>&1
    if exist release (
        echo         release\ still locked - retrying...
        timeout /t 2 /nobreak >nul 2>&1
        rmdir /s /q release >nul 2>&1
    )
    if exist release (
        echo         ERROR: release\ is still locked by another program.
        echo         Close any Explorer window open inside it, pause your
        echo         antivirus's real-time scan, then re-run this script.
        pause
        exit /b 1
    )
)
if exist build rmdir /s /q build >nul 2>&1
if exist package-lock.json del /f /q package-lock.json >nul 2>&1
echo         Done.

:: Install dependencies
echo  [4/9] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo         ERROR: npm install failed!
    pause
    exit /b 1
)
echo         Done.

:: Download rcedit.exe if missing (for per-profile taskbar icons)
if not exist electron\rcedit.exe (
    echo  [5/9] Downloading rcedit.exe...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' -OutFile 'electron\rcedit.exe'"
    if not exist electron\rcedit.exe (
        echo         WARNING: rcedit download failed - per-profile taskbar icons will be skipped
    ) else (
        echo         Done.
    )
) else (
    echo  [5/9] rcedit.exe already present.
)

:: Create icon files
:: -----------------------------------------------------------------
:: The Camoufox ENGINE itself is no longer fetched here — it's downloaded
:: automatically the first time you press Start on a profile, and it
:: always grabs whatever the latest release on daijro/camoufox is at
:: that moment (see electron/camoufoxEngine.cjs). Running "camoufox-js
:: fetch" here used to pin an old copy that this script would then ship
:: inside node_modules and never update.
echo  [6/9] Creating app icons...
if not exist build mkdir build
node scripts/create-icon.cjs
node scripts/prepare-icons.cjs
if not exist build\icon.png (
    echo         ERROR: build\icon.png was not created!
    pause
    exit /b 1
)
echo         PNG: build\icon.png (electron-builder converts to .ico)
echo         Done.

:: Build Vite app
echo  [7/9] Building web app...
call npm run build
if %errorlevel% neq 0 (
    echo         ERROR: Vite build failed!
    pause
    exit /b 1
)
echo         Done.

:: package.json already ships with main/name/productName/version set —
:: nothing to rewrite here.
echo  [8/9] Configuring Electron...
echo         Already configured.

:: Build EXE
echo  [9/9] Building EXE (this may take a few minutes)...
echo.
call npx electron-builder --config electron-builder.json --win
if %errorlevel% neq 0 (
    echo.
    echo  ======================================================================
    echo    ERROR: EXE build failed!
    echo  ======================================================================
    echo    If the error mentions EBUSY / "resource busy or locked":
    echo      1. Close MultiBrowse and any Camoufox window it launched
    echo      2. Close any Explorer window sitting inside the release\ folder
    echo      3. Temporarily pause antivirus real-time scanning, then re-run
    echo  ======================================================================
    pause
    exit /b 1
)

echo.
echo  ======================================================================
echo    BUILD COMPLETE!
echo  ======================================================================
echo.
echo    Output files in: release\
echo.

:: List output files
for %%f in (release\*.exe) do (
    echo    - %%~nxf
)

echo.
echo    You can now run MultiBrowse-Portable.exe
echo  ======================================================================
echo.
pause
