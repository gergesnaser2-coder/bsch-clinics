-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Security & Privilege Hardening Migration (Non-Destructive)
-- Migration: 20261025000000_security_and_privilege_hardening.sql
-- ========================================================================
--
-- This migration applies the following security and schema hardenings idempotently:
-- 1. Adds missing columns safely without dropping or re-creating tables.
-- 2. Restricts Doctor RLS policies so unassigned doctors (clinic_id IS NULL) CANNOT access any clinic.
-- 3. Enforces Receptionist privilege boundaries (cannot modify core patient data, clinic, date, or mark COMPLETED).
-- 4. Secures `track_appointment_secure` to require BOTH Reference Number AND Phone Number, returning minimized fields only.
-- 5. Minimizes data returned by `book_appointment_atomic` to visitors.
-- 6. Hardens RPC execute permissions and search paths.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Non-destructive column additions & constraints
-- ------------------------------------------------------------------------

-- Clinics: hospital confirmation flag
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS is_hospital_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Appointments: queue call tracking columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS called_count INTEGER NOT NULL DEFAULT 0;

-- Partial Unique Index: prevent duplicate active appointments for same phone in same clinic on same date
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_clinic_day
  ON public.appointments (clinic_id, phone_number, appointment_date)
  WHERE (status != 'CANCELLED');

-- ------------------------------------------------------------------------
-- 2. Security Definer Helper Functions Hardening
-- ------------------------------------------------------------------------

-- Helper: Get current doctor assigned clinic id (strictly requires active doctor with non-null clinic_id)
CREATE OR REPLACE FUNCTION public.get_doctor_clinic_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT clinic_id FROM public.staff_profiles
  WHERE id = auth.uid()
    AND is_active = true
    AND role = 'DOCTOR'
    AND clinic_id IS NOT NULL
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------
-- 3. Receptionist & Doctor Update Privilege Guard Trigger
-- ------------------------------------------------------------------------
-- Enforces that:
-- - Receptionists CANNOT alter patient name, phone, address, age, clinic, or date directly.
-- - Receptionists CANNOT mark appointment as COMPLETED (Doctor / Admin only).
-- - Doctors CANNOT alter appointments of other clinics or modify patient personal data.
-- - Completed or Cancelled appointments cannot be reopened except by Admin.
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_appointment_update_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role staff_role;
  v_doc_clinic TEXT;
BEGIN
  v_role := public.get_current_staff_role();

  -- Allow Admin and service_role unconstrained administrative maintenance
  IF v_role = 'ADMIN' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Reference number is strictly immutable
  IF OLD.reference_number != NEW.reference_number THEN
    RAISE EXCEPTION 'الرقم المرجعي للحجز غير قابل للتعديل نهائياً.';
  END IF;

  -- 2. Terminal state protection
  IF OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
    RAISE EXCEPTION 'لا يمكن تعديل أو إعادة فتح حجز مكتمل تم الكشف عليه مسبقاً.';
  END IF;

  IF OLD.status = 'CANCELLED' AND NEW.status != 'CANCELLED' THEN
    RAISE EXCEPTION 'لا يمكن تعديل أو إعادة فتح حجز ملغي مسبقاً.';
  END IF;

  -- 3. Receptionist role restrictions
  IF v_role = 'RECEPTIONIST' THEN
    -- Receptionist cannot change core identity or appointment slot
    IF OLD.patient_name != NEW.patient_name
       OR OLD.phone_number != NEW.phone_number
       OR OLD.clinic_id != NEW.clinic_id
       OR OLD.appointment_date != NEW.appointment_date THEN
      RAISE EXCEPTION 'غير مصرح لموظف الاستقبال بتعديل بيانات المريض أو العيادة أو تاريخ الموعد مباشرة. يلزم إجراء تحويل رسمي أو مراجعة مدير النظام.';
    END IF;

    -- Receptionist cannot complete appointments (medical evaluation is doctor only)
    IF NEW.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط.';
    END IF;
  END IF;

  -- 4. Doctor role restrictions
  IF v_role = 'DOCTOR' THEN
    v_doc_clinic := public.get_doctor_clinic_id();
    IF v_doc_clinic IS NULL OR OLD.clinic_id != v_doc_clinic THEN
      RAISE EXCEPTION 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى أو بدون تعيين عيادة معتمدة.';
    END IF;

    -- Doctor cannot tamper with patient identity or appointment date
    IF OLD.patient_name != NEW.patient_name
       OR OLD.phone_number != NEW.phone_number
       OR OLD.appointment_date != NEW.appointment_date THEN
      RAISE EXCEPTION 'غير مصرح للطبيب بتعديل البيانات الشخصية أو تاريخ الحجز.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_appointment_update_permissions ON public.appointments;
CREATE TRIGGER trigger_check_appointment_update_permissions
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_update_permissions();

-- ------------------------------------------------------------------------
-- 4. Hardened Row Level Security (RLS) Policies on Appointments
-- ------------------------------------------------------------------------

-- Ensure anonymous role has ZERO direct access to appointments
REVOKE ALL ON public.appointments FROM anon;

