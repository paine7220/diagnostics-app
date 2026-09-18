#!/usr/bin/env bash
# Copies the canonical web/ source into both platform wrapper projects.
# Run this any time you edit files under web/ (index.html, app.js, diagnosticsEngine.js,
# styles.css, data/dtc-db.js, data/dtc-db.json, docs/*.html, icon.png) so Windows and
# iPhone builds stay in sync.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -rf "$DIR/windows/app"
mkdir -p "$DIR/windows/app"
cp -r "$DIR/web/." "$DIR/windows/app/"

rm -rf "$DIR/ios/www"
mkdir -p "$DIR/ios/www"
cp -r "$DIR/web/." "$DIR/ios/www/"

# Keep the generated Xcode public folder aligned when present. Capacitor also
# refreshes this on `npx cap copy ios` / `npx cap sync ios`.
PUBLIC_DIR="$DIR/ios/ios/App/App/public"
if [ -d "$DIR/ios/ios/App/App" ]; then
  rm -rf "$PUBLIC_DIR"
  mkdir -p "$PUBLIC_DIR"
  cp -r "$DIR/web/." "$PUBLIC_DIR/"
  : > "$PUBLIC_DIR/cordova.js"
  : > "$PUBLIC_DIR/cordova_plugins.js"
fi

echo "Synced web/ -> windows/app, ios/www, and ios/ios/App/App/public (if present)"
