#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing XcodeGen…"
    brew install xcodegen
  else
    echo "XcodeGen is not installed. Opening Package.swift for a Mac run instead."
    echo "For the iPhone simulator later: brew install xcodegen && ./Open-in-Xcode.command"
    open Package.swift
    exit 0
  fi
fi

xcodegen generate
open JobHuntOS.xcodeproj
echo "In Xcode: choose the JobHuntOS-iOS scheme, pick an iPhone simulator, press Run."
