-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- File: supabase/seed/clinic_services_DRAFT.sql
-- Status: DRAFT — REQUIRES CLINICAL PHYSICIAN APPROVAL
-- ========================================================================
--
-- IMPORTANT SAFETY NOTICE:
-- 1. All service definitions, required documents, and preparation instructions
--    in this file are PROVISIONAL DRAFTS created for technical structure and testing.
-- 2. They have NOT been reviewed or officially approved by hospital physicians.
-- 3. All rows are inserted with `is_active = false`.
-- 4. They will NOT appear in the public booking dropdowns or public APIs until
--    an authorized administrator or medical director reviews and activates them
--    via the Staff CMS interface or explicitly sets `is_active = true`.
-- ========================================================================

INSERT INTO public.clinic_services (id, clinic_id, name, required_documents, instructions, display_order, is_active)
VALUES
  -- 1. Pediatric Dentistry (عيادة الأسنان)
  (
    'srv_dent_exam',
    'dentistry',
    'كشف وتشخيص أسنان الأطفال',
    ARRAY['أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي', 'أي أشعة سينية أو بانوراما سابقة للأسنان إن وجدت'],
    'DRAFT — requires approval from the hospital''s physicians. يرجى تنظيف أسنان الطفل بالفرشاة والمعجون جيداً قبل الحضور. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),
  (
    'srv_dent_pulp',
    'dentistry',
    'علاج العصب والحشو الوقائي للأطفال',
    ARRAY['شهادة ميلاد الطفل', 'الأشعة السابقة وفحوصات الأسنان'],
    'DRAFT — requires approval from the hospital''s physicians. الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء تسجيل التذكرة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    2,
    false
  ),

  -- 2. Echocardiography Unit (إيكو الأطفال)
  (
    'srv_echo_standard',
    'echo',
    'فحص موجات فوق صوتية على قلب الأطفال (إيكو)',
    ARRAY['أصل شهادة ميلاد الطفل', 'تقرير الطبيب المعالج المحول للفحص', 'أي فحوصات أو تقارير إيكو سابقة'],
    'DRAFT — requires approval from the hospital''s physicians. ارتداء ملابس خفيفة يسهل فتحها من منطقة الصدر لتيسير التصوير. الحضور قبل الموعد بـ 15 إلى 30 دقيقة مع الحرص على هدوء الطفل. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),

  -- 3. Pediatric Cardiology (قلب الأطفال)
  (
    'srv_cardio_exam',
    'cardio',
    'مناظرة وكشف قلب الأطفال والعيوب الخلقية',
    ARRAY['أصل شهادة ميلاد الطفل', 'رسم قلب (ECG) حديث إن وجد', 'تقارير الإيكو والفحوصات القلبية السابقة'],
    'DRAFT — requires approval from the hospital''s physicians. قياس العلامات الحيوية بغرفة الفحص الأولي أولاً. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),

  -- 4. Pediatric Surgery (جراحة الأطفال)
  (
    'srv_surg_consult',
    'surgery',
    'مناظرة وتقييم جراحة الأطفال العامة',
    ARRAY['أصل شهادة ميلاد الطفل ودفتر التطعيمات', 'فحوصات السونار والتحاليل المعملية السابقة'],
    'DRAFT — requires approval from the hospital''s physicians. ارتداء ملابس فضفاضة لتسهيل الفحص السريري. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),
  (
    'srv_surg_hernia',
    'surgery',
    'متابعة حالات الفتق والخصية المعلقة وجراحات البطن',
    ARRAY['شهادة ميلاد الطفل', 'تقارير السونار والعمليات الجراحية السابقة إن وجدت'],
    'DRAFT — requires approval from the hospital''s physicians. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    2,
    false
  ),

  -- 5. Gastroenterology & Hepatology (الجهاز الهضمي والكبد)
  (
    'srv_gi_consult',
    'gi',
    'كشف أمراض الجهاز الهضمي والكبد وسوء الامتصاص',
    ARRAY['أصل شهادة ميلاد الطفل', 'تحاليل الدم ووظائف الكبد السابقة', 'تقارير سونار البطن إن وجدت'],
    'DRAFT — requires approval from the hospital''s physicians. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),

  -- 6. Pediatric Neurology (المخ والأعصاب)
  (
    'srv_neuro_consult',
    'neuro',
    'كشف المخ والأعصاب ومتابعة التشنجات والصرع',
    ARRAY['أصل شهادة ميلاد الطفل ودفتر التطعيمات', 'أصل رسم المخ (EEG) وصور الرنين المغناطيسي (MRI) إن وجدت'],
    'DRAFT — requires approval from the hospital''s physicians. إحضار أي مقاطع فيديو موثقة للحركات غير الطبيعية بالهاتف. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),

  -- 7. Audiology Clinic (السمعيات والتخاطب)
  (
    'srv_audio_abr',
    'audiology',
    'فحص وقياس استجابة السمع بجذع المخ (ABR)',
    ARRAY['أصل شهادة ميلاد الطفل', 'نتائج فحص المسح السمعي لحديثي الولادة'],
    'DRAFT — requires approval from the hospital''s physicians. التأكد من نظافة أذن الطفل التامة قبل الفحص. في قياس ABR يفضل أن يكون الرضيع في نوم عميق. الحضور قبل الموعد بـ 15 إلى 30 دقيقة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  ),

  -- 8. Clinical Nutrition (التغذية العلاجية)
  (
    'srv_nutr_assess',
    'nutrition',
    'تقييم التغذية العلاجية ومتابعة النمو وحساسية الطعام',
    ARRAY['شهادة ميلاد الطفل ودفتر التطعيمات الموثق به الوزن والطول منذ الولادة', 'تحاليل صورة الدم الشاملة وفيتامين د إن وجدت'],
    'DRAFT — requires approval from the hospital''s physicians. الحضور قبل الموعد بـ 15 إلى 30 دقيقة لتسجيل القياسات الحيوية. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    1,
    false
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  required_documents = EXCLUDED.required_documents,
  instructions = EXCLUDED.instructions,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

