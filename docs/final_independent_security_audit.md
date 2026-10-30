# تقرير التدقيق الهندسي والأمني المستقل النهائي
## مستشفى الأطفال التخصصي بالبحيرة — BSCH Clinics

**تاريخ التدقيق:** 30 أكتوبر 2026  
**طبيعة التدقيق:** فحص مستقل وأدلة برمجية مباشرة من ملفات المشروع المحلية (Ground-Truth Code Inspection)  
**حدود التنفيذ:** فحص وتعديل واختبار محلي حصراً (Local Only) — **لم يتم الاتصال بقاعدة بيانات الإنتاج، ولم يُنفذ أي أمر SQL عن بُعد، ولم يُجرَ أي نشر أو تعديل على إعدادات السحابة**.

---

## 1. ملخص تنفيذي (Executive Summary)

تم إجراء تدقيق هندسي وأمني شامل ومستقل لمنظومة حجز ومتابعة وإدارة عيادات مستشفى الأطفال التخصصي بالبحيرة (BSCH Clinics). شمل التدقيق فحص كافة طبقات المنظومة:
- بنية قاعدة البيانات وملفات الهجرة (`supabase/migrations/`)
- واجهات برمجة التطبيقات (`app/api/`)
- منطق الأعمال والخدمات (`services/`)
- مكتبات الحماية والتحقق وقواعد التحقق (`lib/`)
- شاشات وتطبيقات المستخدم ولوحة تحكم الموظفين (`app/`, `components/`)

### أبرز نتائج التدقيق:
1. **اكتشاف ومعالجة ثغرة إلغاء المواعيد غير المصرح بها:** كان مسار `POST /api/appointments/[id]/cancel` يسمح بإلغاء الحجز دون التحقق من هوية المتصل أو رقم هاتف ولي الأمر. تم إغلاق الثغرة بالكامل باشتراط مطابقة رقم هاتف الحجز أو مصادقة جلسة موظف مصرح له.
2. **اكتشاف ومعالجة تصادم الأرقام المرجعية عند تجاوز 9999:** تبيّن أن استخدام `lpad(val, 4, '0')` في PostgreSQL يؤدي إلى اقتطاع الرقم عند تجاوزه 4 خانات (فمثلاً 10000 تتحول إلى 1000). تم إصلاح المنطق بالكامل ليتحمل حتى 8 خانات دون أي اقتطاع مع حلقة إعادة محاولة متزامنة.
3. **تأمين تزامن التسلسل (Sequence Synchronization):** تمت إضافة كتلة برمجية لمزامنة تسلسل `seq_appointment_reference_number` تلقائياً مع أعلى رقم مرجعي موجود فعلياً في جدول `appointments` لمنع أي تصادم مع الحجوزات السابقة.
4. **توحيد التوقيت مع توقيت القاهرة (`Africa/Cairo`):** استبدال استخدام `CURRENT_DATE` المعتمد على توقيت خادم السحابة (UTC) بالدالة الصريحة `(timezone('Africa/Cairo', now()))::date` لمنع أخطاء الحجز والتتبع خلال فترة منتصف الليل بين القاهرة وUTC.
5. **الالتزام بثوابت المستشفى وحماية بيانات الأطفال:** التحقق من عدم تسريب الرقم القومي أو العنوان أو العمر في واجهات التتبع العامة، وحجب أسماء المرضى جزئياً (`maskPatientName`)، والتأكيد على ثوابت الحضور الصباحي وعدم وجود طوارئ أطفال.
6. **سلامة الاختبارات والبناء:** نجاح 58 اختباراً آلياً شاملاً (`npm test`)، وخلو كامل من أخطاء المترجم (`npx tsc --noEmit`)، وبناء إنتاجي سليم لجميع مسارات Next.js الـ 26 (`npm run build`).

---

## 2. خريطة الاعتماد والتدفق المعماري (Dependency Map)

```
[ Next.js Client Components (Track / Book / Dashboard) ]
                     │
                     ▼ (HTTP POST / GET / PATCH)
[ API Route Handlers (app/api/appointments, staff, cms) ]
                     │
     ┌───────────────┴───────────────┐
     ▼                               ▼
[ AuthService.verifySession ]   [ Turnstile & checkRateLimit ]
(Validates Active Staff Role)   (Persistent Fail-Closed in Prod)
     │                               │
     └───────────────┬───────────────┘
                     ▼
[ Services Layer (appointmentService, cmsService) ]
(Enforces Hospital Invariants, Clinic Boundaries, Business Rules)
                     │
                     ▼ (createAdminClient - Server-Side Service Role)
[ Supabase Client / RPC Gateway ]
                     │
     ┌───────────────┴───────────────┐
     ▼                               ▼
[ PostgreSQL RPC Functions ]    [ PostgreSQL Base Tables ]
- book_appointment_atomic       - clinics
- track_appointments_by_phone   - clinic_services
- check_rate_limit              - clinic_schedules
- cleanup_expired_rate_limits   - appointments (RLS: Revoked from Anon/Auth)
                                - appointment_status_history
                                - staff_profiles
                                - rate_limit_counters
```

