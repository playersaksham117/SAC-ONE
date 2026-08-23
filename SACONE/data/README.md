# SACONE data pipeline — SQLite master → JSON → MongoDB

## Goal

1. **Everything** lands in one SQLite file: `data/sacone.sqlite`
2. Export that file to JSON: `exports/sacone-sqlite.json`
3. Push the JSON to your **MongoDB cluster** (one collection per table)

```
Prisma (sacone-api/prisma)  ─┐
ERP API (pg-mem / live)     ─┼─►  data/sacone.sqlite  ─►  exports/sacone-sqlite.json  ─►  MongoDB
ERP SQLite schema           ─┘
```

## Setup

Add to `sacone-api/.env`:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net
MONGODB_DB=sacone
DATABASE_URL="file:./prisma/dev.db"
```

## Commands

```bash
npm run db:sqlite
npm run db:sqlite:json
npm run db:mongo:push
# or all:
npm run db:sync:mongo
```
