@echo off
echo Jobnick Extension Installer
echo ===========================
echo.
echo This script will open Chrome's extensions page for you.
echo.
echo Instructions:
echo 1. Enable "Developer mode" (toggle in top right)
echo 2. Click "Load unpacked"
echo 3. Select this folder containing the extension files
echo 4. The extension should now appear in your extensions list
echo 5. Pin the extension to your toolbar for easy access
echo.
echo Note: You need to create actual PNG icon files before using:
echo - icons/icon16.png (16x16 pixels)
echo - icons/icon48.png (48x48 pixels)  
echo - icons/icon128.png (128x128 pixels)
echo.
echo Press any key to open Chrome extensions page...
pause >nul

start chrome://extensions/

echo.
echo Chrome extensions page opened!
echo Follow the instructions above to complete installation.
echo.
pause 