# MongoDB repositories (stubs)

Phase 11: JSON → Mongo **importer** is implemented (`src/migration/importer.js`).
Runtime ERP still uses SQLite repositories.

These stub classes throw `MONGODB_NOT_IMPLEMENTED` for live CRUD.

When implementing cutover:

1. Honor method contracts in `../contracts.js`
2. Preserve string UUIDs as `_id` + `id` (see `../../migration/mapping.js`)
3. Wire via `createRepositories('mongodb')` only after verification
4. Keep `DATABASE_DRIVER=sqlite` until that work is complete

Importer (write path) uses the official `mongodb` driver directly — it does not require these stubs.
