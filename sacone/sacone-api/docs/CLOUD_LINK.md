# Cloud link: MongoDB + Supabase without data loss

While SACONE runs as a **local server** (SQLite on this PC), nothing goes to the cloud.
When you are ready to link:

- **MongoDB** (Atlas or self-hosted) receives the business data: every table.
- **Supabase** receives authentication and RBAC: users (with their existing passwords), roles,
  permissions, modules and features.

The export is a server-side command. There is deliberately no export/import/migration button
in the ERP or Owner apps.

## 1. Configure `sacone-api/.env`

```ini
# MongoDB: business data
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=sacone
MONGODB_WRITE_ENABLED=true            # safety gate; set back to false afterwards if you like

# Supabase: auth + RBAC (Dashboard → Project Settings → API, and Connect → Session pooler)
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...         # service_role or sb_secret_… key. Server only, never a frontend.
SUPABASE_DB_URL=postgresql://postgres.YOUR-PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

`.env` is git-ignored. Never commit it.

## 2. Check, rehearse, export

```bash
cd sacone
npm run cloud:status                   # what is configured and reachable
npm run cloud:export -- --dry-run      # snapshot + checks, writes nothing
npm run cloud:export                   # export to every configured target, then verify
```

Useful options: `--mongo` or `--supabase` (one target only) and `--prune` (also delete Mongo
documents for rows you deleted locally since the last export).

The API can keep running and taking sales during the export.

## What "without data loss" means here

1. **Consistent snapshot.** The export copies the live database with SQLite's online backup API
   into `sacone-api/data/cloud-snapshots/<time>/` and reads only that copy. The local database is
   never modified. The last 10 snapshots are kept (git-ignored; they contain password hashes).
2. **Everything is copied.** All tables go to MongoDB: one collection per table, same column
   names, `_id` = the row's UUID. Two things are left out on purpose:
   - `sessions`: live login tokens. People sign in again after a cutover.
   - `users.password_hash`: it goes to Supabase Auth instead.
3. **Passwords keep working.** Each user is created in Supabase Auth with **the same UUID** and
   **the same bcrypt hash**, so nobody needs a password reset. Inactive users are banned.
4. **Nothing is silently dropped.** Every Supabase row is converted and validated before the
   first write. If a local table gains a column the Supabase schema doesn't have, the export
   stops and names the column.
5. **All or nothing for RBAC.** Roles, permissions, modules, features and role assignments are
   written in one Postgres transaction.
6. **Re-runnable.** Writes are upserts keyed by UUID, so running the export again brings the
   cloud up to date and fixes anything that drifted. Supabase Auth accounts are never deleted.
7. **Verified.** After writing, every document and row is read back and compared **field by field**
   with the snapshot. The command exits with an error if anything is missing or different, and
   writes a report to `cloud-snapshots/<time>/report.json`.

Re-check at any time (for example after someone edited data in the cloud by hand):

```bash
npm run cloud:verify
```

## What lands where

| SACONE (SQLite) | MongoDB | Supabase |
|---|---|---|
| every business table (products, stock ledger, sales, purchases, finance, HR, POS devices…) | collection of the same name | none |
| `users` | `users` (without `password_hash`) | `auth.users` (UUID + bcrypt hash) and `public.profiles` |
| `roles`, `permissions`, `role_permissions`, `modules`, `features` | same-name collections | same-name tables in `public` |
| `sessions` | skipped | skipped |

The Supabase schema (`src/cloud/supabase/schema.sql`) is applied automatically and is safe to
re-run. It enables row-level security (signed-in users can read the RBAC catalogue and their
own profile; only the service role writes) and adds:

- `public.has_permission('products.products.edit')`: use it in RLS policies and from the apps.
- `public.current_user_permissions()`: every permission key of the signed-in user.
- `public.custom_access_token_hook`: optional. Enable it under **Authentication → Hooks →
  Custom Access Token** to put `sacone_role` and `sacone_role_id` into every JWT.

## Cutting over

Exporting does not switch the running apps; they stay on SQLite (`DATABASE_DRIVER=sqlite`)
until you cut over. A cutover still needs the MongoDB repositories
(`src/repositories/mongodb/`, currently stubs) and Supabase sign-in in the apps. Until then,
export as often as you like: each run is incremental and verified.
