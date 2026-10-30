-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بدمسنا
-- Migration: 20261031010000_staff_auth_provisioning.sql
-- Purpose: Staff Auth Policies & Profile Verification Helper
-- ========================================================================
--
-- This migration ensures that:
-- 1. `public.staff_profiles` RLS policies strictly allow staff to read their own profile,
--    and only administrators can view and modify all staff profiles.
-- 2. Provides an idempotent function to link or upsert staff profiles whenever
--    auth.users records are created via Supabase Auth Dashboard or API.
-- 3. Grants appropriate permissions to authenticated and service_role.
-- ========================================================================

-- 1. Enable RLS on staff_profiles
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Staff can read their own profile
DROP POLICY IF EXISTS "Staff can read own profile" ON public.staff_profiles;
CREATE POLICY "Staff can read own profile"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 3. Admins can view all staff profiles
DROP POLICY IF EXISTS "Admins can view all staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can view all staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN');

-- 4. Admins can manage staff profiles
DROP POLICY IF EXISTS "Admins can manage staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can manage staff profiles"
  ON public.staff_profiles FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 5. Helper Function: Idempotent staff profile linkage
-- Can be called via Supabase SQL Editor to associate an existing auth.users record with staff_profiles
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

REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) TO authenticated, service_role;

