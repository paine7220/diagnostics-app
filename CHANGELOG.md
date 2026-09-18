# Changelog

## 1.2.0

- Ship the complete offline Auto/Truck Diagnostics for Dummies app as the GitHub source of truth (`web/`, `windows/`, `ios/`).
- Fix DTC `P0300`: description is now **Random/Multiple Cylinder Misfire Detected** (subsystem `ignition_misfire`), matching the engine guidance. Sibling misfire codes `P0301`–`P0312` were one cylinder off and are restored to the standard SAE meanings. Leftover `P0320` “Cylinder 12 Misfire” text is restored to the ignition/engine-speed circuit meaning.
- Align other high-traffic wrong descriptions with SAE / engine guidance: `P0171`, `P0174`, `P0335`, `P0420`, `P0430`, `P0480`, `P0521`, `P0700`. Add missing `U0100` and `C0035` entries used by the engine.
- Keep `web/index.html` script tags on the real files: `data/dtc-db.js`, `diagnosticsEngine.js`, `app.js`. Guard the UI if those files fail to load.
- Live fluid guidance, readable diagnosis results, text report export, and a Clear Saved Case control. Legal/pricing docs open inside the app with a back link.
- Windows wrapper 1.2.0: Electron preload version, app icon, single-instance lock, local doc windows, `BUILD_WINDOWS_INSTALLER.bat` (`npm install` + `npm run dist:win`) with Azure Trusted Signing comments and an unsigned fallback (`dist:win:unsigned`). `azureSignOptions` unchanged (`ravin-ai-signing` / `ravin-ai-public` / `https://eus.codesigning.azure.net/`).
- `sync-web.sh` and `SYNC_WEB.bat` copy `web/` to `windows/app`, `ios/www`, and the Xcode public folder.
- Branding remains **Dummies**. CDI Genius is still excluded. No live OBD hardware integration.

## 1.1.0

- Initial packaged offline web app with Electron and Capacitor wrappers.
