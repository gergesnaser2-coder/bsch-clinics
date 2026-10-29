-- ============================================================================
-- Migration: Add and Seed Dynamic Clinic Instructions & Required Documents
-- Description: Ensures `instructions` column exists on `public.clinics` and
--              seeds realistic, medically sound instructions in Arabic.
-- ============================================================================

-- 1. Ensure column exists (Idempotent)
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS instructions TEXT;

-- 2. Add column comment for documentation
COMMENT ON COLUMN public.clinics.instructions IS 'Medical preparation instructions, fasting rules, and required documents shown to patients upon booking.';

-- 3. Seed realistic pediatric outpatient instructions in Arabic
UPDATE public.clinics
SET instructions = 'يرجى مراجعة غرفة العلامات الحيوية لقياس النبض وضغط الدم أولاً. يلزم إحضار رسم القلب (ECG)، أو تقارير الإيكو وأشعة الصدر السابقة إن وُجدت، مع قائمة بجميع أدوية القلب التي يتناولها الطفل بانتظام.'
WHERE id = 'cardio';

UPDATE public.clinics
SET instructions = 'يلزم إحضار تقرير الطبيب المعالج، وفحوصات الموجات الصوتية السابقة على القلب. يُفضل أن يكون الطفل في حالة شبع وهدوء أو وقت قيلولة لضمان دقة وسرعة تصوير عضلة وصمامات القلب بالموجات فوق الصوتية.'
WHERE id = 'echo';

UPDATE public.clinics
SET instructions = 'إحضار بطاقة التأمين الصحي وشهادة ميلاد الطفل. يُنصح بتناول وجبة خفيفة قبل الحضور بنصف ساعة وتنظيف الأسنان جيداً بالفرشاة والمعجون. يرجى تجنب إعطاء الطفل مسكنات قوية قبل موعد الكشف مباشرة.'
WHERE id = 'dentistry';

UPDATE public.clinics
SET instructions = 'الحضور صائماً لمدة لا تقل عن 4 إلى 6 ساعات للحالات التي تقرر لها فحص أو تدخل جراحي مجدول. يلزم إحضار التحاليل المعملية (صورة دم كاملة CBC، زمن النزف والتجلط PT/PC)، وتقارير أشعة السونار الخاصة بالحالة.'
WHERE id = 'surgery';

UPDATE public.clinics
SET instructions = 'إحضار التحاليل المعملية السابقة (وظائف كبد، حساسية القمح، صورة دم)، وأشعة السونار على البطن والحوض. يُفضل صيام الطفل ساعتين قبل الكشف لإمكانية إجراء الفحص السريري الدقيق للبطن والجهاز الهضمي.'
WHERE id = 'gi';

UPDATE public.clinics
SET instructions = 'إحضار أصل رسم المخ الكهربائي (EEG)، أو أشعة الرنين المغناطيسي (MRI)، أو الأشعة المقطعية الحديثة. يُرجى تدوين مواعيد وجرعات أدوية التشنجات والصرع، وتوثيق نوبات التشنج بمقطع فيديو بالهاتف إن أمكن.'
WHERE id = 'neuro';

UPDATE public.clinics
SET instructions = 'يشترط لإجراء فحص السمع الدقيق وضغط الأذن أن تكون أذن الطفل نظيفة وخالية من الشمع أو الالتهابات الحادة، وأن يكون الرضيع أو الطفل في حالة نوم عميق أو هدوء تام أثناء إجراء اختبار استجابة جذع المخ (ABR).'
WHERE id = 'audiology';

UPDATE public.clinics
SET instructions = 'إحضار بطاقة التطعيمات ودفتر متابعة نمو الطفل منذ الولادة. يُفضل تدوين جدول غذائي مفصل بما تناوله الطفل خلال الـ 3 أيام الماضية، مع إحضار تحاليل صورة الدم الشاملة ومستوى الحديد والكالسيوم وفيتامين د إن وُجدت.'
WHERE id = 'nutrition';

UPDATE public.clinics
SET instructions = 'إحضار دفتر متابعة الوزن والطول منذ الولادة، وأي تحاليل هرمونية سابقة (هرمون النمو، نشاط الغدة الدرقية TSH/Free T4، سكر تراكمي). يُشترط الحضور صائماً من 8 إلى 10 ساعات في حال طلب سحب عينات هرمونية بالعيادة.'
WHERE id = 'growth';

UPDATE public.clinics
SET instructions = 'إحضار مقياس السمع واختبارات الذكاء وتشتت الانتباه السابقة إن توفرت. يجب حضور أحد الوالدين الملازمين للطفل للإجابة عن أسئلة التقييم اللغوي والسلوكي بدقة.'
WHERE id = 'phonetics';

