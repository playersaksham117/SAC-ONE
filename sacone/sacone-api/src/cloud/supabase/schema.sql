-- SACONE RBAC + user profiles for Supabase.
-- Applied automatically by `npm run cloud:export -- --supabase` (idempotent; safe to re-run).
-- Columns mirror sacone-api/src/database/migrations/001_core_rbac.sql (sort_order is numeric:
-- SQLite keeps fractional orders such as 9.5). Passwords live in
-- auth.users (bcrypt hashes are imported as-is), so nobody has to reset a password.

create table if not exists public.modules (
  id uuid primary key,
  code text not null unique,
  name text not null,
  sort_order numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.features (
  id uuid primary key,
  module_id uuid not null references public.modules(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (module_id, code)
);

create table if not exists public.permissions (
  id uuid primary key,
  module_id uuid not null references public.modules(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'approve')),
  permission_key text not null unique,
  created_at timestamptz not null,
  unique (feature_id, action)
);

create table if not exists public.roles (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text
);

create table if not exists public.role_permissions (
  id uuid primary key,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null,
  unique (role_id, permission_id)
);

-- One row per SACONE user; id = auth.users.id (the SACONE user UUID is preserved).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  role_id uuid not null references public.roles(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text
);

create index if not exists idx_profiles_role_id on public.profiles(role_id);
create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);

-- ── Permission helpers (use in RLS policies and from the apps) ─────────────────────────

create or replace function public.current_user_permissions()
returns setof text
language sql stable security definer
set search_path = public
as $$
  select p.permission_key
  from public.profiles pr
  join public.roles r on r.id = pr.role_id and r.is_active
  join public.role_permissions rp on rp.role_id = pr.role_id
  join public.permissions p on p.id = rp.permission_id
  where pr.id = auth.uid() and pr.is_active
$$;

create or replace function public.has_permission(permission text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.current_user_permissions() k where k = permission)
$$;

-- ── Row level security: signed-in users read, only the service role writes ────────────

alter table public.modules enable row level security;
alter table public.features enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "sacone: signed-in read" on public.modules;
create policy "sacone: signed-in read" on public.modules for select to authenticated using (true);
drop policy if exists "sacone: signed-in read" on public.features;
create policy "sacone: signed-in read" on public.features for select to authenticated using (true);
drop policy if exists "sacone: signed-in read" on public.permissions;
create policy "sacone: signed-in read" on public.permissions for select to authenticated using (true);
drop policy if exists "sacone: signed-in read" on public.roles;
create policy "sacone: signed-in read" on public.roles for select to authenticated using (true);
drop policy if exists "sacone: signed-in read" on public.role_permissions;
create policy "sacone: signed-in read" on public.role_permissions for select to authenticated using (true);

drop policy if exists "sacone: own profile or user admin" on public.profiles;
create policy "sacone: own profile or user admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('core.users.view'));

-- ── Optional: put the SACONE role in every JWT ─────────────────────────────────────────
-- Enable in Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- → public.custom_access_token_hook. Adds claims sacone_role (slug) and sacone_role_id.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  claims jsonb := event->'claims';
  role_row record;
begin
  select r.id, r.slug into role_row
  from public.profiles pr
  join public.roles r on r.id = pr.role_id
  where pr.id = (event->>'user_id')::uuid and pr.is_active;

  if found then
    claims := jsonb_set(claims, '{sacone_role}', to_jsonb(role_row.slug));
    claims := jsonb_set(claims, '{sacone_role_id}', to_jsonb(role_row.id::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant select on public.profiles, public.roles to supabase_auth_admin;
    revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

    drop policy if exists "sacone: auth hook reads profiles" on public.profiles;
    create policy "sacone: auth hook reads profiles" on public.profiles for select to supabase_auth_admin using (true);
    drop policy if exists "sacone: auth hook reads roles" on public.roles;
    create policy "sacone: auth hook reads roles" on public.roles for select to supabase_auth_admin using (true);
  end if;
end;
$$;
