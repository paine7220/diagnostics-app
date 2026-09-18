# Auto/Truck Diagnostics for Dummies

Offline diagnostic assistant for Michael Paine. One canonical web app, two platform wrappers.

```
web/          canonical app (edit this)
windows/      Electron + electron-builder wrapper
ios/          Capacitor wrapper (compile on a Mac)
sync-web.sh   copies web/ into windows/app, ios/www, and the Xcode public folder
SYNC_WEB.bat  same copy step for Windows machines without bash
```

Version **1.2.0**. Core diagnosis is on-device: bundled DTC lookup, symptom triage, fluid assistant, media-assisted cues, case save/export, and legal/pricing pages. No network calls. No live OBD hardware integration. CDI Genius is intentionally not included.

## If you change the app

Edit files under `web/`, then sync the wrappers:

```
bash sync-web.sh
```

On Windows you can run `SYNC_WEB.bat` instead. This copies `web/` into `windows/app/` and `ios/www/`. For iOS, run `npx cap copy ios` (from `ios/`) on a Mac before archiving in Xcode.

## Windows build

```
cd windows
npm install
npm start
```

Or double-click `windows/START_APP_FOR_TESTING.bat`.

Installer / portable EXE:

```
windows\BUILD_WINDOWS_INSTALLER.bat
```

That script runs `npm install` and `npm run dist:win`. Output lands in `windows/dist/`:

- `Auto_Truck_Diagnostics_for_Dummies_Setup_1.2.0_*.exe` (NSIS one-click)
- `Auto_Truck_Diagnostics_for_Dummies_Portable_1.2.0_*.exe`

Azure Trusted Signing stays in `windows/package.json` (`azureSignOptions`: account `ravin-ai-signing`, profile `ravin-ai-public`, endpoint `https://eus.codesigning.azure.net/`, publisher `CN=Michael Paine, O=Michael Paine, L=Superior, S=wi, C=US`). Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_SECRET` (or `az login`) for a signed build. If signing credentials are missing, the bat file falls back to `npm run dist:win:unsigned`.

## iPhone / App Store build

The native iOS project is generated but must be compiled on a Mac with Xcode, CocoaPods, and an Apple Developer Program account.

```
cd ios
npm install
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your Apple Developer team.
2. Replace the placeholder app icon in `ios/ios/App/App/Assets.xcassets/AppIcon.appiconset` with a real 1024×1024 icon if Apple rejects the bundled one.
3. Version is already set to **1.2.0**.
4. **Product → Archive**, then upload from the Organizer (or Transporter).
5. App Store Connect bundle ID: `com.michaelpaine.autotruckdiagnosticsfordummies`. Host or link `web/docs/privacy.html` as the privacy policy URL.

Camera and microphone permission strings are already set in `Info.plist`.

## Optional web preview (Cloudflare)

The canonical app in `web/` is already a static offline site. This repo includes `wrangler.jsonc` so the existing Cloudflare Workers Git integration (`noisy-pond-2dc8`) can publish those files as static assets. Core diagnosis still does not need the network.

## Checks

```
node tests/run-checks.js
```

## Notes

- Branding is **Dummies** everywhere (not Dummys).
- Script tags in `web/index.html` load `./data/dtc-db.js` (`window.DTC_DB_DATA`), `./diagnosticsEngine.js` (`DiagEngine`), and `./app.js`.
- 1.2.0 fixes the P0300 / P0301–P0312 misfire description shift and several other high-traffic wrong descriptions, adds code-specific DIY for common SAE codes already in the database, includes a full engine-rebuild path, and how-to jobs (starters through 4WD axles). See `CHANGELOG.md`.