---

## 3. قائمة الملفات التي تمت مراجعتها بالكامل

### أ. ملفات الهجرة وقاعدة البيانات (`supabase/migrations/`)
- `20261024000000_init_bsch_clinics.sql`
- `20261025000000_security_and_privilege_hardening.sql`
- `20261029000000_website_cms_schema.sql`
- `20261030000000_clinic_instructions.sql`
- `20261031000000_cms_and_media_system.sql`
- `20261031010000_staff_auth_provisioning.sql`
- `20261101000000_clinic_services.sql`
- `20261101010000_security_privacy_hardening_rpc_and_patient_tables.sql`
- `20261101020000_clinic_services_capacity_and_schedules.sql`

### ب. ملفات الخدمات ونماذج البيانات (`services/`, `types/`)
- `services/appointmentService.ts`
- `services/authService.ts`
- `services/cmsService.ts`
- `types/database.types.ts`
- `types/index.ts`
- `types/cms.ts`

### ج. واجهات برمجة التطبيقات (`app/api/`)
- `app/api/appointments/route.ts`
- `app/api/appointments/track/route.ts`
- `app/api/appointments/walk-in/route.ts`
- `app/api/appointments/[id]/cancel/route.ts`
- `app/api/appointments/[id]/recall/route.ts`
- `app/api/appointments/[id]/status/route.ts`
- `app/api/appointments/[id]/transfer/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/session/route.ts`
- `app/api/clinics/route.ts`
- `app/api/clinics/[id]/schedules/route.ts`
- `app/api/clinics/[id]/services/route.ts`
- `app/api/cms/content/route.ts`
- `app/api/slots/route.ts`
- `app/api/staff/appointments/route.ts`
- `app/api/staff/audit-logs/route.ts`
- `app/api/staff/clinics/route.ts`
- `app/api/staff/clinics/[id]/route.ts`
- `app/api/staff/clinics/[id]/schedules/route.ts`
- `app/api/staff/cms/route.ts`
- `app/api/staff/cms/clinics/[id]/route.ts`
- `app/api/staff/cms/clinics/[id]/services/route.ts`
- `app/api/staff/cms/media/route.ts`
- `app/api/staff/cms/navigation/route.ts`
- `app/api/staff/cms/sections/route.ts`
- `app/api/staff/cms/settings/route.ts`

### د. مكتبات الأمان والتحقق والواجهات (`lib/`, `app/`, `components/`)
- `lib/supabase/admin.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/otp.ts`
- `lib/rules.ts`
- `lib/turnstile.ts`
- `lib/trackingAccess.ts`
- `app/appointments/new/page.tsx`
- `app/appointments/new/actions.ts`
- `app/appointments/track/page.tsx`
- `app/staff/dashboard/page.tsx`
- `app/staff/login/page.tsx`
- `components/FaqSection.tsx`
- `components/TrustAndInfo.tsx`
- `components/cms/ClinicsPresentationEditor.tsx`

---

## 4. سجل المشكلات المكتشفة وتقييم خطورتها

