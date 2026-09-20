# Kathy’s Health

Personal health companion for Kathy — built for iPhone (Add to Home Screen / Capacitor).

**Family safety alerts are online:** when blood sugar is logged below her threshold and she does not tap **I’m OK** in time, the app texts configured family numbers (SMS compose) and can POST to an optional webhook (IFTTT / Zapier / Twilio). Meds, symptoms, and care notes still store on the device.

## What’s included

- **Today** — blood sugar log, help button, meds due, next appointment
- **Low-sugar check-in** — countdown; no response → alert family
- **Medications** — schedule and taken / skipped tracking
- **Symptoms** and **vitals** logging
- **Care** — appointments, care-team contacts, doctor questions
- **Import notes** — paste text from OneDrive or ChatGPT
- **Settings** — family phones, sugar threshold, response window, webhook, backup export/import

This is a personal organizer and safety helper. It is **not** a medical device and does not replace calling emergency services.

## Open on iPhone

1. Host or open `kathy-health/web/index.html`.
2. Safari → **Share → Add to Home Screen**.
3. In **Settings**, add family phone numbers and confirm the low-sugar threshold.
4. Allow notifications when prompted so check-ins can surface on the lock screen.

## Checks

```bash
node kathy-health/tests/run-checks.js
```
