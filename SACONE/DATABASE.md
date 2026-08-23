# SACONE Master Database

## Ownership

- **Backend / Prisma / ERP SQL engine:** `sacone-api/`
- **Frontends:** `SACHIN ELECTRICALS/` (Control Center + `erp/`)

This repo does not host a public webstore. Keep webstore API key config in Control Center Settings.

## Local pipeline: SQLite → JSON → MongoDB

```bash
npm run db:sync:mongo
```

Prisma DB file: `sacone-api/prisma/dev.db`
