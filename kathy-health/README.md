# Kathy’s Health

Personal health companion for Kathy — iPhone (Safari Add to Home Screen).

## Dexcom / CGM + insulin pump

Settings connects Dexcom Share or Nightscout CGM, and Nightscout pump status (IOB, boluses, suspend).

## Bills & insurance AI

**Bills** tab: paste an EOB/bill and get explain / appeal draft / call script / error checklist.

- Works on-device with a built-in helper
- Optional AI: deploy `alert-worker` with `OPENAI_API_KEY`, or paste an OpenAI key in Settings

## Family alerts

Low sugar + no **I’m OK** → webhook texts family.

## Checks

```bash
node kathy-health/tests/run-checks.js
```
