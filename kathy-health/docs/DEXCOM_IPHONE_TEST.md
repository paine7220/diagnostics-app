# Dexcom on iPhone (Kathy’s Health)

1. Open the live HTTPS link in **Safari** (not Chrome).
2. Share → **Add to Home Screen**.
3. In the **Dexcom** app: turn **Share On** (followers optional — Share itself must be enabled).
4. Open Kathy’s Health → **Today**.
5. Enter the same Dexcom username/password → tap **Connect Dexcom**.
6. A live mg/dL reading appears. Errors stay on the form until fixed.

The phone-test server proxies Dexcom Share at `POST /dexcom/latest` on the same origin.
