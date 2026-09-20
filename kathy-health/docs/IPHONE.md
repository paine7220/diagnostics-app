# Kathy’s Health on iPhone

## Fastest (Safari)

1. Open `kathy-health/web/` in Safari on the iPhone (hosted URL or Mac file share).
2. Tap **Share → Add to Home Screen**.
3. Open **Kathy’s Health** from the home screen (standalone, offline-capable after first load).

## Optional App Store / Xcode shell

On a Mac with Xcode and an Apple Developer account:

```bash
cd kathy-health/ios
npm install
npm run sync
npx cap add ios   # first time only
npm run open
```

In Xcode: set your team under Signing, then Archive.

Bundle ID placeholder: `com.michaelpaine.kathyhealth`.
