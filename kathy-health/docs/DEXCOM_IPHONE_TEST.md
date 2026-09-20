# Connect Dexcom on Michael’s iPhone (test)

Tap-ready app URL (Safari):

**https://fallen-memorial-liable-armor.trycloudflare.com/**

## Steps

1. On Michael’s iPhone, open **Safari** → that link → **Share → Add to Home Screen**.
2. Open the **Dexcom** app → **Share** → turn **Sharing On** (add a follower if prompted; inviting yourself is fine).
3. Open **Kathy’s Health** → **Today**:
   - Dexcom username / password (same account as the Dexcom app)
   - Region: United States (or Outside US)
   - Tap **Connect Dexcom**
4. Live glucose should appear. Lows start the family check-in.

The phone-test server proxies Dexcom Share on the same URL (`/dexcom/latest`), so no separate worker is required for this test.
