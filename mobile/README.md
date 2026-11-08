# PayFlow mobile

Expo SDK 58 · React Native 0.88 · React 19 · TypeScript strict · React Navigation 7 ·
Redux Toolkit 2.

> **Demo only.** Every balance in the app is simulated or funded with Paystack test
> keys. Withdrawals are simulated, no cards are issued and no bank is contacted.

See the [root README](../README.md) for the product overview and [`docs/`](../docs)
for architecture and testing notes.

## Getting started

```bash
npm install

# Point the app at your API (defaults to http://localhost:4000)
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npm start     # Expo Go / device
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npm run web   # browser

npm run typecheck
npm test
```

On a physical device, `localhost` will not resolve — use your machine’s LAN address or
a tunnel (`EXPO_PUBLIC_API_BASE_URL=https://xxxx.ngrok-free.app npm start`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Metro dev server (QR for Expo Go) |
| `npm run android` / `ios` / `web` | Open on a device, simulator or browser |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | Jest + React Native Testing Library |

## Layout

```
src/
├── App.tsx              # Redux + safe area + theme + navigator
├── components/          # Button, TextField, AmountInput, PinPad, Card, Screen,
│                        # TransactionRow, BalanceHeader, QuickActions, Sheet, …
├── navigation/          # Root (auth/main switch), Auth stack, 5-tab navigator
├── screens/             # auth, home, transactions, cards, activity, profile,
│                        # wallet flows (fund/send/withdraw), beneficiaries
├── services/            # API client (envelope + single-flight refresh), secure
│                        # storage, device identity
├── store/               # slices: auth, wallet, transactions, beneficiaries,
│                        # notifications, profile, operations, settings
├── theme/               # palette, spacing, typography, ThemeProvider
└── utils/               # money (kobo), validation, formatting, ids
```

## Design system

| Token | Value |
| --- | --- |
| Primary | `#39FF14` |
| Dark background / surface | `#080B09` / `#111713` |
| Light background / surface | `#F7F9F7` / `#FFFFFF` |
| Text / muted | `#101510` / `#818B83` |
| Success / warning / error | `#22C55E` / `#F59E0B` / `#EF4444` |

No purple, violet or lavender appears anywhere in the app. Themes are
`SYSTEM | LIGHT | DARK`, resolved in `theme/ThemeProvider.tsx` and persisted to the
account through `PATCH /profile`.

## Money handling

* The store only ever holds **kobo** (`amountMinor`).
* `utils/money.ts` is the single conversion point: `parseNairaToMinor` for input,
  `formatNaira` / `formatSignedNaira` for display.
* The API client never decides whether money moved: it asks the server to verify a
  payment and renders whatever the server reports. A failed or pending payment is shown
  as failed or pending — never as successful.

## Security notes

* Access and refresh tokens live in `expo-secure-store` (Keychain/Keystore); the client
  refreshes them with a single in-flight request and signs out on `401`.
* The transaction PIN is captured in a local pad, sent over TLS and hashed with bcrypt
  server-side. It is never stored on the device.
* Biometrics are a convenience unlock only; the PIN is still required for every
  transfer and withdrawal.
* Push tokens are registered per device session. The app never holds a Paystack key.

## Building

```bash
npx eas build --profile preview --platform android   # APK
npx eas build --profile production --platform android # AAB
npx expo prebuild                                     # bare android/ + ios/
```

Android package: `com.payflow.app` (see `eas.json`).
