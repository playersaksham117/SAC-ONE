# BillEase Suite

Business software for Indian distributors and retailers. Three apps, one API:

- **SACONE ERP** (web): back-office operations
- **SACONE Owner** (web): CEO Dashboard and Income & Expense, kept apart from day-to-day staff
- **SAC-POS** (mobile): all POS billing, synced with the ERP

## ▶ Start

Double-click **`start-suite.bat`** and pick an option:

| # | App | What starts | Address / login |
|---|-----|-------------|-----------------|
| 1 | **SACONE** | API (:4000 on the LAN) + ERP web app + Owner web app | ERP http://localhost:3000 · Owner http://localhost:3001 · `admin@sacone.local` / `Admin@123` |
| 2 | **SAC-POS** | Expo dev server (scan the QR code with **Expo Go** on the phone) | ERP login, then a personal PIN |
| 3 | **Everything** | Both | |

Requirements: Node 20+ and the Expo Go app on the phone, which must be on the same Wi-Fi as the PC. The launcher
installs missing npm packages on first run and prints the PC's LAN URL to enter in SAC-POS.

## 📁 Structure

```
BillEase Suite/
├── start-suite.bat          # launcher menu
└── sacone/                  # ★ the platform: see sacone/README.md and sacone/ARCHITECTURE.md
    ├── sacone-api/          #   Express + SQLite API (:4000), POS device sync /api/v1/sync
    ├── sacone-erp/          #   Next.js ERP web app (:3000), responsive from phone to desktop
    ├── sacone-owner/        #   SACONE Owner web app (:3001): CEO Dashboard + Income & Expense
    ├── sac-pos/             #   SAC-POS: Expo / React Native mobile POS (Android · iOS · web)
    └── start-all.bat        #   starts API + ERP + SAC-POS
```

## How it fits together

```
 SAC-POS (phone, offline-first)
    │  pull: products · prices · GST · stock · customers · staff roles and permissions
    │  push: sales · returns · due collections · new customers   (idempotent)
    ▼
 sacone-api  /api/v1/sync  (device key)   ◄──  sacone-erp    /api/*  (user session, RBAC)
                                          ◄──  sacone-owner  /api/*  (same login; CEO + finance permissions)
```

## Removed

These legacy apps were replaced by SAC-POS and SACONE and are no longer part of the suite:

- `sacone/billease pos/` (Flutter POS)
- `desktop-apps/` (GST Billing / Accounts+)
- `mobile-apps/` (SpendSight)
- `database/migrations/` (pre-SACONE SQL)
- `docs/app-handbook/` (outdated)

## Run individually

```bash
# from the suite root
npm run install:all && npm run db:setup && npm run dev   # SACONE API + ERP
npm run dev:owner                                        # Owner app only
npm run dev:pos                                          # SAC-POS (Expo)
```

## License

Proprietary. All rights reserved.
