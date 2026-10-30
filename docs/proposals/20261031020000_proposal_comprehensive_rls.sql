-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- ARCHIVED PROPOSAL — DO NOT RUN IN AUTOMATED MIGRATIONS PIPELINE
-- Original Location: supabase/migrations/20261031020000_proposal_comprehensive_rls.sql
-- Relocated to: docs/proposals/20261031020000_proposal_comprehensive_rls.sql
-- ========================================================================
--
-- IMPORTANT SAFETY NOTE:
-- This is a PROPOSED migration for comprehensive Row Level Security (RLS) coverage
-- across all public tables in the BSCH Clinics database.
-- It is kept here for architectural documentation and peer review.
-- Do NOT execute this script in automated staging/production pipelines until
-- you have executed:
--   supabase/diagnostics/00_read_only_audit.sql
-- and reviewed the existing policies and table grants in your Supabase project.
--
-- ARCHITECTURAL BOUNDARIES:
-- 1. Browser / Anonymous Role (`anon`):
--    - Direct SELECT allowed ONLY on:
--      * active rows of `public.clinics` (is_active = true)
--      * open schedules of `public.clinic_schedules` (is_closed = false)
--      * published CMS tables: `website_settings`, `homepage_sections`, `navigation_items`, `media_assets`
--    - Direct read/write FORBIDDEN on:
--      * `appointments`, `appointment_status_history`, `audit_logs`, `staff_profiles`, `otp_verifications`
--    - ALL patient-facing booking, OTP generation, OTP verification, and tracking
--      go strictly through server Next.js API route handlers using the private service role.
--
-- 2. Authenticated Staff Role (`authenticated`):
--    - Can read own staff profile (`id = auth.uid()`).
--    - ADMIN can view and manage all tables.
--    - RECEPTIONIST can view all appointments and update status (except COMPLETED).
--    - DOCTOR can ONLY view and update appointments assigned to their own clinic (`clinic_id = doctor_clinic_id`).
--
-- 3. Background Services (`service_role`):
--    - Holds full bypass privileges to persist bookings, verify OTPs, and record audit logs.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Enable Row Level Security (RLS) on ALL Tables
-- ------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinic_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_assets ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------
-- 2. Revoke Direct Access from anon Role on Sensitive Tables
-- ------------------------------------------------------------------------
REVOKE ALL ON TABLE public.appointments FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.appointment_status_history FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.audit_logs FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.staff_profiles FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.otp_verifications FROM anon, authenticated, PUBLIC;

-- ------------------------------------------------------------------------
-- 3. Explicit Table Grants
-- ------------------------------------------------------------------------
-- Public / Read-Only Discovery
GRANT SELECT ON public.clinics TO anon, authenticated;
GRANT SELECT ON public.clinic_schedules TO anon, authenticated;
GRANT SELECT ON public.website_settings TO anon, authenticated;
GRANT SELECT ON public.homepage_sections TO anon, authenticated;
GRANT SELECT ON public.navigation_items TO anon, authenticated;
GRANT SELECT ON public.media_assets TO anon, authenticated;

-- Authenticated Staff Operations
GRANT SELECT, UPDATE ON public.appointments TO authenticated;
GRANT SELECT, INSERT ON public.appointment_status_history TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.staff_profiles TO authenticated;

-- Admin Full Access Grants
GRANT ALL ON public.clinics TO authenticated;
GRANT ALL ON public.clinic_schedules TO authenticated;
GRANT ALL ON public.website_settings TO authenticated;
GRANT ALL ON public.homepage_sections TO authenticated;
GRANT ALL ON public.navigation_items TO authenticated;
GRANT ALL ON public.media_assets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;

-- ------------------------------------------------------------------------
-- 4. Explicit RLS Policies
-- ------------------------------------------------------------------------

-- 4.1 Clinics
DROP POLICY IF EXISTS "Public can view active clinics" ON public.clinics;
CREATE POLICY "Public can view active clinics"
  ON public.clinics FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.get_current_staff_role() IS NOT NULL);

DROP POLICY IF EXISTS "Admin can manage clinics" ON public.clinics;
CREATE POLICY "Admin can manage clinics"
  ON public.clinics FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 4.2 Clinic Schedules
DROP POLICY IF EXISTS "Public can view schedules" ON public.clinic_schedules;
CREATE POLICY "Public can view schedules"
  ON public.clinic_schedules FOR SELECT
  TO anon, authenticated
  USING (is_closed = false OR public.get_current_staff_role() IS NOT NULL);

DROP POLICY IF EXISTS "Admin can manage clinic schedules" ON public.clinic_schedules;
CREATE POLICY "Admin can manage clinic schedules"
  ON public.clinic_schedules FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 4.3 Appointments (Strict Staff Access Only; Anonymous Booking goes through server service_role)
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
CREATE POLICY "Staff can view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    public.get_current_staff_role() IN ('ADMIN', 'RECEPTIONIST')
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND public.get_doctor_clinic_id() IS NOT NULL
      AND clinic_id = public.get_doctor_clinic_id()
    )
  );

DROP POLICY IF EXISTS "Staff can update appointments" ON public.appointments;
CREATE POLICY "Staff can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    public.get_current_staff_role() = 'ADMIN'
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND public.get_doctor_clinic_id() IS NOT NULL
      AND clinic_id = public.get_doctor_clinic_id()
    )
    OR (
      public.get_current_staff_role() = 'RECEPTIONIST'
      AND status != 'COMPLETED'
    )
  )
  WITH CHECK (
    public.get_current_staff_role() = 'ADMIN'
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND public.get_doctor_clinic_id() IS NOT NULL
      AND clinic_id = public.get_doctor_clinic_id()
    )
    OR (
      public.get_current_staff_role() = 'RECEPTIONIST'
      AND status != 'COMPLETED'
    )
  );

-- 4.4 Appointment Status History
DROP POLICY IF EXISTS "Staff can view status history" ON public.appointment_status_history;
CREATE POLICY "Staff can view status history"
  ON public.appointment_status_history FOR SELECT
  TO authenticated
  USING (
    public.get_current_staff_role() IN ('ADMIN', 'RECEPTIONIST')
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND public.get_doctor_clinic_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = appointment_id
          AND a.clinic_id = public.get_doctor_clinic_id()
      )
    )
  );

DROP POLICY IF EXISTS "Staff can insert status history" ON public.appointment_status_history;
CREATE POLICY "Staff can insert status history"
  ON public.appointment_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_staff_role() IN ('ADMIN', 'RECEPTIONIST', 'DOCTOR')
  );

-- 4.5 Audit Logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN');

DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_current_staff_role() IS NOT NULL);

-- 4.6 Staff Profiles
DROP POLICY IF EXISTS "Staff can read own profile" ON public.staff_profiles;
CREATE POLICY "Staff can read own profile"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can view all staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can manage staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can manage staff profiles"
  ON public.staff_profiles FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 4.7 OTP Verifications
-- Strictly NO policies created for anon or authenticated:
-- Only service_role (which bypasses RLS) can read, insert, update, or delete rows.