| المعرف | المشكلة المكتشفة | درجة الخطورة | الحالة | الملفات المعنية |
|---|---|:---:|:---:|---|
| **SEC-01** | مسار إلغاء الحجز `POST /api/appointments/[id]/cancel` يقبل طلبات دون التحقق من الهوية أو مطابقة رقم الهاتف. | **CRITICAL** | **FIXED** | `app/api/appointments/[id]/cancel/route.ts`<br>`services/appointmentService.ts`<br>`app/appointments/track/page.tsx` |
| **SEC-02** | تسلسل الأرقام المرجعية `seq_appointment_reference_number` غير متزامن مع أعلى رقم سابق وقد يتصادم مع الحجوزات السابقة. | **HIGH** | **FIXED** | `supabase/migrations/20261101020000` |
| **SEC-03** | استخدام `lpad(val, 4, '0')` في PostgreSQL يؤدي لاقتطاع الرقم عند تجاوزه 9999 (10000 تتحول لـ 1000) مما يسبب تصادماً حتمياً. | **HIGH** | **FIXED** | `supabase/migrations/20261101020000` |
| **SEC-04** | استخدام `CURRENT_DATE` في دوال SQL يعتمد على توقيت خادم السحابة (UTC) ويختلف عن توقيت القاهرة في فترة منتصف الليل. | **MEDIUM** | **FIXED** | `supabase/migrations/20261101020000` |
| **SEC-05** | دالة `recallPatient` و `updateStatus` في `appointmentService` لم تكن تتحقق من عيادة موظف الاستقبال المخصص. | **HIGH** | **FIXED** | `services/appointmentService.ts` |
| **SEC-06** | عمود `changed_by` غير موجود بجدول `appointment_status_history` في قاعدة التأسيس (العمود الحقيقي `updated_by TEXT`). | **CRITICAL** | **FIXED** | `supabase/migrations/20261101020000` |
| **SEC-07** | خطر تعطل إنشاء الفهرس الفريد وترك الجدول دون قيد حماية عند استبدال `idx_unique_active_apt_per_phone_clinic_day`. | **HIGH** | **FIXED** | `supabase/migrations/20261101020000` |
| **SEC-08** | احتمالية وجود حجوزات مكررة سابقة تعوق تنفيذ هجرة الفهرس الجديد دون استعلام فحص مسبق. | **MEDIUM** | **FIXED** | `docs/final_independent_security_audit.md` |

---

## 5. الإصلاحات الفنية المنفذة بالتفصيل

