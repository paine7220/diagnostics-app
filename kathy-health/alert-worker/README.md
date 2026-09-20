# Family alert worker (automatic SMS)

When Kathy’s sugar is low and she does **not** respond, the phone app POSTs to this worker. With Twilio secrets set, the worker texts family **without Kathy tapping Send**.

## Deploy

```bash
cd kathy-health/alert-worker
npx wrangler deploy
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
```

Copy the worker URL (e.g. `https://kathy-health-alerts.<account>.workers.dev`) into the app:

**Settings → Alert webhook** → `https://kathy-health-alerts.<account>.workers.dev/alert`

## Test

```bash
curl -X POST https://kathy-health-alerts.<account>.workers.dev/alert \
  -H 'content-type: application/json' \
  -d '{"message":"Test alert","family":[{"name":"Michael","phone":"5551234567"}],"type":"test"}'
```

IFTTT/Zapier webhooks also work in the same Settings field if you prefer those instead of Twilio.
