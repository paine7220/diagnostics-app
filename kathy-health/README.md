# Kathy’s Health

Personal health companion for Kathy — built for iPhone (Add to Home Screen / Capacitor).

## Family low-sugar alerts (online)

When blood sugar is logged at or below her threshold and she does **not** tap **I’m OK** in time:

1. The app POSTs an alert to your **webhook** (hands-free — no Send tap on her phone)
2. Deploy `kathy-health/alert-worker` with Twilio secrets to text family automatically  
   **or** point Settings at an IFTTT / Zapier / Twilio webhook
3. **I need help now** also opens SMS compose as a backup when she can still tap

Meds, symptoms, and care notes still store on the device.

## Setup on iPhone

1. Open `kathy-health/web/` in Safari → **Add to Home Screen**
2. **Settings → Family to alert** → add phone numbers
3. Deploy the alert worker (see `kathy-health/alert-worker/README.md`) and paste `…/alert` into **Alert webhook**
4. Tap **Send test alert**
5. Allow notifications when prompted

## Checks

```bash
node kathy-health/tests/run-checks.js
```
