# Shipping paisa to your iPhone (TestFlight)

Everything below runs on Windows. No Mac needed — EAS builds on Apple hardware in the cloud.

## Cost
- Apple Developer Program: **$99/yr** (mandatory, covers TestFlight *and* App Store)
- EAS Build free tier: ~30 builds/month, shared queue (10–30 min wait at busy times)
- EAS Update (OTA): free — used for almost every change

## One-time setup (in order)

1. **Enrol in the Apple Developer Program** — https://developer.apple.com/programs
   Individual enrolment, 18+, ~₹9,000–10,000. Takes 24–48h to activate.
2. **Fill in the submit config** — after enrolling, get your numbers from
   App Store Connect and add them to `eas.json` → `submit.production.ios`:
   - `ascAppId` — App Store Connect → your app → App Information → Apple ID (a number)
   - `appleTeamId` — developer.apple.com → Membership details
   (`appleId` is already set to sania.kothari@gmail.com)
3. **Create the app record** in App Store Connect with bundle id
   `com.saniakothari.paisa` (must match `app.json`). Or let `eas submit` create it.

## First build

```bash
npm run build:prod
```

EAS will ask to generate a Distribution Certificate and Provisioning Profile —
say **yes** to both, it manages them for you (stored on Expo's servers, not your machine).
You'll sign in with your Apple ID once.

Then:

```bash
npm run submit
```

That uploads the finished build to TestFlight. Processing takes ~10–20 min, then
install TestFlight on the iPhone and the build appears. Internal testing (up to 100
people, including you) needs **no App Review**.

## Shipping changes after that

- **JS-only change** (screens, logic, styling, bug fixes) — no rebuild:
  ```bash
  npm run ota
  ```
  Users get it on next app launch. Doesn't consume a build credit.
- **Native change** (new native module, icon, SDK bump, anything in `app.json`
  `plugins`) — needs a rebuild: `npm run build:prod && npm run submit`.

The `fingerprint` runtime version policy means EAS refuses to push an OTA update
to a build whose native layer doesn't match — that's what stops OTA from bricking
the app after a native change.

## Still open before an *App Store* (public) release
Not needed for TestFlight:
- Sign in with Apple (required because Google sign-in is offered)
- In-app account deletion
- Public privacy policy URL
- Google OAuth verification for the `gmail.readonly` scope (the real blocker)

## Known gaps in the current build config
- **No custom splash screen.** `assets/splash-icon.png` exists but `expo-splash-screen`
  isn't installed, so a built app shows a plain `#0a0a0a` screen at launch.
  To fix: `npx expo install expo-splash-screen`, then add to `app.json` plugins:
  `["expo-splash-screen", { "image": "./assets/splash-icon.png", "resizeMode": "contain", "backgroundColor": "#0a0a0a", "imageWidth": 200 }]`
  (deliberately deferred — installing a package mid-debug would disturb Metro)
- `version` in `app.json` is now cosmetic: `appVersionSource: "remote"` means EAS
  owns the build number and auto-increments it.
