# SAC-POS

Offline-first mobile point of sale for **SACONE ERP**: Android, iOS and web, built with Expo SDK 57 and React Native.

Every product, price, GST rate, stock figure, customer, role and permission comes from SACONE. Every sale, return,
due collection and new customer goes back to it. Billing keeps working with no network, and the phone syncs
automatically when the connection returns.

## What it does

| Area | Features |
|------|----------|
| **Sell** | Search by name, SKU or barcode · camera barcode scan · qty stepper · cart · hold/resume bills |
| **Checkout** | Cash (with change), UPI, Card/Bank, Credit, or split payment · bill discount · CGST/SGST vs IGST by customer state |
| **Receipts** | 80 mm receipt · print (AirPrint / Android print) · share as PDF (WhatsApp etc.) |
| **Returns** | Partial or full return against a bill · pro-rata GST refund · reason required |
| **Customers** | Search · add with phone and GSTIN validation · credit limit and outstanding · collect dues |
| **Stock** | Live warehouse stock from the ERP, less unsynced sales · low and out-of-stock filters |
| **Day summary** | Bills, sales, cash/UPI/card/credit split, returns, GST, expected cash in drawer |
| **Sync** | Automatic every 60 s, on reconnect and on app resume · idempotent (no duplicates) · retry for items that need review |

## RBAC: roles and permissions come from the ERP

Staff sign in once with their **ERP email and password**, then set a personal 4–6 digit PIN for quick, offline unlock.
The app reads the user's ERP role permissions and hides or blocks features accordingly. Every action re-checks the
permission, and the server checks it again when the record syncs (`erp_user_id` attribution).

| App capability | ERP permission key |
|----------------|-------------------|
| Use the terminal (required to sign in) | `pos.terminal.view` |
| Sell | `pos.sales.create` |
| View bills | `pos.sales.view` |
| Returns | `pos.returns.create` |
| Change price and give discounts | `pos.pricing.edit` |
| View customers | `parties.customers.view` |
| Add customers | `parties.customers.create` |
| Collect dues | `parties.customer_receipts.create` |
| View stock | `inventory.stock.view` or `products.products.view` |
| Disconnect/re-pair the device | `pos.devices.edit` |

Change roles in **ERP → Administration → Roles and Permissions**. The phone picks them up on its next sync. A
deactivated user is locked out at the next sync.

Security:

- PINs are salted SHA-256 hashes stored on the phone; they are never sent anywhere.
- 5 wrong PINs require the ERP password.
- Offline unlock is allowed for 7 days after the last online check.
- The device key is kept in the secure keystore.

## Validations (same rules as the server)

- **Customers:** name, a 10-digit Indian mobile, GSTIN format and state code, email, and no duplicate phone or GSTIN.
- **Lines:** quantity above 0 and within limits, no negative price, discount between 0 and the line value, and price changes only with permission.
- **Stock:** can't sell more than is available, counting bills not yet synced, unless the ERP allows negative stock.
- **Payments:** payments must equal the bill total. Credit needs a customer and is checked against the credit limit.
- **Returns:** can't return more than was sold minus what was already returned.
- **Collections:** amount above zero, with a warning if it exceeds the outstanding balance.
- **Tax:** GST is calculated with the **same algorithm as sacone-api**; a unit test compares 300 random carts against the server.

## Run it

### 1. Start SACONE (on your PC)

```bash
cd sacone
npm run install:all
npm run db:setup
npm run dev          # API :4000 (listens on the LAN) + ERP :3000
```

Or double-click `start-all.bat`, which also starts SAC-POS.

### 2. Register the phone in the ERP

ERP → **Operations → POS Devices & Sync → Register device**. Pick the warehouse, then copy the **server URL** and
the **device key** (`sk_live_…`, shown once).

Use your PC's **LAN IP** in the URL, e.g. `http://192.168.1.10:4000`, not `localhost`. You can find it with
`ipconfig` (Windows). The phone and PC must be on the same Wi-Fi, and Windows Firewall must allow Node on port 4000.

### 3. Start the app

```bash
cd sacone/sac-pos
npm install
npx expo start       # scan the QR code with the Expo Go app (Android / iOS)
```

- `npm run web` runs it in a browser.
- `npm run android` runs it on an emulator or USB device.

On the phone: **Connect** (URL + key), then **Sign in** (ERP email and password), then **Set PIN**, then **Sell**.

Default ERP login: `admin@sacone.local` / `Admin@123` (the password is case-sensitive). For counter staff, create a user with the Cashier role in **ERP → Administration → Users**, then sign in with that user on the phone.

### 4. Install as a real app (APK)

```bash
npm run build:apk    # EAS cloud build, "preview" profile → downloadable .apk
```

The first run asks you to log in to a free Expo account. Production Play Store bundle: `npx eas-cli build -p android --profile production`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Expo dev server (QR for Expo Go) |
| `npm run android` / `ios` / `web` | Open on a platform |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Domain tests: tax parity with the server, validations, RBAC, payloads |
| `npm run export:web` | Static web build in `dist/` |
| `npm run build:apk` | Android APK via EAS |

## Structure

```
sac-pos/
├── src/app/              # screens (expo-router): setup, login, set-pin, (tabs)/sell|sales|customers|stock|more,
│                         #   cart, checkout, sale/[id], return/[id], customer/*, scan
├── src/domain/           # pure logic: types, money, tax (mirrors server), permissions, validation, payloads
├── src/services/pos.ts   # use-cases: completeSale, createReturn, createCustomer, collectPayment, daySummary
├── src/store/            # zustand + AsyncStorage: device, session, catalog, ledger, cart
├── src/sync/engine.ts    # push → pull cycle, cursors, local→ERP customer remap
├── src/api/              # typed SACONE client (/api/auth, /api/v1/sync)
├── src/ui/               # design system components, PIN pad, dialogs
└── tests/                # vitest
```

Screens depend on services and stores, services depend on the domain layer, and the domain layer has no dependencies.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Can't reach the server" | Use the LAN IP rather than localhost, keep the phone on the same Wi-Fi, and allow port 4000 in the firewall |
| `DEVICE_MISMATCH` | The key is already bound to another phone or install: ERP → device → **Rotate key** |
| "Not allowed to use the POS" | Give the role `pos.terminal.view` in ERP → Roles and Permissions |
| A bill shows "Needs review" | Fix it in ERP → POS Devices & Sync → **Sync inbox** → Retry, or tap *Send again* in More |
