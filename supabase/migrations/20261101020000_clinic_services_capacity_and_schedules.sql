-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261101020000_clinic_services_capacity_and_schedules.sql
-- Purpose:
--   1. Ensure prerequisite tables/columns exist safely (clinic_services, appointments extensions, rate_limit_counters).
--   2. Dedicated sequence for concurrent reference numbers (seq_appointment_reference_number).
--   3. Safely replace old unique active appointment index (idx_unique_active_apt_per_phone_clinic_day)
--      with normalized patient-name composite index (idx_unique_active_apt_per_phone_patient_clinic_day)
--      to support sibling bookings while blocking true duplicate bookings.
--      (Creates new index first, verifies presence, then drops old index).
--   4. Add per-service daily capacity (`clinic_services.max_daily_capacity`).
--   5. Add clinic-level required documents (`clinics.required_documents`).
--   6. Rate limit table, periodic cleanup function, and atomic upsert with fail-closed semantics.
--   7. Enhanced atomic booking RPC `book_appointment_atomic`:
--      - Fix uninitialized `v_service` RECORD error by using an independently initialized `v_service_name` variable.
--      - Preserve authenticated staff identity through `service_role` via `p_staff_user_id UUID` parameter,
--        verified strictly against `public.staff_profiles` (active, ADMIN or RECEPTIONIST).
--      - Enforces receptionist clinic confinement: receptionists assigned to a clinic cannot book in other clinics.
--      - Correctly writes to `appointment_status_history.updated_by TEXT` matching base schema.
--      - Uses sequence-based reference number with unique constraint violation retry loop.
--      - Enforce strict calendar exception precedence:
--        Exception (is_closed=true -> closed; is_closed=false -> open with capacity) overrides weekly schedule.
--      - Enforces both clinic daily capacity and per-service daily capacity atomically under advisory xact lock.
--      - Unifies booking horizon strictly to 30 days.
--   8. Phone-only tracking secure RPC with data minimization.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Prerequisite Schema Extensions & Sequence
-- ------------------------------------------------------------------------

