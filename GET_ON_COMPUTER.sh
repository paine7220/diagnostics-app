#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGE="$DIR/web/index.html"
if [ ! -f "$PAGE" ]; then
  echo "Unzip the whole project folder first. This file must sit next to the web folder."
  exit 1
fi
echo "Opening Auto/Truck Diagnostics for Dummies on this computer..."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$PAGE"
elif command -v open >/dev/null 2>&1; then
  open "$PAGE"
else
  echo "Open this file in Chrome or Edge: $PAGE"
fi
