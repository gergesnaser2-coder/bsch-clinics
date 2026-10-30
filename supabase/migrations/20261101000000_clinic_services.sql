-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261101000000_clinic_services.sql
-- Purpose: Dynamic Clinic Services, Service Documents & Hardened Appointment Tracking
-- ========================================================================
--
-- Deliverables in this migration:
-- 1. `public.clinic_services`: Granular service definitions per clinic with
--    dedicated required_documents and instructions.
-- 2. `public.appointments` extensions:
--    - service_id (FK to clinic_services)
--    - service_name (text snapshot)
--    - guardian_national_id (14 digits, confidential, never exposed to anon or public APIs)
--    - booking_code_hash (HMAC-SHA256 hash for CSPRNG booking code printed on receipt)
-- 3. Row Level Security (RLS) on clinic_services (public SELECT active, ADMIN manage).
-- 4. Initial seed of standard pediatric clinic services (marked DRAFT for clinical review).
-- ========================================================================

-- Enable core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------
-- 1. Create Clinic Services Table
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_services (
  id TEXT PRIMARY KEY DEFAULT ('srv_' || substr(md5(random()::text), 1, 8)),
  clinic_id TEXT NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  required_documents TEXT[] NOT NULL DEFAULT '{}',
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clinic_services_clinic_id ON public.clinic_services(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_services_active ON public.clinic_services(is_active);

-- Updated at trigger
DROP TRIGGER IF EXISTS trigger_clinic_services_updated_at ON public.clinic_services;
CREATE TRIGGER trigger_clinic_services_updated_at
  BEFORE UPDATE ON public.clinic_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------
-- 2. Extend Appointments Table
-- ------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES public.clinic_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_national_id VARCHAR(14),
  ADD COLUMN IF NOT EXISTS booking_code_hash TEXT;

COMMENT ON COLUMN public.appointments.guardian_national_id IS 'Optional 14-digit Egyptian national ID of child guardian. Confidential: strictly forbidden from being returned by public tracking APIs or printed on receipts.';
COMMENT ON COLUMN public.appointments.booking_code_hash IS 'HMAC-SHA256 hash of the CSPRNG booking code printed on the patient receipt ticket.';

-- ------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Policies on clinic_services
-- ------------------------------------------------------------------------
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.clinic_services TO anon, authenticated;
GRANT ALL ON public.clinic_services TO authenticated;

-- Public can view active services
DROP POLICY IF EXISTS "Public can view active clinic services" ON public.clinic_services;
CREATE POLICY "Public can view active clinic services"
  ON public.clinic_services FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.get_current_staff_role() IS NOT NULL);

-- Admin can manage clinic services
DROP POLICY IF EXISTS "Admin can manage clinic services" ON public.clinic_services;
CREATE POLICY "Admin can manage clinic services"
  ON public.clinic_services FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ------------------------------------------------------------------------
-- 4. Initial Seed for Clinic Services Notice
-- ------------------------------------------------------------------------
-- NOTE: Demo/provisional services have been intentionally moved OUT of this migration
-- to `supabase/seed/clinic_services_DRAFT.sql` with `is_active = false`.
-- This migration creates only the table structure, constraints, indexes, and RLS policies.


