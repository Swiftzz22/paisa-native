# paisa. — iOS app

The native iOS client for **paisa.**, a personal expense tracker built for Indian banking. Live on the Apple App Store. The backend and web app live in [`paisa`](https://github.com/Swiftzz22/paisa).

Built with **Expo (SDK 54) / React Native 0.81 / TypeScript**, developed on Windows and built in the cloud with EAS.

## Features
- **Sign in with Apple or Google.** Apple sign-in uses a **server-issued nonce** so an identity token can't be replayed; Apple IDs are linked to an existing account only from inside a signed-in session, never matched by email.
- **Face ID / Touch ID lock** with device-passcode fallback, distinguishing cancel, lockout, denied permission and failed scan.
- **Dashboard, transactions, budgets, monthly trends** and custom date ranges.
- **Statement import** (CSV, spreadsheet, PDF) and **email-forwarding setup** on the phone.
- **"Ask paisa."** — plain-English questions about your spending.
- **Explicit AI consent** before any data reaches a third-party model (App Review Guideline 5.1.2(i)); manual entry works without it.
- **paisa. plus** subscriptions via RevenueCat. Entitlements are written server-side by RevenueCat's webhook, so the client can open the purchase sheet but can't grant access.

## Architecture
- Thin client over the paisa. REST API; bearer token kept in **`expo-secure-store`** (iOS Keychain).
- Server returns `401` (re-auth) and `402` (show paywall) as distinct, typed errors.
- **OTA updates** with EAS Update; the `fingerprint` runtime policy blocks an OTA from reaching a build whose native layer doesn't match.

## Development
```bash
npm install
npx expo start            # dev
npm run build:prod        # EAS cloud build for iOS
npm run submit            # upload to App Store Connect / TestFlight
npm run ota               # ship a JS-only change
```
Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` for subscriptions. See [`TESTFLIGHT.md`](TESTFLIGHT.md) for the full shipping guide.
