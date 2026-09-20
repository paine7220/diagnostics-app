# Kathy Health

Personal health companion for **Kathy**, built for iPhone. Track medications, how you feel, vitals, and care appointments — all on the device. No account. No cloud sync.

```
kathy-health/
  web/          canonical app (edit this)
  ios/          Capacitor wrapper (compile on a Mac with Xcode)
  sync-web.sh   copies web/ into ios/www
```

Version **1.0.0**.

## Use on iPhone right away

1. Open `web/index.html` on a computer, or host the `web/` folder (any static host).
2. On iPhone Safari, open that URL.
3. Tap **Share → Add to Home Screen**. The icon becomes **Kathy Health**.

## What it does

- **Today** — today’s meds checklist, quick feel log, next appointment
- **Meds** — schedule, doses, taken / skipped, refill notes
- **Feel** — symptoms with severity and notes
- **Numbers** — blood pressure, weight, glucose, heart rate
- **Care** — appointments, providers, questions for the doctor

Everything stays in on-device storage. Clearing Safari/app data clears the records.

## Native App Store build (Mac + Xcode)

```bash
cd kathy-health/ios
npm install
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your Apple Developer team.
2. Bundle ID is set to `com.michaelpaine.kathyhealth`.
3. Version is **1.0.0**.
4. **Product → Archive**, then upload from the Organizer.
5. Use `web/docs/privacy.html` as the App Store privacy policy URL.

Notification permission is requested only when Kathy enables med reminders.

## If you change the app

Edit files under `web/`, then:

```bash
bash sync-web.sh
```

On a Mac, also run `npx cap copy ios` from `ios/` before archiving.

## Checks

```bash
cd kathy-health
node tests/run-checks.js
```

## Notes

- This folder is a separate product from Auto/Truck Diagnostics for Dummies.
- Branding is **Kathy Health** everywhere.
- Core scripts: `web/app.js` (UI + storage), `web/styles.css`, `web/index.html`.
