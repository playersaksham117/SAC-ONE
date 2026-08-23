#!/bin/bash

echo "========================================"
echo "TracInvent - Inventory Tracking System"
echo "Setup Script for Linux/macOS"
echo "========================================"
echo

echo "Checking Flutter installation..."
if ! command -v flutter &> /dev/null; then
    echo "Error: Flutter is not installed or not in PATH"
    echo "Please install Flutter from https://flutter.dev"
    exit 1
fi

flutter --version

echo
echo "Installing dependencies..."
flutter pub get

echo
echo "Enabling desktop support..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Enabling Linux desktop support..."
    flutter config --enable-linux-desktop
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Enabling macOS desktop support..."
    flutter config --enable-macos-desktop
fi

echo
echo "========================================"
echo "Setup complete!"
echo "========================================"
echo
echo "To run the application:"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "  flutter run -d linux"
    echo
    echo "To build for production:"
    echo "  flutter build linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  flutter run -d macos"
    echo
    echo "To build for production:"
    echo "  flutter build macos"
fi
echo