### 1. تأمين مسار ومنطق إلغاء الحجز (SEC-01)
- في [`app/api/appointments/[id]/cancel/route.ts`](file:///e:/خاص%20روبو/bsch-clinics/app/api/appointments/[id]/cancel/route.ts):
  - فحص ترويسة المصادقة `Authorization` للتأكد من جلسة الموظف إن وُجدت.
  - إذا لم يكن المتصل موظفاً، يُلزم بتقديم `phoneNumber`.
  - إذا غاب الاثنان، يُرفض الطلب فوراً برمز `401 Unauthorized`.
- في [`services/appointmentService.ts`](file:///e:/خاص%20روبو/bsch-clinics/services/appointmentService.ts):
  - دعم البحث عن الموعد بواسطة المعرف الداخلي `id` أو الرقم المرجعي `referenceNumber`.
  - التحقق من مطابقة رقم الهاتف المقدم مع رقم هاتف الحجز بعد التطبيع القياسي.
  - تقييد الأطباء وموظفي الاستقبال بعياداتهم المخصصة عند الإلغاء.
- في [`app/appointments/track/page.tsx`](file:///e:/خاص%20روبو/bsch-clinics/app/appointments/track/page.tsx):
  - تمرير `phoneNumber: phoneQuery.trim()` في جسم الطلب لتأكيد صلاحية ولي الأمر.

### 2. معالجة تسلسل الأرقام المرجعية وتفادي الاقتطاع (SEC-02, SEC-03)
- في [`supabase/migrations/20261101020000`](file:///e:/خاص%20روبو/bsch-clinics/supabase/migrations/20261101020000_clinic_services_capacity_and_schedules.sql):
  - إضافة كتلة `DO $$` لمزامنة التسلسل تلقائياً مع أعلى رقم موجود:
    ```sql
    SELECT COALESCE(MAX(SUBSTRING(reference_number FROM '^BSCH-([0-9]+)$')::BIGINT), 999)
    INTO v_max_ref FROM public.appointments WHERE reference_number ~ '^BSCH-[0-9]+$';
    IF v_max_ref >= 1000 THEN
      PERFORM setval('public.seq_appointment_reference_number', v_max_ref, true);
    END IF;
    ```
  - تعديل تنسيق الرقم المرجعي لمنع الاقتطاع عند الأرقام التي تتجاوز 9999:
    ```sql
    v_next_val := nextval('public.seq_appointment_reference_number');
    v_ref := 'BSCH-' || CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, '0') ELSE v_next_val::text END;
    ```

### 3. محاذاة التوقيت الصريح مع توقيت القاهرة (SEC-04)
- في `book_appointment_atomic` و `track_appointments_by_phone`:
  - تعريف تاريخ اليوم الصريح بتوقيت مصر:
    ```sql
    v_today_cairo DATE := (timezone('Africa/Cairo', now()))::date;
    ```
  - استخدام `v_today_cairo` في التحقق من التواريخ السابقة، وأفق الـ 30 يوماً، واستعلام التتبع، مما يمنع أي ارتباك في الحسابات الزمنية عند حدود منتصف الليل.

### 4. عزل عيادة موظف الاستقبال في التحديث والنداء (SEC-05)
- في `updateStatus` و `recallPatient` بملف `appointmentService.ts`:
  - منع موظف الاستقبال المقيد بعيادة معينة من نداء أو تعديل حالة مريض مسجل بعيادة أخرى.

---

## 6. التحقق من سيناريوهات الهجمات العشرين (Attack Scenarios Verification)

| م | السيناريو الاختباري | نتيجة الاختبار الفعلي | الدليل البرمجي والملف |
|:---:|---|:---:|---|
| 1 | محاولة مستخدم مجهول قراءة الحجوزات مباشرة | **VERIFIED** | سياسات RLS تسحب كافة الصلاحيات (`REVOKE ALL FROM PUBLIC, anon, authenticated`) في `20261101010000`. |
| 2 | محاولة موظف استقبال حجز مريض بعيادة أخرى | **VERIFIED** | التحقق من `v_staff_record.clinic_id != p_clinic_id` داخل RPC ومسار `/api/appointments/walk-in` (مختبر بـ `Security 18`). |
| 3 | محاولة طبيب الوصول لعيادة أخرى | **VERIFIED** | قيد العيادة في `getStaffAppointments` و `transferClinic` و `updateStatus` (مختبر بـ `Security 2` و `Security 3`). |
| 4 | موظف غير نشط يحاول استخدام جلسة قديمة | **VERIFIED** | استعلام `AuthService.verifySession` يتحقق من `is_active === true` في `staff_profiles` ويرفض الحساب فوراً (مختبر بـ `Security 22`). |
| 5 | تزوير `staff_user_id` من العميل | **VERIFIED** | الاعتماد الحصري على الجلسة الموثقة من الخادم `auth.uid()` أو فحص السجل النشط (مختبر بـ `Security 5`). |
| 6 | تخمين بيانات الحجز برقم الهاتف | **VERIFIED** | تقييد المعدل + Turnstile + حجب الاسم الثلاثي + زمن استجابة ثابت (مختبر بـ `OTP Invariant 10`). |
| 7 | تكرار حجز نفس الطفل في نفس اليوم | **VERIFIED** | الفهرس المركب `idx_unique_active_apt_per_phone_patient_clinic_day` وفحص RPC يمنعان التكرار (مختبر بـ `Security 6`). |
| 8 | حجز طفلين (إخوة) بنفس رقم الهاتف | **VERIFIED** | مسموح به بفضل تضمين اسم المريض المطبّع في الفهرس (مختبر بـ `Sibling bookings`). |
| 9 | تجاوز السعة اليومية بطلبات متزامنة | **VERIFIED** | القفل الاستشاري `pg_advisory_xact_lock` يسلسل العمليات لكل عيادة ويمنع التجاوز (مختبر بـ `Security 13`). |
| 10 | الحجز أثناء إغلاق العيادة | **VERIFIED** | فحص جدول الاستثناءات `clinic_schedules` والعطلات الأسبوعية (مختبر بـ `Security 12`). |
| 11 | حجز خدمة لا تتبع العيادة | **VERIFIED** | التحقق الصارم من تبعية `service_id` للعيادة داخل RPC (مختبر في `book_appointment_atomic logic`). |
| 12 | تجاوز حد المعدل (Rate Limit) | **VERIFIED** | حظر الطلب وإرجاع `429 Too Many Requests` مع مؤقت انتظار (مختبر بـ `OTP Invariant 3`). |
| 13 | إعادة استخدام رمز OTP مستهلك | **VERIFIED** | حذف السجل فور التحقق الناجح لمنع Replay Attacks (مختبر بـ `OTP Invariant 2`). |
| 14 | فشل Supabase أثناء الحجز | **VERIFIED** | فشل الحجز دون إصدار تذكرة مزيفة أو سقوط في الذاكرة بالإنتاج (مختبر بـ `Persistence Test 1`). |
| 15 | فشل Supabase أثناء فحص Rate Limit | **VERIFIED** | الإغلاق الآمن في الإنتاج `Fail-Closed` برفض الطلب بدلاً من فتحه (مختبر بـ `Security 17`). |
| 16 | تصادم الرقم المرجعي وتجاوز 9999 | **VERIFIED** | تسلسل PostgreSQL + حلقة إعادة محاولة + منع الاقتطاع (مختبر بـ `Security 20` و `Security 23`). |
| 17 | تعديل حجز مكتمل أو ملغي مسبقاً | **VERIFIED** | حظر فتح الحجوزات المنتهية إلا لمدير النظام (مختبر بـ `Security 7`). |
| 18 | محاولة تسريب الرقم القومي لولي الأمر | **VERIFIED** | استبعاد الرقم القومي تماماً من استعلامات التتبع العامة (مختبر بـ `Invariant D1`). |
| 19 | كشف الاسم الثلاثي للمريض علناً | **VERIFIED** | استخدام دالة `maskPatientName` لحجب الألقاب وإظهار الاسم الأول فقط (مختبر بـ `maskPatientName`). |
| 20 | تشغيل RPCs بصلاحيات anon أو public | **VERIFIED** | سحب كافة الصلاحيات وقصر التنفيذ على `service_role` (مختبر بـ `Supabase RLS matrix`). |

---

## 7. نتائج الاختبارات الآلية والتحقق البرمجي

### أ. نتائج حزمة الاختبارات الشاملة (`npm test`):
```
✔ 58 Tests Completed: 58 Passed, 0 Failed, 0 Skipped.
  - OTP Invariants: 10/10 Passed
  - Persistence Invariants: 2/2 Passed
  - Rules & Validations: 22/22 Passed
  - Advanced Security Invariants: 24/24 Passed
```

### ب. فحص المترجم الخالي من الأخطاء (`npx tsc --noEmit`):
- النتيجة: **نجاح تام (Code 0) بدون أي أخطاء نوعية أو تحذيرات.**

### ج. فحص بناء الإنتاج الشامل (`npm run build`):
- النتيجة: **نجاح تام لجميع مسارات التطبيق الـ 26 (Static & Dynamic API Routes).**

---

## 8. حالة ملف الهجرة وقائمة الفحص قبل التشغيل

ملف الهجرة المعتمد محلياً:  
[`supabase/migrations/20261101020000_clinic_services_capacity_and_schedules.sql`](file:///e:/خاص%20روبو/bsch-clinics/supabase/migrations/20261101020000_clinic_services_capacity_and_schedules.sql)

### الحالة:
**READY FOR MANUAL REVIEW AND STAGING VERIFICATION**  
(جاهز للمراجعة اليدوية والتنفيذ في بيئة الاختبار التجريبية Staging).

> [!IMPORTANT]
> تذكير صارم لمالك المشروع:
> 1. خذ نسخة احتياطية (Snapshot Backup) لقاعدة البيانات الحالية قبل أي تشغيل.
> 2. شغل استعلام الفحص المسبق الآمن (SELECT-only Preflight Query) للتأكد من عدم وجود صفوف مكررة مسبقاً.
> 3. لا تطبق الهجرة على الإنتاج مباشرة دون تشغيلها أولاً في بيئة Staging.

---

## 9. استعلام الفحص المسبق الآمن (SELECT-only Preflight Query)

```sql
-- ========================================================================
-- BSCH Clinics — استعلام تشخيصي مسبق للقراءة فقط (آمن 100%)
-- ========================================================================
SELECT 
  clinic_id, 
  phone_number, 
  lower(regexp_replace(trim(patient_name), '\s+', ' ', 'g')) AS normalized_patient_name, 
  appointment_date, 
  COUNT(*) AS duplicate_count,
  array_agg(id) AS appointment_ids,
  array_agg(reference_number) AS reference_numbers
FROM public.appointments
WHERE status != 'CANCELLED'
GROUP BY 
  clinic_id, 
  phone_number, 
  lower(regexp_replace(trim(patient_name), '\s+', ' ', 'g')), 
  appointment_date
HAVING COUNT(*) > 1;
```

---

## 10. المخاطر المتبقية وتوصيات ما قبل الإطلاق

1. **مفتاح Turnstile في بيئة الإنتاج:** التأكد من إدخال `TURNSTILE_SECRET_KEY` في متغيرات بيئة Vercel للإنتاج، حيث إن المنظومة مصممة للإغلاق الآمن (`Fail-Closed`) وحظر طلبات التتبع إذا لم يُهيأ المفتاح في بيئة الإنتاج.
2. **مزود الرسائل النصية SMS:** بناءً على متطلبات المستشفى المعتمدة، يعتمد التتبع حالياً على رقم هاتف ولي الأمر مع حماية Bot / Turnstile والحد من المعدل، دون إرسال رسائل نصية قصيرة SMS توفيراً للتكاليف.
3. **تطبيق الفهرس المركب:** يجب التحقق من عدم وجود حجوزات قديمة مكررة عبر استعلام الفحص المسبق قبل تشغيل ملف الهجرة.

