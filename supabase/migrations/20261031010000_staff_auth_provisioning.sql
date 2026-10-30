-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بدمسنا
-- Migration: 20261031010000_staff_auth_provisioning.sql
-- Purpose: Staff Auth Policies & Profile Verification Helper (Security Hardened)
-- ========================================================================
--
-- CRITICAL SECURITY HARDENING APPLIED:
-- 1. `provision_staff_member` is REVOKED from PUBLIC, anon, and authenticated.
--    Granted ONLY to `service_role` (and runs as postgres in SQL Editor).
-- 2. Added internal role verification guard inside the function body as defense in depth.
-- 3. Required dependency definitions included safely (staff_role enum, get_current_staff_role).
-- 4. Reminded owner to disable public sign-ups in Supabase Auth dashboard.
-- ========================================================================

-- ------------------------------------------------------------------------
-- CRITICAL SECURITY REMINDER FOR PROJECT OWNER:
-- ------------------------------------------------------------------------
-- In Supabase Dashboard -> Authentication -> Providers (Email) / Auth Settings:
-- 1. YOU MUST DISABLE "Enable Email Signup" / "Allow new users to sign up".
--    Public self-registration for staff accounts must remain completely disabled.
-- 2. DISABLE "Confirm email" (email confirmation off) for internal staff accounts.
-- 3. Staff users in auth.users MUST be created with:
--    email = username@STAFF_AUTH_DOMAIN (default: username@hospital.internal).
-- 4. Staff accounts must ONLY be created by an administrator in Supabase Auth Dashboard.
-- ------------------------------------------------------------------------

-- 0. Ensure safe dependencies
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('ADMIN', 'RECEPTIONIST', 'DOCTOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Helper: Get current staff user role (Security Definer, Stable, safe search_path)
CREATE OR REPLACE FUNCTION public.get_current_staff_role()
RETURNS staff_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.staff_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- 1. Enable RLS on staff_profiles
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Revoke any direct public/anon access
REVOKE ALL ON public.staff_profiles FROM anon;
REVOKE ALL ON public.staff_profiles FROM PUBLIC;

-- 3. Staff can read their own profile (uses direct id match, prevents RLS recursion)
DROP POLICY IF EXISTS "Staff can read own profile" ON public.staff_profiles;
CREATE POLICY "Staff can read own profile"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 4. Admins can view all staff profiles
DROP POLICY IF EXISTS "Admins can view all staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can view all staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN');

-- 5. Admins can manage staff profiles
DROP POLICY IF EXISTS "Admins can manage staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can manage staff profiles"
  ON public.staff_profiles FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 6. Helper Function: Idempotent staff profile linkage
-- Can be called via Supabase SQL Editor (postgres) or backend service_role only
CREATE OR REPLACE FUNCTION public.provision_staff_member(
  p_user_id UUID,
  p_username TEXT,
  p_full_name TEXT,
  p_role staff_role,
  p_clinic_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defense in depth:
  -- Note: Inside a SECURITY DEFINER function, `current_user` is the function owner (postgres).
  -- To inspect the real invoking session/role, check `session_user` (for direct DB connections)
  -- and `auth.role()` (for Supabase PostgREST API connections).
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.role(), '') != 'service_role'
     AND COALESCE(public.get_current_staff_role(), 'RECEPTIONIST'::staff_role) != 'ADMIN' THEN
    RAISE EXCEPTION 'Access denied: Only administrators or service_role can provision staff members.';
  END IF;

  INSERT INTO public.staff_profiles (id, username, full_name, role, clinic_id, is_active)
  VALUES (p_user_id, p_username, p_full_name, p_role, p_clinic_id, true)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    clinic_id = EXCLUDED.clinic_id,
    is_active = true,
    updated_at = timezone('utc'::text, now());
END;
$$;

-- Strictly REVOKE execute privileges from anon and authenticated
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM authenticated;

-- GRANT execute privilege ONLY to service_role (SQL editor executes as postgres role directly)
GRANT EXECUTE ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) TO service_role;
