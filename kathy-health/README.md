# Kathy’s Health

Personal health companion for Kathy — built for iPhone (Add to Home Screen / Capacitor), works offline on any phone or computer.

**Data stays on the device.** No account. No cloud sync unless you export a backup file yourself (for example to OneDrive).

## What’s included

- **Today** — meds due now, next appointment, quick symptom/vital entry
- **Medications** — name, dose, schedule, taken / skipped tracking, refill notes
- **Symptoms** — journal with severity and free-text notes
- **Vitals** — blood pressure, heart rate, weight, blood sugar, temperature
- **Care** — appointments, care-team contacts, questions to ask the doctor
- **Import notes** — paste text from OneDrive or ChatGPT; the app extracts meds, appointments, and contacts when it can
- **Backup** — export / import a JSON file you can keep in OneDrive

This is a personal organizer and visit helper. It is **not** a medical device and does not diagnose or treat conditions.

## Open on iPhone

1. Host or open `kathy-health/web/index.html` (local file, static host, or GitHub Pages).
2. In Safari: **Share → Add to Home Screen**.
3. Optional native shell: see `kathy-health/ios/` (Capacitor; archive on a Mac with Xcode).

## Open on a computer

Open `kathy-health/web/index.html` in Chrome, Edge, or Safari, or serve the folder:

```bash
cd kathy-health/web && python3 -m http.server 8787
```

Then visit `http://localhost:8787`.

## Checks

```bash
node kathy-health/tests/run-checks.js
```

## Notes about OneDrive / ChatGPT

This agent run did not have authenticated OneDrive or ChatGPT access. Use **Import notes** in the app to paste design or care notes from those sources, or drop an exported JSON backup into **Settings → Import backup**.
