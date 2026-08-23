# SACONE Platform

**GitHub:** [github.com/playersaksham117/sacone](https://github.com/playersaksham117/sacone)  
*(repository renamed from `tracinvent`)*

**Ownership**

| Layer | Location |
|-------|----------|
| **Frontend** | `SACHIN ELECTRICALS/` (Control Center + ERP UI) |
| **Backend** | `sacone-api/` (Express API, Prisma, ERP server) |
| **Desktop (optional)** | `sacone-desktop/` (Flutter app, renamed from TracInvent) |

This repo is **SACONE ERP + CEO Dashboard**. There is no public webstore app here. An external webstore can connect with the API key from Control Center Settings (`GET /api/v1/webstore/inventory`).

```
sacone-api (:4000)                    ← ALL backend
SACHIN ELECTRICALS/
  ├── Control Center Next :3000       ← admin UI (ERP + CEO modules)
  └── erp/ (Vite :5173, /erp)         ← ERP UI + CEO Dashboard
```

## Run

```bash
npm run install:all
npm run db:setup --prefix sacone-api
npm run dev
```

| URL | App |
|-----|-----|
| http://localhost:3000/admin | SACONE Control Center (ERP + CEO modules) |
| http://localhost:3000/erp | ERP |
| http://localhost:3000/erp/ceo-dashboard | CEO Dashboard (linked ERP data) |
| http://localhost:4000 | API |
