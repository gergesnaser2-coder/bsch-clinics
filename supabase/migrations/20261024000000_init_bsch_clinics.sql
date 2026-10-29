-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Supabase PostgreSQL Relational Schema, Row Level Security (RLS) & RPCs
-- Migration: 20261024000000_init_bsch_clinics.sql
-- ========================================================================

-- Enable core extensions safely
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- ------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('ADMIN', 'RECEPTIONIST', 'DOCTOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'PENDING_REVIEW',  -- قيد المراجعة (طلب إلكتروني بانتظار الاعتماد)
    'CONFIRMED',       -- مؤكد (تم اعتماد الموعد وتخصيص رقم الدور)
    'CHECKED_IN',      -- حضر المريض (في قائمة الاستدعاء وشاشة الانتظار)
    'COMPLETED',       -- مكتمل (تم الكشف الطبي وإغلاق التذكرة)
    'CANCELLED'        -- ملغي
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------
-- 2. Clinics Table (العيادات الخارجية)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  working_hours TEXT NOT NULL DEFAULT '08:30-14:00',
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,6}', -- الأحد للخميس والسبت (0=Sun .. 6=Sat)
  max_daily_slots INTEGER NOT NULL DEFAULT 20,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_hospital_confirmed BOOLEAN NOT NULL DEFAULT false, -- للتمييز الصريح بين البيانات التجريبية والمعتمدة رسمياً
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_max_daily_slots CHECK (max_daily_slots > 0),
  CONSTRAINT chk_slot_duration CHECK (slot_duration_minutes > 0)
);

-- ------------------------------------------------------------------------
-- 3. Staff Profiles (ملفات موظفي وأطباء المستشفى)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role staff_role NOT NULL DEFAULT 'RECEPTIONIST',
  clinic_id TEXT REFERENCES public.clinics(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------
-- 4. Clinic Schedules & Overrides (جداول العيادات والعطلات والسعات الاستثنائية)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 20,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  closure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_clinic_date UNIQUE (clinic_id, schedule_date),
  CONSTRAINT chk_schedule_capacity CHECK (max_capacity >= 0)
);

-- ------------------------------------------------------------------------
-- 5. Appointments Table (الحجوزات والمواعيد)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE NOT NULL, -- e.g. BSCH-7492
  clinic_id TEXT NOT NULL REFERENCES public.clinics(id),
  clinic_name TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  phone_number VARCHAR(15) NOT NULL, -- Egyptian 11 digits
  patient_age TEXT,
  patient_address TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL DEFAULT '09:00',
  status appointment_status NOT NULL DEFAULT 'PENDING_REVIEW',
  queue_number INTEGER,
  last_called_at TIMESTAMPTZ,
  called_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_phone_number CHECK (phone_number ~ '^01[0125][0-9]{8}$'),
  CONSTRAINT chk_patient_name CHECK (length(trim(patient_name)) >= 5),
  CONSTRAINT chk_reference_number CHECK (reference_number ~ '^BSCH-[0-9]{4,6}$'),
  CONSTRAINT chk_queue_number CHECK (queue_number IS NULL OR queue_number > 0)
);

-- Partial Unique Index: يمنع تكرار أي حجز نشط لنفس رقم الهاتف في نفس العيادة ونفس اليوم
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_clinic_day
  ON public.appointments (clinic_id, phone_number, appointment_date)
  WHERE (status != 'CANCELLED');

-- ------------------------------------------------------------------------
-- 6. Appointment Status History (سجل تغير الحالات وتدفق الخدمة)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  status appointment_status NOT NULL,
  note TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------
-- 7. Audit Logs (سجل العمليات الإدارية الحساسة والرقابة)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------
-- Performance Indexes
-- ------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON public.appointments (phone_number);
CREATE INDEX IF NOT EXISTS idx_appointments_ref ON public.appointments (reference_number);
CREATE INDEX IF NOT EXISTS idx_appointments_date_clinic ON public.appointments (clinic_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (status);
CREATE INDEX IF NOT EXISTS idx_status_history_apt ON public.appointment_status_history (appointment_id);
CREATE INDEX IF NOT EXISTS idx_clinic_schedules_lookup ON public.clinic_schedules (clinic_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- ------------------------------------------------------------------------
-- 8. Updated At Triggers
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_clinics_updated_at ON public.clinics;
CREATE TRIGGER trigger_clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_staff_profiles_updated_at ON public.staff_profiles;
CREATE TRIGGER trigger_staff_profiles_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_clinic_schedules_updated_at ON public.clinic_schedules;
CREATE TRIGGER trigger_clinic_schedules_updated_at
  BEFORE UPDATE ON public.clinic_schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_appointments_updated_at ON public.appointments;
CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------
-- 9. Security Definer Helper Functions
-- ------------------------------------------------------------------------

-- Helper: Check if current user is an active staff member
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- Helper: Get current staff user role
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
-- 10. Receptionist & Doctor Update Privilege Guard Trigger
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
-- 11. Row Level Security (RLS) Configuration
-- ------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke default public schema grants to ensure zero leakage to anonymous role
REVOKE ALL ON public.appointments FROM anon;
REVOKE ALL ON public.appointment_status_history FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.staff_profiles FROM anon;

-- Explicit table grants
GRANT SELECT ON public.clinics TO anon, authenticated;
GRANT SELECT ON public.clinic_schedules TO anon, authenticated;
GRANT SELECT, UPDATE ON public.appointments TO authenticated;
GRANT SELECT, INSERT ON public.appointment_status_history TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;

-- RLS: clinics
DROP POLICY IF EXISTS "Public can view active clinics" ON public.clinics;
CREATE POLICY "Public can view active clinics"
  ON public.clinics FOR SELECT
  USING (is_active = true OR public.is_active_staff());

DROP POLICY IF EXISTS "Admins can manage clinics" ON public.clinics;
CREATE POLICY "Admins can manage clinics"
  ON public.clinics FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- RLS: clinic_schedules
DROP POLICY IF EXISTS "Public can view schedules" ON public.clinic_schedules;
CREATE POLICY "Public can view schedules"
  ON public.clinic_schedules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage schedules" ON public.clinic_schedules;
CREATE POLICY "Admins can manage schedules"
  ON public.clinic_schedules FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- RLS: staff_profiles
DROP POLICY IF EXISTS "Staff can view own profile or admin view all" ON public.staff_profiles;
CREATE POLICY "Staff can view own profile or admin view all"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.get_current_staff_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins manage staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins manage staff profiles"
  ON public.staff_profiles FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- RLS: appointments
-- Anonymous visitors CANNOT run SELECT directly against appointments table!
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

-- RLS: appointment_status_history
DROP POLICY IF EXISTS "Staff can view status history" ON public.appointment_status_history;
CREATE POLICY "Staff can view status history"
  ON public.appointment_status_history FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff() AND (
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
    )
  );

DROP POLICY IF EXISTS "Staff can insert status history" ON public.appointment_status_history;
CREATE POLICY "Staff can insert status history"
  ON public.appointment_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff() AND (
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
    )
  );

