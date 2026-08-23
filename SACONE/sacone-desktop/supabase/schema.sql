-- ============================================================
-- TracInvent — Complete Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Prerequisites
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: profiles (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT        NOT NULL,
  email               TEXT        NOT NULL UNIQUE,
  mobile_number       TEXT,
  company_name        TEXT,
  country             TEXT        NOT NULL DEFAULT 'IN',
  registration_date   TIMESTAMPTZ DEFAULT NOW(),
  last_login          TIMESTAMPTZ,
  license_status      TEXT        NOT NULL DEFAULT 'inactive'
                        CHECK (license_status IN ('inactive','trial','active','expired','suspended')),
  license_type        TEXT        NOT NULL DEFAULT 'free'
                        CHECK (license_type IN ('free','basic','pro','lifetime')),
  device_count        INTEGER     NOT NULL DEFAULT 0,
  subscription_expiry TIMESTAMPTZ,
  security_pin_hash   TEXT        NOT NULL,   -- bcrypt hash of 6-digit PIN
  is_admin            BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: licenses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licenses (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_key         TEXT        NOT NULL UNIQUE,  -- plain key shown to user once
  license_key_hash    TEXT        NOT NULL UNIQUE,  -- SHA-256 for lookups
  user_id             UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  license_type        TEXT        NOT NULL
                        CHECK (license_type IN ('free','basic','pro','lifetime')),
  purchase_date       TIMESTAMPTZ DEFAULT NOW(),
  expiry_date         TIMESTAMPTZ,                  -- NULL = lifetime
  activation_limit    INTEGER     NOT NULL DEFAULT 1,
  active_device_count INTEGER     NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'unactivated'
                        CHECK (status IN ('unactivated','active','expired','revoked','suspended')),
  notes               TEXT,
  created_by_admin    UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: devices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devices (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name         TEXT        NOT NULL,
  fingerprint_hash    TEXT        NOT NULL,         -- SHA-256 of hardware composite
  machine_guid        TEXT,                         -- stored for admin reference
  os_version          TEXT,
  app_version         TEXT        NOT NULL,
  activation_date     TIMESTAMPTZ DEFAULT NOW(),
  last_seen           TIMESTAMPTZ DEFAULT NOW(),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  deactivated_at      TIMESTAMPTZ,
  deactivated_reason  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, fingerprint_hash)
);

-- ============================================================
-- TABLE: activations  (license ↔ device binding)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activations (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id          UUID        NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  device_id           UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activated_at        TIMESTAMPTZ DEFAULT NOW(),
  last_validated      TIMESTAMPTZ DEFAULT NOW(),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  deactivated_at      TIMESTAMPTZ,
  deactivated_reason  TEXT,
  UNIQUE (license_id, device_id)
);

-- ============================================================
-- TABLE: subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_id          UUID        REFERENCES public.licenses(id),
  plan                TEXT        NOT NULL
                        CHECK (plan IN ('free','basic','pro','lifetime')),
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  payment_reference   TEXT,
  amount_paid         DECIMAL(10,2),
  currency            TEXT        DEFAULT 'INR',
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','expired','cancelled','refunded')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id           UUID        REFERENCES public.devices(id) ON DELETE SET NULL,
  action              TEXT        NOT NULL,
  details             JSONB,
  ip_address          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email            ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_licenses_key_hash         ON public.licenses(license_key_hash);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id          ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id           ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint       ON public.devices(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_activations_license       ON public.activations(license_id);
CREATE INDEX IF NOT EXISTS idx_activations_device        ON public.activations(device_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user           ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created        ON public.audit_logs(created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile after Supabase email signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile is created explicitly by the app after email verification.
  -- This trigger only logs the signup event.
  INSERT INTO public.audit_logs(user_id, action, details)
  VALUES (NEW.id, 'user_signed_up', jsonb_build_object('email', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs  ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
CREATE POLICY "profiles: owner can read own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: owner can update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_admin = (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "profiles: insert own on signup"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: admin full access"
  ON public.profiles FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ---------- licenses ----------
CREATE POLICY "licenses: owner can read own"
  ON public.licenses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "licenses: admin full access"
  ON public.licenses FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ---------- devices ----------
CREATE POLICY "devices: owner can read own"
  ON public.devices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "devices: owner can insert own"
  ON public.devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "devices: owner can update own last_seen"
  ON public.devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "devices: admin full access"
  ON public.devices FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ---------- activations ----------
CREATE POLICY "activations: owner can read own"
  ON public.activations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "activations: admin full access"
  ON public.activations FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ---------- subscriptions ----------
CREATE POLICY "subscriptions: owner can read own"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "subscriptions: admin full access"
  ON public.subscriptions FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ---------- audit_logs ----------
-- Users cannot read audit_logs; only admin and service role can.
CREATE POLICY "audit_logs: admin only"
  ON public.audit_logs FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = TRUE);

-- ============================================================
-- HELPER FUNCTIONS (called via RPC from Python backend)
-- ============================================================

-- Validate & activate a license key for a device fingerprint
-- Called by Python backend using service role — bypasses RLS
CREATE OR REPLACE FUNCTION public.activate_license(
  p_license_key_hash  TEXT,
  p_user_id           UUID,
  p_device_id         UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_license   public.licenses%ROWTYPE;
  v_already   BOOLEAN;
BEGIN
  SELECT * INTO v_license
  FROM public.licenses
  WHERE license_key_hash = p_license_key_hash
    AND (user_id = p_user_id OR user_id IS NULL)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'License key not found');
  END IF;

  IF v_license.status = 'revoked' OR v_license.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'License is ' || v_license.status);
  END IF;

  IF v_license.expiry_date IS NOT NULL AND v_license.expiry_date < NOW() THEN
    UPDATE public.licenses SET status = 'expired' WHERE id = v_license.id;
    RETURN jsonb_build_object('ok', false, 'error', 'License expired');
  END IF;

  -- Check if already activated on this device
  SELECT TRUE INTO v_already
  FROM public.activations
  WHERE license_id = v_license.id AND device_id = p_device_id AND is_active = TRUE;

  IF FOUND THEN
    -- Refresh last_validated
    UPDATE public.activations SET last_validated = NOW()
    WHERE license_id = v_license.id AND device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'status', 'already_active',
      'license_type', v_license.license_type,
      'expiry_date', v_license.expiry_date);
  END IF;

  -- Check activation limit
  IF v_license.active_device_count >= v_license.activation_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Activation limit reached');
  END IF;

  -- Bind license to user if not yet bound
  IF v_license.user_id IS NULL THEN
    UPDATE public.licenses SET user_id = p_user_id WHERE id = v_license.id;
  END IF;

  -- Create activation record
  INSERT INTO public.activations(license_id, device_id, user_id)
  VALUES (v_license.id, p_device_id, p_user_id)
  ON CONFLICT (license_id, device_id) DO UPDATE
    SET is_active = TRUE, deactivated_at = NULL, last_validated = NOW();

  -- Increment device count
  UPDATE public.licenses
  SET active_device_count = active_device_count + 1,
      status = 'active',
      user_id = p_user_id
  WHERE id = v_license.id;

  -- Update profile
  UPDATE public.profiles
  SET license_status = 'active',
      license_type   = v_license.license_type,
      device_count   = device_count + 1,
      subscription_expiry = v_license.expiry_date
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'status', 'activated',
    'license_type', v_license.license_type,
    'expiry_date', v_license.expiry_date);
END;
$$;

-- Validate existing activation (called on app startup)
CREATE OR REPLACE FUNCTION public.validate_activation(
  p_user_id           UUID,
  p_fingerprint_hash  TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_device    public.devices%ROWTYPE;
  v_act       public.activations%ROWTYPE;
  v_license   public.licenses%ROWTYPE;
BEGIN
  SELECT * INTO v_device
  FROM public.devices
  WHERE user_id = p_user_id AND fingerprint_hash = p_fingerprint_hash AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Device not registered');
  END IF;

  SELECT * INTO v_act
  FROM public.activations
  WHERE device_id = v_device.id AND user_id = p_user_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No active activation');
  END IF;

  SELECT * INTO v_license FROM public.licenses WHERE id = v_act.license_id;

  IF v_license.status IN ('revoked', 'suspended') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'License ' || v_license.status);
  END IF;

  IF v_license.expiry_date IS NOT NULL AND v_license.expiry_date < NOW() THEN
    UPDATE public.licenses SET status = 'expired' WHERE id = v_license.id;
    UPDATE public.profiles SET license_status = 'expired' WHERE id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'error', 'License expired');
  END IF;

  -- Update last_seen
  UPDATE public.devices     SET last_seen      = NOW() WHERE id = v_device.id;
  UPDATE public.activations SET last_validated = NOW() WHERE id = v_act.id;

  RETURN jsonb_build_object('ok', true,
    'license_type', v_license.license_type,
    'expiry_date',  v_license.expiry_date,
    'device_id',    v_device.id);
END;
$$;

-- ============================================================
-- SEED: create the first admin user (run once after first signup)
-- Replace 'YOUR_USER_UUID' with the actual Supabase auth.users ID
-- ============================================================
-- UPDATE public.profiles SET is_admin = TRUE WHERE id = 'YOUR_USER_UUID';
