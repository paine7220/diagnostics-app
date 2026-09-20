# Kathy’s Health on iPhone

## Tap-ready (Safari)

**https://fallen-memorial-liable-armor.trycloudflare.com/**

1. Tap **Share** → **Add to Home Screen** → **Add**
2. Connect Dexcom (below)
3. Add family phones in Settings for low-sugar alerts

## Connect Dexcom app on this iPhone

1. Open **Dexcom** → **Share** → Sharing **On**
2. On **Today**, enter the same Dexcom username/password → **Connect Dexcom**
3. Live sugar should appear; lows start the family check-in

Full checklist: `DEXCOM_IPHONE_TEST.md`

## Optional App Store / Xcode shell

```bash
cd kathy-health/ios
npm install
npm run sync
npx cap add ios   # first time only
npm run open
```

Bundle ID placeholder: `com.michaelpaine.kathyhealth`.
