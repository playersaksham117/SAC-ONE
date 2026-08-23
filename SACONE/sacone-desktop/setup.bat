@echo off
echo ========================================
echo TracInvent - Inventory Tracking System
echo Setup Script for Windows
echo ========================================
echo.

echo Checking Flutter installation...
flutter --version
if %errorlevel% neq 0 (
    echo Error: Flutter is not installed or not in PATH
    echo Please install Flutter from https://flutter.dev
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
flutter pub get

echo.
echo Enabling Windows desktop support...
flutter config --enable-windows-desktop

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo To run the application:
echo   flutter run -d windows
echo.
echo To build for production:
echo   flutter build windows
echo.
pause
