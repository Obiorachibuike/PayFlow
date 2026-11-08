# Screenshots

PayFlow is developed in a headless sandbox, so **captured device screenshots are not
committed**. This folder explains how to produce them and where to put them so the
README gallery works.

## What to capture

Save PNGs into this folder with these exact names (the README references them):

| File | Screen | How to get there |
| --- | --- | --- |
| `home-dark.png` | Home, dark theme | Sign in → Home |
| `home-light.png` | Home, light theme | Profile → Settings → Light |
| `transactions.png` | Transactions list with filters | Transactions tab |
| `send-money.png` | Send money amount step | Home → Send → recipient resolved |
| `pin-entry.png` | PIN pad | Send money → Continue |
| `add-money.png` | Funding with the demo channel | Home → Add money |
| `withdraw.png` | Withdrawal destination step | Home → Withdraw |
| `receipt.png` | Transaction detail with share button | Transactions → any row |
| `activity.png` | Notification feed | Activity tab |
| `profile.png` | Profile overview | Profile tab |
| `security.png` | Security settings | Profile → Security |
| `ledger.png` | Ledger entries | Profile → Ledger entries |
| `cards.png` | Demo-only cards tab | Cards tab |

## How to capture

**Web (fastest):**

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npm run web
```

Open the printed URL in a desktop browser, set the window to roughly 390 × 844
(device toolbar), sign in with a demo account and screenshot each screen.

**Android emulator / device:**

```bash
cd mobile && npm start          # press "a" to open on Android
adb exec-out screencap -p > docs/screenshots/home-dark.png
```

**iOS simulator:** `npm start`, press `i`, then `Cmd + S` saves a screenshot to the
desktop.

## Frame them (optional)

`docs/screenshots/framed/` is a good place for device-mockup versions. Keep the raw
captures at the top level so the gallery stays honest — do not substitute rendered
mock-ups for real captures.
