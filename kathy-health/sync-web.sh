#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/ios/www"
# Prefer rsync when available; fall back to cp for slim environments.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude '.DS_Store' "$ROOT/web/" "$ROOT/ios/www/"
else
  rm -rf "$ROOT/ios/www"
  mkdir -p "$ROOT/ios/www"
  cp -a "$ROOT/web/." "$ROOT/ios/www/"
fi
echo "Synced web/ → ios/www/"