-- Note: NO UPDATE OR DELETE policies on appointment_status_history (Immutable audit history)

-- RLS: audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN');

DROP POLICY IF EXISTS "Active staff can insert audit logs" ON public.audit_logs;
CREATE POLICY "Active staff can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_staff());

-- Note: NO UPDATE OR DELETE policies on audit_logs (Immutable audit log)

-- ------------------------------------------------------------------------
-- 12. Atomic Booking Function (book_appointment_atomic) with Data Minimization
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
  -- 1. Validate and clean input fields
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

  -- 2. Concurrency Safety: Lock the clinic and date transactionally
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text));

  -- 3. Validate Clinic
  SELECT * INTO v_clinic FROM public.clinics WHERE id = p_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير متوفرة بالنظام.');
  END IF;

  IF NOT v_clinic.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة متوقفة مؤقتاً عن استقبال الحجوزات.');
  END IF;

  -- 4. Validate clinic working days
  v_dow := EXTRACT(DOW FROM p_appointment_date)::INTEGER;
  IF NOT (v_dow = ANY(v_clinic.days_of_week)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة لا تعمل في هذا اليوم من الأسبوع.');
  END IF;

  -- 5. Check schedule overrides (holidays, special closures, custom capacity)
  SELECT * INTO v_schedule FROM public.clinic_schedules
  WHERE clinic_id = p_clinic_id AND schedule_date = p_appointment_date;

  IF FOUND AND v_schedule.is_closed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'العيادة مغلقة في هذا التاريخ' || COALESCE(': ' || v_schedule.closure_reason, ' نظراً لعطلة رسمية أو ظرف طارئ.')
    );
  END IF;

  v_effective_capacity := COALESCE(v_schedule.max_capacity, v_clinic.max_daily_slots);

  -- 6. Check duplicate reservation for same phone in same clinic on the same day
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

  -- 9. Determine initial status based on caller (walk-in staff vs online portal)
  v_is_staff := (auth.uid() IS NOT NULL) AND public.is_active_staff();
  IF v_is_staff THEN
    v_initial_status := 'CONFIRMED';
  ELSE
    v_initial_status := 'PENDING_REVIEW';
  END IF;

  -- 10. Guarantee unique reference number
  v_ref := trim(COALESCE(p_reference_number, ''));
  IF v_ref = '' OR v_ref !~ '^BSCH-[0-9]{4,6}$' OR EXISTS (SELECT 1 FROM public.appointments WHERE reference_number = v_ref) THEN
    LOOP
      v_ref := 'BSCH-' || (floor(random() * 9000) + 1000)::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.appointments WHERE reference_number = v_ref);
    END LOOP;
  END IF;

  -- 11. Insert appointment atomically
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

  -- 12. Insert initial status history
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
-- 13. Hardened Two-Factor Tracking RPC Function (track_appointment_secure)
-- ------------------------------------------------------------------------
-- Strictly requires BOTH Reference Number AND matching Phone Number.
-- Rejects queries with only phone or only reference.
-- Returns ONLY minimal tracking fields (TABLE of 8 fields), preventing any
-- exposure of patient address, age, medical notes, or unmasked database internals.
-- ------------------------------------------------------------------------
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
-- 14. Function Execution Privileges (RPC Permission Hardening)
-- ------------------------------------------------------------------------

-- Revoke all function executions from public
REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_doctor_clinic_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_appointment_secure(TEXT, TEXT) FROM PUBLIC;

-- Grant to appropriate roles
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_staff_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinic_id() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_appointment_secure(TEXT, TEXT) TO anon, authenticated, service_role;