-- Ensure clinic_services table exists
CREATE TABLE IF NOT EXISTS public.clinic_services (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  required_documents TEXT[] NOT NULL DEFAULT '{"أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي"}',
  instructions TEXT NOT NULL DEFAULT 'الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى.',
  max_daily_capacity INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add max_daily_capacity to clinic_services if not present
ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS max_daily_capacity INTEGER NULL;

DO $$ BEGIN
  ALTER TABLE public.clinic_services
    ADD CONSTRAINT chk_service_max_daily_capacity
    CHECK (max_daily_capacity IS NULL OR max_daily_capacity >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON COLUMN public.clinic_services.max_daily_capacity IS
  'Optional daily capacity ceiling for this specific service. NULL means no separate cap beyond clinic capacity.';

-- Add required_documents array to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS required_documents TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clinics.required_documents IS
  'List of general required documents and identity papers for attending this clinic.';

-- Ensure appointments has required extension columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES public.clinic_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_national_id VARCHAR(14);

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT chk_guardian_national_id
    CHECK (guardian_national_id IS NULL OR guardian_national_id ~ '^[0-9]{14}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Audit and update CHECK constraint on appointments.reference_number to support up to 10 digits
DO $$ BEGIN
  ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_reference_number;
  ALTER TABLE public.appointments
    ADD CONSTRAINT chk_reference_number
    CHECK (reference_number ~ '^BSCH-[0-9]{4,10}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Sequence for concurrent, collision-free appointment reference numbers
CREATE SEQUENCE IF NOT EXISTS public.seq_appointment_reference_number
  START WITH 1000
  INCREMENT BY 1;

-- Synchronize sequence safely: only advance forward, NEVER rollback or setval backwards
DO $$
DECLARE
  v_max_ref BIGINT;
  v_curr_seq BIGINT;
BEGIN
  -- Calculate max numeric reference number present in appointments
  SELECT COALESCE(MAX(SUBSTRING(reference_number FROM '^BSCH-([0-9]+)$')::BIGINT), 999)
  INTO v_max_ref
  FROM public.appointments
  WHERE reference_number ~ '^BSCH-[0-9]+$';

  -- Safely check current sequence last_value
  SELECT last_value INTO v_curr_seq
  FROM pg_sequences
  WHERE schemaname = 'public' AND sequencename = 'seq_appointment_reference_number';

  -- Only advance forward if max existing reference exceeds current sequence position
  IF v_max_ref > COALESCE(v_curr_seq, 999) THEN
    PERFORM setval('public.seq_appointment_reference_number', v_max_ref, true);
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 2. Safe Index Swap: Sibling Bookings vs Duplicate Child Bookings
-- ------------------------------------------------------------------------

-- Create replacement index incorporating normalized patient_name FIRST
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day
  ON public.appointments (clinic_id, phone_number, lower(regexp_replace(trim(patient_name), '\s+', ' ', 'g')), appointment_date)
  WHERE (status != 'CANCELLED');

-- Safely verify new index creation via pg_index before dropping old index
DO $$
DECLARE
  v_is_valid BOOLEAN := false;
  v_indexdef TEXT;
BEGIN
  -- Deep inspection of pg_index and index definition
  SELECT (i.indisvalid AND i.indisready AND i.indisunique),
         pg_get_indexdef(c.oid)
  INTO v_is_valid, v_indexdef
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'idx_unique_active_apt_per_phone_patient_clinic_day';

  -- Verify validity, readiness, uniqueness, patient_name expression, and cancellation predicate
  IF v_is_valid = true 
     AND v_indexdef ILIKE '%patient_name%'
     AND v_indexdef ILIKE '%regexp_replace%'
     AND (v_indexdef ILIKE '%status%CANCELLED%' OR v_indexdef ILIKE '%status <> ''CANCELLED''%' OR v_indexdef ILIKE '%status != ''CANCELLED''%')
  THEN
    DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day;
  ELSE
    RAISE WARNING 'Safety check: New index idx_unique_active_apt_per_phone_patient_clinic_day is not fully valid or does not match required expressions. Preserving old index.';
  END IF;
END $$;

-- ------------------------------------------------------------------------
-- 3. Persistent Rate Limiting Table & RPCs
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

-- Rate limit opportunistic cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.rate_limit_counters
  WHERE reset_at < (clock_timestamp() - INTERVAL '1 hour');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() TO service_role;

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
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reset_at TIMESTAMPTZ;
  v_current_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  -- Opportunistic cleanup roughly 1% of calls to prevent table bloat
  IF random() < 0.01 THEN
    PERFORM public.cleanup_expired_rate_limits();
  END IF;

  -- Upsert rate limit counter
  INSERT INTO public.rate_limit_counters (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
  SET 
    count = CASE 
      WHEN public.rate_limit_counters.reset_at <= v_now THEN 1 
      ELSE public.rate_limit_counters.count + 1 
    END,
    reset_at = CASE 
      WHEN public.rate_limit_counters.reset_at <= v_now THEN v_now + (p_window_seconds || ' seconds')::interval 
      ELSE public.rate_limit_counters.reset_at 
    END
  RETURNING count, reset_at INTO v_current_count, v_reset_at;

  IF v_current_count > p_max_requests THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after,
      'current_count', v_current_count
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ------------------------------------------------------------------------
-- 4. Enhanced Atomic Booking Function: book_appointment_atomic
-- ------------------------------------------------------------------------

-- Drop all previous function overloads safely
DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_clinic_id TEXT,
  p_patient_name TEXT,
  p_phone_number TEXT,
  p_patient_age TEXT DEFAULT NULL,
  p_patient_address TEXT DEFAULT NULL,
  p_appointment_date DATE DEFAULT NULL,
  p_appointment_time TEXT DEFAULT '09:00',
  p_reference_number TEXT DEFAULT NULL,
  p_service_id TEXT DEFAULT NULL,
  p_guardian_national_id TEXT DEFAULT NULL,
  p_staff_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic RECORD;
  v_service RECORD;
  v_service_name TEXT := 'كشف واستشارة طبية';
  v_schedule RECORD;
  v_effective_capacity INTEGER;
  v_current_clinic_booked INTEGER;
  v_current_service_booked INTEGER;
  v_queue_number INTEGER;
  v_ref TEXT;
  v_new_appointment RECORD;
  v_is_staff BOOLEAN := FALSE;
  v_staff_record RECORD;
  v_staff_name TEXT := NULL;
  v_initial_status appointment_status;
  v_clean_phone TEXT;
  v_clean_name TEXT;
  v_normalized_name TEXT;
  v_dow INTEGER;
  v_retries INTEGER := 0;
  v_today_cairo DATE := (timezone('Africa/Cairo', now()))::date;
  v_next_val BIGINT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Clean & validate inputs
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\s+', '', 'g');
  v_clean_name := trim(COALESCE(p_patient_name, ''));
  v_normalized_name := lower(regexp_replace(v_clean_name, '\s+', ' ', 'g'));

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف غير صحيح. يجب أن يتكون من 11 رقماً ويبدأ بـ (010, 011, 012, 015).');
  END IF;

  IF length(v_clean_name) < 5 OR array_length(regexp_split_to_array(v_clean_name, '\s+'), 1) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال اسم المريض ثنائي على الأقل.');
  END IF;

  IF p_appointment_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'تاريخ الموعد مطلوب.');
  END IF;

  IF p_appointment_date < v_today_cairo THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن حجز موعد في تاريخ سابق.');
  END IF;

  -- Unified 30-day booking horizon according to Cairo calendar
  IF p_appointment_date > (v_today_cairo + INTERVAL '30 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحجز الإلكتروني متاح بحد أقصى 30 يوماً مقدماً.');
  END IF;

  -- 2. Concurrency Safety: Transactional Advisory Lock per (clinic_id, appointment_date)
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text));

  -- 3. Validate Clinic
  SELECT * INTO v_clinic FROM public.clinics WHERE id = p_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير موجودة.');
  END IF;

  IF NOT v_clinic.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير مفعلة للحجز حالياً.');
  END IF;

  -- 4. Calendar Exceptions & Weekly Schedule Precedence
  -- Precedence:
  -- Tier 1: Check clinic_schedules for (clinic_id, appointment_date)
  --   - If found & is_closed = true: Closed (holiday/closure), overrides weekly schedule.
  --   - If found & is_closed = false: Open (exceptional opening day), overrides weekly schedule.
  -- Tier 2: If no exception record found:
  --   - Check day of week against clinic.days_of_week.
  SELECT * INTO v_schedule FROM public.clinic_schedules
  WHERE clinic_id = p_clinic_id AND schedule_date = p_appointment_date;

  IF FOUND THEN
    IF v_schedule.is_closed THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'العيادة مغلقة في هذا اليوم' || COALESCE(': ' || v_schedule.closure_reason, ' نظراً لعطلة رسمية أو ظرف طارئ.')
      );
    END IF;
    -- Exception opening day: capacity override if set, else clinic default
    v_effective_capacity := COALESCE(v_schedule.max_capacity, v_clinic.max_daily_slots);
  ELSE
    -- No schedule exception: apply weekly schedule
    v_dow := EXTRACT(DOW FROM p_appointment_date)::INTEGER;
    IF NOT (v_dow = ANY(v_clinic.days_of_week)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة لا تعمل في هذا اليوم (عطلة أسبوعية).');
    END IF;
    v_effective_capacity := v_clinic.max_daily_slots;
  END IF;

  -- 5. Duplicate Reservation Check: Permits siblings with same phone but distinct patient names
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE phone_number = v_clean_phone
      AND clinic_id = p_clinic_id
      AND appointment_date = p_appointment_date
      AND lower(regexp_replace(trim(patient_name), '\s+', ' ', 'g')) = v_normalized_name
      AND status != 'CANCELLED'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يوجد حجز نشط مسبقاً بنفس رقم الهاتف لنفس المريض في هذه العيادة في هذا اليوم.');
  END IF;

  -- 6. Clinic Daily Capacity Check
  SELECT COUNT(*) INTO v_current_clinic_booked
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date
    AND status != 'CANCELLED';

  IF v_current_clinic_booked >= v_effective_capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('عفواً، اكتملت السعة اليومية المتاحة للعيادة في هذا اليوم (%s مريض). يرجى اختيار موعد آخر.', v_effective_capacity)
    );
  END IF;

  -- 7. Service Validation & Service-Level Capacity Check
  IF p_service_id IS NOT NULL THEN
    SELECT * INTO v_service FROM public.clinic_services
    WHERE id = p_service_id AND clinic_id = p_clinic_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'الخدمة المختارة غير تابعة لهذه العيادة.');
    END IF;

    IF NOT v_service.is_active THEN
      RETURN jsonb_build_object('success', false, 'error', 'الخدمة المختارة غير مفعلة حالياً.');
    END IF;

    v_service_name := v_service.name;

    -- Enforce per-service capacity if configured
    IF v_service.max_daily_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_service_booked
      FROM public.appointments
      WHERE clinic_id = p_clinic_id
        AND service_id = p_service_id
        AND appointment_date = p_appointment_date
        AND status != 'CANCELLED';

      IF v_current_service_booked >= v_service.max_daily_capacity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('عفواً، اكتملت السعة اليومية المتاحة لخدمة "%s" في هذا اليوم (%s مريض). يرجى اختيار تاريخ آخر أو خدمة بديلة.', v_service.name, v_service.max_daily_capacity)
        );
      END IF;
    END IF;
  END IF;

  -- 8. Monotonic queue number
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_queue_number
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date;

  -- 9. Determine initial status & staff identity strictly
  -- Verify server-supplied p_staff_user_id or auth.uid() against active staff profiles
  IF p_staff_user_id IS NOT NULL THEN
    -- If invoked directly through PostgREST (not service_role), require auth.uid() match
    IF current_user != 'service_role' AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role' THEN
      IF auth.uid() IS NULL OR auth.uid() != p_staff_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن تحديد هوية موظف مختلفة عن الجلسة الموثقة.');
      END IF;
    END IF;

    SELECT id, full_name, role, clinic_id INTO v_staff_record
    FROM public.staff_profiles
    WHERE id = p_staff_user_id AND is_active = true;
    
    IF FOUND THEN
      IF v_staff_record.role NOT IN ('ADMIN', 'RECEPTIONIST') THEN
        RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير مصرح له بتسجيل الحجوزات المباشرة.');
      END IF;

      -- Receptionist clinic confinement
      IF v_staff_record.role = 'RECEPTIONIST' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'موظف الاستقبال غير مصرح له بالتسجيل في عيادة أخرى غير العيادة المخصصة له.');
      END IF;

      v_is_staff := true;
      v_staff_name := v_staff_record.full_name;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير صالح أو غير نشط.');
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id, full_name, role, clinic_id INTO v_staff_record
    FROM public.staff_profiles
    WHERE id = auth.uid() AND is_active = true;

    IF FOUND THEN
      IF v_staff_record.role IN ('ADMIN', 'RECEPTIONIST') THEN
        IF v_staff_record.role = 'RECEPTIONIST' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id THEN
          RETURN jsonb_build_object('success', false, 'error', 'موظف الاستقبال غير مصرح له بالتسجيل في عيادة أخرى غير العيادة المخصصة له.');
        END IF;
        v_is_staff := true;
        v_staff_name := v_staff_record.full_name;
      END IF;
    END IF;
  END IF;

  IF v_is_staff THEN
    v_initial_status := 'CONFIRMED';
  ELSE
    v_initial_status := 'PENDING_REVIEW';
  END IF;

  -- 10. Dedicated sequence for concurrent reference numbers (strictly database-generated)
  v_next_val := nextval('public.seq_appointment_reference_number');
  v_ref := 'BSCH-' || CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, '0') ELSE v_next_val::text END;

  -- 11. Insert record with concurrency collision retry loop and constraint discrimination
  LOOP
    BEGIN
      INSERT INTO public.appointments (
        reference_number,
        clinic_id,
        clinic_name,
        service_id,
        service_name,
        patient_name,
        phone_number,
        patient_age,
        patient_address,
        guardian_national_id,
        appointment_date,
        appointment_time,
        status,
        queue_number
      ) VALUES (
        v_ref,
        v_clinic.id,
        v_clinic.name,
        p_service_id,
        v_service_name,
        v_clean_name,
        v_clean_phone,
        p_patient_age,
        p_patient_address,
        p_guardian_national_id,
        p_appointment_date,
        COALESCE(p_appointment_time, '09:00'),
        v_initial_status,
        v_queue_number
      )
      RETURNING * INTO v_new_appointment;

      EXIT; -- Insert succeeded
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      -- Discriminate between reference number collision and duplicate booking violation
      IF v_constraint_name = 'appointments_reference_number_key' 
         OR v_constraint_name = 'idx_appointments_ref' 
         OR v_constraint_name LIKE '%reference_number%' 
         OR v_constraint_name LIKE '%ref%' THEN
        v_retries := v_retries + 1;
        IF v_retries > 5 THEN
          RETURN jsonb_build_object('success', false, 'error', 'تعذر توليد رقم مرجعي فريد في الوقت الحالي. يرجى المحاولة مرة أخرى.');
        END IF;
        v_next_val := nextval('public.seq_appointment_reference_number');
        v_ref := 'BSCH-' || CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, '0') ELSE v_next_val::text END;
      ELSIF v_constraint_name = 'idx_unique_active_apt_per_phone_patient_clinic_day' 
         OR v_constraint_name = 'idx_unique_active_apt_per_phone_clinic_day' THEN
        RETURN jsonb_build_object('success', false, 'error', 'يوجد حجز نشط مسبقاً بنفس رقم الهاتف لنفس المريض في هذه العيادة في هذا اليوم.');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'يوجد تعارض مع حجز مسجل مسبقاً (' || COALESCE(v_constraint_name, 'unique violation') || ').');
      END IF;
    END;
  END LOOP;

  -- 12. Record initial status history with matching updated_by TEXT
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    updated_by,
    note
  ) VALUES (
    v_new_appointment.id,
    v_initial_status,
    COALESCE(v_staff_name, CASE WHEN v_is_staff THEN 'طاقم المستشفى' ELSE 'البوابة الإلكترونية' END),
    CASE WHEN v_is_staff THEN 'تسجيل حضوري مباشر من مكتب الاستقبال' ELSE 'طلب حجز إلكتروني جديد' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_new_appointment.id,
      'reference_number', v_new_appointment.reference_number,
      'clinic_id', v_new_appointment.clinic_id,
      'clinic_name', v_new_appointment.clinic_name,
      'service_id', v_new_appointment.service_id,
      'service_name', v_new_appointment.service_name,
      'patient_name', v_new_appointment.patient_name,
      'phone_number', v_new_appointment.phone_number,
      'appointment_date', v_new_appointment.appointment_date,
      'appointment_time', v_new_appointment.appointment_time,
      'status', v_new_appointment.status,
      'queue_number', v_new_appointment.queue_number,
      'created_at', v_new_appointment.created_at
    )
  );