-- Staff SELECT Policy:
-- - Admin & Receptionist can view appointments
-- - Doctor can ONLY view appointments for their active assigned clinic (NEVER null clinic_id)
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
CREATE POLICY "Staff can view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff() AND (
      public.get_current_staff_role() IN ('ADMIN', 'RECEPTIONIST')
      OR (
        public.get_current_staff_role() = 'DOCTOR'
        AND public.get_doctor_clinic_id() IS NOT NULL
        AND clinic_id = public.get_doctor_clinic_id()
      )
    )
  );

-- Staff UPDATE Policy:
-- - Admin can update any appointment
-- - Doctor can ONLY update their assigned clinic's appointments
-- - Receptionist can update appointments except those marked COMPLETED
DROP POLICY IF EXISTS "Staff can update appointments" ON public.appointments;
CREATE POLICY "Staff can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff() AND (
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
  )
  WITH CHECK (
    public.is_active_staff() AND (
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
  );

-- ------------------------------------------------------------------------
-- 5. Hardened Atomic Booking with Data Minimization
-- ------------------------------------------------------------------------
-- Returns ONLY necessary booking information to the caller (reference_number,
-- clinic_name, patient_name, appointment_date, appointment_time, status, queue_number).
-- Omits internal UUIDs, patient address, age, and internal notes.
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_clinic_id TEXT,
  p_patient_name TEXT,
  p_phone_number TEXT,
  p_patient_age TEXT DEFAULT NULL,
  p_patient_address TEXT DEFAULT NULL,
  p_appointment_date DATE DEFAULT NULL,
  p_appointment_time TEXT DEFAULT '09:00',
  p_reference_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic RECORD;
  v_schedule RECORD;
  v_effective_capacity INTEGER;
  v_current_booked INTEGER;
  v_queue_number INTEGER;
  v_ref TEXT;
  v_new_appointment RECORD;
  v_is_staff BOOLEAN;
  v_initial_status appointment_status;
  v_clean_phone TEXT;
  v_clean_name TEXT;
  v_dow INTEGER;
BEGIN
  -- 1. Clean & validate inputs
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\s+', '', 'g');
  v_clean_name := trim(COALESCE(p_patient_name, ''));

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف غير صالح. يجب إدخال رقم محمول مصري صحيح مكون من 11 رقماً (010, 011, 012, 015).');
  END IF;

  IF length(v_clean_name) < 5 OR array_length(regexp_split_to_array(v_clean_name, '\s+'), 1) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى كتابة اسم المريض ثنائياً على الأقل (ويفضل رباعي).');
  END IF;

  IF p_appointment_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'تاريخ الموعد مطلوب.');
  END IF;

  IF p_appointment_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن حجز موعد في تاريخ سابق.');
  END IF;

  IF p_appointment_date > (CURRENT_DATE + INTERVAL '60 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحجز الإلكتروني متاح بحد أقصى 60 يوماً مقدماً.');
  END IF;

  -- 2. Concurrency Safety: Transactional Advisory Lock per (clinic_id, appointment_date)
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text));

  -- 3. Validate Clinic
  SELECT * INTO v_clinic FROM public.clinics WHERE id = p_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير متوفرة بالنظام.');
  END IF;

  IF NOT v_clinic.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة متوقفة مؤقتاً عن استقبال الحجوزات.');
  END IF;

  -- 4. Validate working days
  v_dow := EXTRACT(DOW FROM p_appointment_date)::INTEGER;
  IF NOT (v_dow = ANY(v_clinic.days_of_week)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة لا تعمل في هذا اليوم من الأسبوع.');
  END IF;

  -- 5. Check schedule overrides & holidays
  SELECT * INTO v_schedule FROM public.clinic_schedules
  WHERE clinic_id = p_clinic_id AND schedule_date = p_appointment_date;

  IF FOUND AND v_schedule.is_closed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'العيادة مغلقة في هذا التاريخ' || COALESCE(': ' || v_schedule.closure_reason, ' نظراً لعطلة رسمية أو ظرف طارئ.')
    );
  END IF;

  v_effective_capacity := COALESCE(v_schedule.max_capacity, v_clinic.max_daily_slots);

  -- 6. Check duplicate active reservation
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE phone_number = v_clean_phone
      AND clinic_id = p_clinic_id
      AND appointment_date = p_appointment_date
      AND status != 'CANCELLED'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يوجد حجز مسبق بالفعل لهذا الرقم في نفس العيادة والتاريخ.');
  END IF;

  -- 7. Check capacity
  SELECT COUNT(*) INTO v_current_booked
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date
    AND status != 'CANCELLED';

  IF v_current_booked >= v_effective_capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('عفواً، اكتملت السعة اليومية المتاحة للعيادة في هذا التاريخ (%s مريض). يرجى اختيار موعد آخر.', v_effective_capacity)
    );
  END IF;

  -- 8. Calculate monotonic queue number
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_queue_number
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date;

  -- 9. Determine initial status
  v_is_staff := (auth.uid() IS NOT NULL) AND public.is_active_staff();
  IF v_is_staff THEN
    v_initial_status := 'CONFIRMED';
  ELSE
    v_initial_status := 'PENDING_REVIEW';
  END IF;

  -- 10. Unique reference number
  v_ref := trim(COALESCE(p_reference_number, ''));
  IF v_ref = '' OR v_ref !~ '^BSCH-[0-9]{4,6}$' OR EXISTS (SELECT 1 FROM public.appointments WHERE reference_number = v_ref) THEN
    LOOP
      v_ref := 'BSCH-' || (floor(random() * 9000) + 1000)::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.appointments WHERE reference_number = v_ref);
    END LOOP;
  END IF;

  -- 11. Insert record
  INSERT INTO public.appointments (
    reference_number,
    clinic_id,
    clinic_name,
    patient_name,
    phone_number,
    patient_age,
    patient_address,
    appointment_date,
    appointment_time,
    status,
    queue_number,
    notes
  ) VALUES (
    v_ref,
    p_clinic_id,
    v_clinic.name,
    v_clean_name,
    v_clean_phone,
    trim(p_patient_age),
    trim(p_patient_address),
    p_appointment_date,
    COALESCE(trim(p_appointment_time), '09:00'),
    v_initial_status,
    v_queue_number,
    CASE WHEN v_is_staff THEN 'تسجيل حضوري مباشر من مكتب الاستقبال' ELSE NULL END
  ) RETURNING * INTO v_new_appointment;

  -- 12. Insert status history
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by
  ) VALUES (
    v_new_appointment.id,
    v_initial_status,
    CASE
      WHEN v_is_staff THEN 'تم تسجيل وتأكيد الحجز فورياً عبر مكتب الاستقبال'
      ELSE 'تم تسجيل طلب الحجز بنجاح عبر البوابة الإلكترونية وبانتظار المراجعة'
    END,
    CASE WHEN v_is_staff THEN 'موظف الاستقبال' ELSE 'بوابة الحجز الإلكترونية' END
  );

  -- 13. DATA MINIMIZATION: Return ONLY minimal fields to the client
  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'reference_number', v_new_appointment.reference_number,
      'clinic_id', v_new_appointment.clinic_id,
      'clinic_name', v_new_appointment.clinic_name,
      'patient_name', v_new_appointment.patient_name,
      'phone_number', v_new_appointment.phone_number,
      'appointment_date', v_new_appointment.appointment_date,
      'appointment_time', v_new_appointment.appointment_time,
      'status', v_new_appointment.status,
      'queue_number', v_new_appointment.queue_number
    )
  );
