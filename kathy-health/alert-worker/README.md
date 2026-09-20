# Family alert worker (automatic SMS + Dexcom Share proxy)

When Kathy’s sugar is low and she does **not** respond, the phone app POSTs to this worker. With Twilio secrets set, the worker texts family **without Kathy tapping Send**.

It also proxies **Dexcom Share** (`POST /dexcom/latest`) so the iPhone app can read CGM values (browser CORS blocks calling Share directly).

## Deploy

```bash
cd kathy-health/alert-worker
npx wrangler deploy
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
```

In the app:

- **Settings → Alert webhook** → `https://kathy-health-alerts.<account>.workers.dev/alert`
- **Settings → Dexcom / CGM** → Dexcom Share + username/password (Share enabled on Dexcom app)

## Test alert

```bash
curl -X POST https://kathy-health-alerts.<account>.workers.dev/alert \
  -H 'content-type: application/json' \
  -d '{"message":"Test alert","family":[{"name":"Michael","phone":"5551234567"}],"type":"test"}'
```

## Dexcom Share proxy

```bash
curl -X POST https://kathy-health-alerts.<account>.workers.dev/dexcom/latest \
  -H 'content-type: application/json' \
  -d '{"accountName":"kathy","password":"…","region":"us"}'
```

Region `ous` for outside the US. IFTTT/Zapier webhooks also work for `/alert` if you prefer those instead of Twilio.
