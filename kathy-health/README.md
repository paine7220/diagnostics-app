# Kathy’s Health

Personal health companion for Kathy — iPhone (Safari Add to Home Screen).

## Dexcom / CGM

**Settings → Dexcom / CGM**:

- **Dexcom Share** — Kathy’s Share username/password (Share must be on; add a follower). Needs the alert worker base URL (same host as the family alert webhook).
- **Nightscout** — Nightscout site URL (+ optional API secret)

While the app is open it polls CGM. A low reading starts the family check-in automatically.

## Family alerts

If she does not tap **I’m OK** in time, the app POSTs to your webhook so family can be texted without her tapping Send. See `alert-worker/`.

## Checks

```bash
node kathy-health/tests/run-checks.js
```