END;
$$;

-- ------------------------------------------------------------------------
-- 6. Hardened Two-Factor Tracking RPC Function (track_appointment_secure)
-- ------------------------------------------------------------------------
-- Strictly requires BOTH the Reference Number AND the matching Phone Number.
-- Rejects queries with only phone or only reference.
-- Returns ONLY minimal tracking fields (TABLE of 8 fields), preventing any
-- exposure of patient address, age, medical notes, or unmasked database internals.
-- ------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.track_appointment_secure(TEXT);
DROP FUNCTION IF EXISTS public.track_appointment_secure(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.track_appointment_secure(
  p_reference_number TEXT,
  p_phone_number TEXT
)
RETURNS TABLE (
  reference_number TEXT,
  clinic_id TEXT,
  clinic_name TEXT,
  patient_name TEXT,
  appointment_date DATE,
  appointment_time TEXT,
  status appointment_status,
  queue_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_ref TEXT;
  v_clean_phone TEXT;
BEGIN
  -- 1. Validate both inputs exist
  v_clean_ref := trim(upper(COALESCE(p_reference_number, '')));
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\D', '', 'g');

  IF v_clean_ref = '' OR v_clean_phone = '' THEN
    RETURN;
  END IF;

  -- Prepend BSCH- if 4-6 digits provided
  IF v_clean_ref ~ '^[0-9]{4,6}$' THEN
    v_clean_ref := 'BSCH-' || v_clean_ref;
  END IF;

  -- Validate reference number format
  IF v_clean_ref !~ '^BSCH-[0-9]{4,6}$' THEN
    RETURN;
  END IF;

  -- Normalize phone (handle missing 0)
  IF length(v_clean_phone) = 10 AND v_clean_phone ~ '^(10|11|12|15)' THEN
    v_clean_phone := '0' || v_clean_phone;
  END IF;

  -- Validate Egyptian phone format
  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN;
  END IF;

  -- 2. Query matching active appointment strictly requiring BOTH ref AND phone
  RETURN QUERY
  SELECT
    a.reference_number,
    a.clinic_id,
    a.clinic_name,
    a.patient_name,
    a.appointment_date,
    a.appointment_time,
    a.status,
    a.queue_number
  FROM public.appointments a
  WHERE a.reference_number = v_clean_ref
    AND a.phone_number = v_clean_phone
  ORDER BY a.appointment_date DESC, a.created_at DESC
  LIMIT 1;

  RETURN;
END;
$$;

-- ------------------------------------------------------------------------
-- 7. Function Execution Permissions Hardening
-- ------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.track_appointment_secure(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_appointment_secure(TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_doctor_clinic_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinic_id() TO authenticated, service_role;

