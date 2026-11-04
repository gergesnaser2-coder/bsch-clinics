-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Script: provision_initial_staff.sql
-- Purpose: Create the REAL initial client accounts (Admin + Receptionist)
--          linked to public.staff_profiles via the provision_staff_member RPC.
-- ========================================================================
--
-- ⚠️  HOW TO USE (Run ONCE in Supabase Dashboard → SQL Editor):
--   1. REPLACE the two password placeholders below with strong initial
--      passwords chosen by the hospital management.
--   2. Execute this whole script as the `postgres` role (SQL Editor).
--   3. Deliver each initial password to its owner over a secure channel.
--   4. Ask each user to change it immediately after first login using the
--      "تغيير كلمة المرور" button in the staff dashboard.
--
-- ⚠️  PREREQUISITES:
--   - Migration 20261031010000_staff_auth_provisioning.sql applied
--     (defines staff_role enum + provision_staff_member RPC).
--   - Public self-signup DISABLED in Authentication → Providers (Email).
--   - Email confirmation DISABLED (internal accounts only).
--   - .env STAFF_AUTH_DOMAIN matches the email domain used below
--     (default: hospital.internal).
--
-- The script is IDEMPOTENT: user UUIDs are derived deterministically from
-- the email address, so re-running updates passwords/meta without creating
-- duplicates. Identities are inserted with ON CONFLICT DO NOTHING.
-- ========================================================================

-- Ensure the hashing extension used by GoTrue (bcrypt) is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_admin_email        TEXT := 'admin@hospital.internal';
  v_reception_email    TEXT := 'reception@hospital.internal';

  -- Deterministic UUIDs => safe re-runs (same user row every time)
  v_admin_uid          UUID := md5(v_admin_email || 'bsch-staff-v1')::uuid;
  v_reception_uid      UUID := md5(v_reception_email || 'bsch-staff-v1')::uuid;

  -- ⚠️  REPLACE THESE TWO PLACEHOLDERS WITH STRONG INITIAL PASSWORDS ⚠️
  v_admin_password     TEXT := 'CHANGE_ME_ADMIN_2026!';
  v_reception_password TEXT := 'CHANGE_ME_RECEPTION_2026!';
BEGIN
  ----------------------------------------------------------------------
  -- 1. Admin account (مدير النظام)
  ----------------------------------------------------------------------
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_admin_uid,
    'authenticated',
    'authenticated',
    v_admin_email,
    crypt(v_admin_password, gen_salt('bf')),
    timezone('utc'::text, now()),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', 'admin'),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  ),
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_reception_uid,
    'authenticated',
    'authenticated',
    v_reception_email,
    crypt(v_reception_password, gen_salt('bf')),
    timezone('utc'::text, now()),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', 'reception'),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password   = EXCLUDED.encrypted_password,
    email_confirmed_at   = EXCLUDED.email_confirmed_at,
    raw_app_meta_data    = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data   = EXCLUDED.raw_user_meta_data,
    updated_at           = timezone('utc'::text, now());

  ----------------------------------------------------------------------
  -- 2. Email identity rows (required by GoTrue for signInWithPassword)
  ----------------------------------------------------------------------
  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES
    (
      v_admin_email,
      v_admin_uid,
      jsonb_build_object('sub', v_admin_uid::text, 'email', v_admin_email),
      'email',
      timezone('utc'::text, now()),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    ),
    (
      v_reception_email,
      v_reception_uid,
      jsonb_build_object('sub', v_reception_uid::text, 'email', v_reception_email),
      'email',
      timezone('utc'::text, now()),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  ----------------------------------------------------------------------
  -- 3. Link staff_profiles via the existing hardened RPC
  --    (SECURITY DEFINER — executes as postgres in SQL Editor)
  ----------------------------------------------------------------------
  PERFORM public.provision_staff_member(
    v_admin_uid,
    'admin',
    'إدارة نظم المعلومات والعيادات الخارجية',
    'ADMIN',
    NULL
  );

  PERFORM public.provision_staff_member(
    v_reception_uid,
    'reception',
    'موظف الاستقبال والحجز',
    'RECEPTIONIST',
    NULL  -- Receptionist manages all clinics
  );

  RAISE NOTICE '✅ Initial staff accounts provisioned: admin@hospital.internal (ADMIN), reception@hospital.internal (RECEPTIONIST)';
END $$;

-- ------------------------------------------------------------------------
-- Verification query (run after the block):
-- Both rows must exist with is_active = true.
-- ------------------------------------------------------------------------
SELECT
  u.email,
  sp.username,
  sp.full_name,
  sp.role,
  sp.clinic_id,
  sp.is_active,
  u.created_at
FROM auth.users u
JOIN public.staff_profiles sp ON sp.id = u.id
WHERE u.email IN ('admin@hospital.internal', 'reception@hospital.internal')
ORDER BY sp.role DESC;
