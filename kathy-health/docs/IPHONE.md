# Kathy’s Health on iPhone

## Tap-ready (Safari)

Open this link on the iPhone in **Safari**:

**https://guitars-nothing-saskatchewan-yang.trycloudflare.com/**

1. Tap **Share** → **Add to Home Screen** → **Add**
2. Open **Kathy’s Health** from the home screen
3. **Settings** → add family phone numbers + alert webhook for low-sugar texts

This link stays up while the cloud agent is running. For a permanent URL after merge, host `kathy-health/web/` on Cloudflare or GitHub Pages (or use `/kathy/` on the main Workers site once published).

## Optional App Store / Xcode shell

On a Mac with Xcode and an Apple Developer account:

```bash
cd kathy-health/ios
npm install
npm run sync
npx cap add ios   # first time only
npm run open
```

Bundle ID placeholder: `com.michaelpaine.kathyhealth`.