END;
$$;

-- Security Grants: Strictly service_role only (server-mediated)
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ------------------------------------------------------------------------
-- 5. Phone-Only Tracking Function: track_appointments_by_phone
-- ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_appointments_by_phone(
  p_phone_number TEXT
)
RETURNS TABLE (
  reference_number TEXT,
  clinic_id TEXT,
  clinic_name TEXT,
  service_id TEXT,
  service_name TEXT,
  patient_name TEXT,
  appointment_date DATE,
  status appointment_status,
  queue_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone TEXT;
  v_today_cairo DATE := (timezone('Africa/Cairo', now()))::date;
BEGIN
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\s+', '', 'g');

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.reference_number,
    a.clinic_id,
    a.clinic_name,
    a.service_id,
    COALESCE(a.service_name, 'كشف واستشارة طبية') AS service_name,
    a.patient_name,
    a.appointment_date,
    a.status,
    a.queue_number
  FROM public.appointments a
  WHERE a.phone_number = v_clean_phone
    AND a.appointment_date >= v_today_cairo
    AND a.status != 'CANCELLED'
  ORDER BY a.appointment_date ASC;
END;
$$;

-- Security Grants: Strictly service_role only (server-mediated)
REVOKE ALL ON FUNCTION public.track_appointments_by_phone(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_appointments_by_phone(TEXT) TO service_role;
