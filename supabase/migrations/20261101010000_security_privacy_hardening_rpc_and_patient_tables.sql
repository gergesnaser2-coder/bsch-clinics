-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261101010000_security_privacy_hardening_rpc_and_patient_tables.sql
-- Purpose: 
--   1. Revoke public/anon RPC execution on booking and tracking (service_role only).
--   2. Revoke all direct table access on patient tables from anon and authenticated (service_role only).
--   3. Upgrade unique booking constraint to permit siblings with same phone but different names.
--   4. Implement persistent serverless rate limiting table and atomic RPC.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Revoke Public & Anon RPC Execution on Sensitive Functions
-- ------------------------------------------------------------------------
-- The Next.js server handles all booking and tracking requests using createAdminClient()
-- (service_role). No browser/client calls RPC directly with the anon key.
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.track_appointment_secure(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_appointment_secure(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.track_appointment_secure(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_appointment_secure(TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------
-- 2. Revoke Direct Table Access from anon & authenticated on Patient Data Tables
-- ------------------------------------------------------------------------
-- Note: A column-level REVOKE does not take effect when a table-level GRANT exists.
-- Therefore, all table-level grants on sensitive patient tables are strictly revoked.
-- All staff and patient reads/writes go through Next.js server routes via service_role.
REVOKE ALL ON TABLE public.appointments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.appointment_status_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.otp_verifications FROM PUBLIC, anon, authenticated;

-- Ensure service_role has unhindered administrative access
GRANT ALL ON TABLE public.appointments TO service_role;
GRANT ALL ON TABLE public.appointment_status_history TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT ALL ON TABLE public.otp_verifications TO service_role;

-- ------------------------------------------------------------------------
-- 3. Upgrade Booking Uniqueness: Allow Siblings While Blocking Duplicates
-- ------------------------------------------------------------------------
-- The previous constraint indexed (clinic_id, phone_number, appointment_date),
-- which inadvertently blocked parents booking for two siblings on the same day.
-- The upgraded index incorporates normalized patient_name to allow distinct siblings.
DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day
  ON public.appointments (clinic_id, phone_number, lower(trim(patient_name)), appointment_date)
  WHERE (status != 'CANCELLED');

-- ------------------------------------------------------------------------
-- 4. Persistent Rate Limiting Table & Atomic RPC for Serverless
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_record RECORD;
  v_reset_at TIMESTAMPTZ;
  v_retry_after INTEGER;
BEGIN
  -- Cleanup expired rate limit counters
  DELETE FROM public.rate_limit_counters WHERE reset_at < v_now;

  -- Acquire lock on the specific rate-limiting key
  SELECT * INTO v_record FROM public.rate_limit_counters WHERE key = p_key FOR UPDATE;

  IF NOT FOUND OR v_record.reset_at < v_now THEN
    v_reset_at := v_now + (p_window_seconds || ' seconds')::INTERVAL;
    INSERT INTO public.rate_limit_counters (key, count, reset_at)
    VALUES (p_key, 1, v_reset_at)
    ON CONFLICT (key) DO UPDATE
    SET count = 1, reset_at = EXCLUDED.reset_at;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - 1);
  END IF;

  IF v_record.count >= p_max_requests THEN
    v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_record.reset_at - v_now)))::INTEGER;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', GREATEST(v_retry_after, 1)
    );
  END IF;

  UPDATE public.rate_limit_counters
  SET count = count + 1
  WHERE key = p_key;

  RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - (v_record.count + 1));
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

