-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بدمسنا
-- DRAFT — must be reviewed and approved by the hospital's physicians before publishing.
-- File: supabase/seed/clinic_instructions_DRAFT.sql
-- ========================================================================
--
-- IMPORTANT CLINICAL & SAFETY NOTICE:
-- 1. All medical instructions below are DRAFTS prepared for clinical review.
-- 2. Specific fasting durations and medication/stimulant advice have been strictly removed.
-- 3. Any clinical instructions regarding fasting or medication must be confirmed directly
--    by the attending physician or hospital administration.
-- 4. This script strictly uses:
--      WHERE (instructions IS NULL OR trim(instructions) = '')
--    to ensure it NEVER overwrites instructions edited or customized in the CMS.
-- ========================================================================

-- 1. Pediatric Surgery (جراحة الأطفال)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل ودفتر التطعيمات والبطاقة الصحية.
• إحضار كافة التقارير الطبية والتحاليل المعملية وفحوصات السونار أو الأشعة السابقة إن وُجدت.
• ارتداء الطفل ملابس قطنية فضفاضة ومريحة لتيسير الفحص السريري الدقيق.
• الحضور إلى مكتب الاستقبال قبل الموعد بـ 15 إلى 30 دقيقة لتأكيد الحضور وإنهاء إجراءات التذكرة.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'surgery' AND (instructions IS NULL OR trim(instructions) = '');

-- 2. Pediatric Cardiology (قلب الأطفال)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي.
• إحضار رسم القلب (ECG)، وتقارير الموجات فوق الصوتية (Echo)، وأي فحوصات سابقة إن وُجدت.
• التوجه لغرفة الفحص الأولي بالدور الأرضي لقياس العلامات الحيوية (النبض وضغط الدم) قبل الدخول.
• الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء إجراءات التسجيل وتأكيد الدور.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'cardio' AND (instructions IS NULL OR trim(instructions) = '');

-- 3. Echocardiography Unit (إيكو الأطفال)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل وتقرير الطبيب المحول للفحص.
• إحضار كافة التقارير والفحوصات القلبية السابقة لمقارنة قياسات عضلة القلب والصمامات.
• ارتداء ملابس خفيفة يسهل فتحها من منطقة الصدر لتيسير التصوير بالموجات فوق الصوتية.
• الحضور في الموعد المحدد مع الحرص على تهدئة الطفل وتجنب إجهاده قبل بدء الفحص.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'echo' AND (instructions IS NULL OR trim(instructions) = '');

-- 4. Pediatric Dentistry (طب وجراحة أسنان الأطفال)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي إن وجدت.
• تنظيف أسنان وفم الطفل جيداً بالفرشاة والمعجون قبل الحضور للعيادة.
• إحضار أي أشعة بانوراما أو صور أشعة سينية موضعية سابقة للأسنان إن توفرت.
• الحضور قبل موعد الكشف بـ 15 إلى 30 دقيقة لإنهاء تسجيل تذكرة الانتظار.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'dentistry' AND (instructions IS NULL OR trim(instructions) = '');

-- 5. Gastroenterology & Hepatology (الجهاز الهضمي والكبد)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل ودفتر المتابعة الصحية.
• إحضار كافة الفحوصات والتحاليل المعملية السابقة (صورة دم، تحاليل براز، وظائف كبد) وأشعة السونار إن وُجدت.
• الحضور قبل الموعد المحدد بـ 15 إلى 30 دقيقة لتنسيق الدخول مع تمريض العيادة.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'gi' AND (instructions IS NULL OR trim(instructions) = '');

-- 6. Pediatric Neurology (المخ والأعصاب)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل ودفتر التطعيمات لمتابعة منحنى التطور الحركي والعصبي.
• إحضار أصل رسم المخ الكهربائي (EEG)، وتقارير وأفلام الرنين المغناطيسي (MRI)، أو الأشعة المقطعية الحديثة.
• إحضار أي تسجيلات فيديو توثيقية لنوبات الحركة غير المعتادة إن كانت متوفرة على هاتف ولي الأمر.
• الحضور قبل الموعد بـ 15 إلى 30 دقيقة.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'neuro' AND (instructions IS NULL OR trim(instructions) = '');

-- 7. Audiology Clinic (السمعيات والتخاطب)
UPDATE public.clinics
SET instructions = 
'• إحضار أصل شهادة ميلاد الطفل ونتيجة فحص المسح السمعي لحديثي الولادة إن وُجدت.
• التأكد من نظافة أذن الطفل وخلوها من الالتهابات الحادة أو الإفرازات الظاهرة قبل الفحص.
• الحضور قبل الموعد المحدد بـ 15 إلى 30 دقيقة لتجهيز الطفل للفحص السمعي.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'audiology' AND (instructions IS NULL OR trim(instructions) = '');

-- 8. Clinical Nutrition (التغذية العلاجية)
UPDATE public.clinics
SET instructions = 
'• إحضار شهادة ميلاد الطفل ودفتر التطعيمات الموثق به قياسات الوزن والطول منذ الولادة.
• إحضار أحدث تحاليل معملية متوفرة (صورة دم كاملة، نسبة الحديد، الكالسيوم، وفيتامين د).
• الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء تسجيل الوزن والقياسات الحيوية.
• التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.'
WHERE id = 'nutrition' AND (instructions IS NULL OR trim(instructions) = '');

