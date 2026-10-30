-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Website Content Management System (CMS) Schema & Security Policies
-- Migration: 20261029000000_website_cms_schema.sql
-- ========================================================================
--
-- This migration provides:
-- 1. `website_settings`: Global brand identity, notice bar, emergency hotline, contacts, and SEO.
-- 2. `homepage_sections`: Reorderable, toggleable section content blocks for the public homepage.
-- 3. `navigation_items`: Public navbar and footer link management.
-- 4. Safe extension of `clinics` with presentation-only attributes (display order, color, icon, english title).
-- 5. Supabase Storage bucket `public-cms-assets` with secured upload policies.
-- 6. Strict RLS policies: Public (anon) read-only, Admin (authenticated ADMIN role) full control.
-- ========================================================================

-- Enable core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------
-- 1. Website Settings Table (إعدادات وهوية الموقع العامة)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_name TEXT NOT NULL DEFAULT 'BSCH Clinics',
  site_tagline TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة',
  header_logo_url TEXT NOT NULL DEFAULT '/logo-outpatient.png',
  footer_logo_url TEXT NOT NULL DEFAULT '/logo-main.png',
  favicon_url TEXT NOT NULL DEFAULT '/favicon.ico',
  contact_phone TEXT NOT NULL DEFAULT '',
  emergency_hotline TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  hospital_address TEXT NOT NULL DEFAULT 'أبو حمص – دمسنا – محافظة البحيرة',
  working_hours TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  meta_description TEXT NOT NULL DEFAULT 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  og_image_url TEXT NOT NULL DEFAULT '/logo-main.png',
  canonical_url TEXT DEFAULT 'https://bsch-clinics.gov.eg',
  social_links JSONB NOT NULL DEFAULT '[
    {"platform": "facebook", "label": "فيسبوك", "url": "https://facebook.com", "is_active": true},
    {"platform": "youtube", "label": "يوتيوب", "url": "https://youtube.com", "is_active": false},
    {"platform": "mohp", "label": "وزارة الصحة", "url": "https://mohp.gov.eg", "is_active": true}
  ]'::jsonb,
  notice_bar JSONB NOT NULL DEFAULT '{
    "is_enabled": true,
    "title": "تنظيم العيادات الخارجية:",
    "message": "الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.",
    "hotline_label": "مستشفى الأطفال التخصصي — دمسنا"
  }'::jsonb,
  footer_summary TEXT NOT NULL DEFAULT 'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة والمحافظات المجاورة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  footer_copyright TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  footer_status_badge TEXT NOT NULL DEFAULT 'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢',
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT DEFAULT 'admin'
);

-- ------------------------------------------------------------------------
-- 2. Homepage Sections Table (أقسام ومحتوى الصفحة الرئيسية)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id VARCHAR(50) PRIMARY KEY, -- 'hero', 'trust_stats', 'primary_actions', 'clinics', 'how_it_works', 'hospital_banner', 'patient_guidelines', 'faq'
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  title TEXT,
  subtitle TEXT,
  badge_text TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT DEFAULT 'admin'
);

-- ------------------------------------------------------------------------
-- 3. Navigation Items Table (عناصر القوائم والروابط العامة)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_external BOOLEAN NOT NULL DEFAULT false,
  location VARCHAR(30) NOT NULL DEFAULT 'HEADER', -- 'HEADER', 'FOOTER_QUICK', 'FOOTER_LEGAL'
  icon_name VARCHAR(50) DEFAULT 'Link',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------
-- 4. Extend Clinics Table with Presentation Attributes Safely
-- ------------------------------------------------------------------------
-- Note: Operational and clinical columns (max_daily_slots, is_hospital_confirmed, days_of_week)
-- are STRICTLY preserved and unaffected.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured_on_homepage BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS english_title TEXT,
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#087F78',
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(50) DEFAULT 'Stethoscope';

-- ------------------------------------------------------------------------
-- 5. Seed Initial CMS Data (Matches current live frontend exactly)
-- ------------------------------------------------------------------------

-- Insert default website settings if not present
INSERT INTO public.website_settings (
  id,
  site_name,
  site_tagline,
  header_logo_url,
  footer_logo_url,
  contact_phone,
  emergency_hotline,
  contact_email,
  hospital_address,
  working_hours,
  meta_title,
  meta_description,
  footer_summary,
  footer_copyright,
  footer_status_badge
)
VALUES (
  'default',
  'BSCH Clinics',
  'مستشفى الأطفال التخصصي بالبحيرة',
  '/logo-outpatient.png',
  '/logo-main.png',
  '',
  '',
  '',
  'أبو حمص – دمسنا – محافظة البحيرة',
  '',
  'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة والمحافظات المجاورة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢'
)
ON CONFLICT (id) DO NOTHING;

-- Seed Navigation Items (Header & Footer)
INSERT INTO public.navigation_items (label, href, display_order, is_visible, is_external, location, icon_name)
VALUES
  ('الرئيسية', '/', 1, true, false, 'HEADER', 'Home'),
  ('حجز موعد', '/appointments/new', 2, true, false, 'HEADER', 'CalendarPlus'),
  ('متابعة حجز', '/appointments/track', 3, true, false, 'HEADER', 'Search'),
  ('موقع المستشفى', 'https://mohp.gov.eg', 4, true, true, 'HEADER', 'ExternalLink'),
  ('حجز موعد جديد بالعيادات', '/appointments/new', 1, true, false, 'FOOTER_QUICK', 'CalendarPlus'),
  ('متابعة حالة الحجز وتعليمات الحضور', '/appointments/track', 2, true, false, 'FOOTER_QUICK', 'Search'),
  ('موقع وزارة الصحة والسكان', 'https://mohp.gov.eg', 3, true, true, 'FOOTER_QUICK', 'ExternalLink')
ON CONFLICT DO NOTHING;

-- Seed Homepage Sections (Matching current live content)
INSERT INTO public.homepage_sections (id, display_order, is_visible, title, subtitle, badge_text, content)
VALUES
  (
    'hero',
    1,
    true,
    'العيادات الخارجية',
    'مستشفى الأطفال التخصصي بالبحيرة',
    'الحجز الإلكتروني متاح الآن لجميع عيادات الأسبوع',
    '{
      "description": "منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة. احجز موعدك بالاسم ورقم الهاتف بدون تسجيل حساب، وتجنب طوابير الانتظار.",
      "primary_cta_label": "احجز موعدك الآن",
      "primary_cta_url": "/appointments/new",
      "primary_cta_visible": true,
      "secondary_cta_label": "متابعة حجز قائم",
      "secondary_cta_url": "/appointments/track",
      "secondary_cta_visible": true,
      "feature_card_title": "مميزات الحجز الإلكتروني",
      "feature_card_badge": "خدمة معتمدة",
      "feature_card_bullets": [
        {"icon": "Clock", "title": "زمن الحجز: دقيقة واحدة", "desc": "خطوات مبسطة وسلسة تناسب كافة الهواتف الذكية."},
        {"icon": "Smartphone", "title": "المتطلبات: الاسم ورقم الهاتف فقط", "desc": "بدون الحاجة لإنشاء حساب أو تذكر كلمات مرور معقدة."},
        {"icon": "Ticket", "title": "إيصال فوري برقم الدور", "desc": "تحديد موعد وتوقيت الحضور مع إمكانية طباعة الإيصال وحفظه."}
      ],
      "feature_card_footer": "مستشفى الأطفال التخصصي — أبو حمص – دمسنا – محافظة البحيرة"
    }'::jsonb
  ),
  (
    'trust_stats',
    2,
    true,
    'مؤشرات وإحصائيات المستشفى',
    'أرقام موثقة تعكس حجم الخدمة الطبية المتطورة',
    NULL,
    '{
      "items": [
        {"value": "٨ عيادات", "label": "عيادات تخصصية دقيقة", "desc": "قلب، أعصاب، أسنان، جراحة، وغيرها", "icon": "Stethoscope", "accent_color": "#087F78", "bg_color": "bg-emerald-50 text-emerald-700 border-emerald-100"},
        {"value": "١٠٠٪ رقمي", "label": "حجز إلكتروني منظم", "desc": "بدون طوابير شباك وبأرقام دور متتابعة", "icon": "CalendarCheck2", "accent_color": "#0D5F5A", "bg_color": "bg-teal-50 text-teal-700 border-teal-100"},
        {"value": "نخبة طبية", "label": "أطباء واستشاريون", "desc": "كوادر مؤهلة في طب وجراحة الأطفال", "icon": "Award", "accent_color": "#0284C7", "bg_color": "bg-sky-50 text-sky-700 border-sky-100"},
        {"value": "رعاية فائقة", "label": "أحدث التجهيزات الطبية", "desc": "عيادات تخصصية متكاملة لخدمة أطفال البحيرة", "icon": "ShieldCheck", "accent_color": "#087F78", "bg_color": "bg-emerald-50/70 text-emerald-800 border-emerald-200/60"}
      ]
    }'::jsonb
  ),
  (
    'primary_actions',
    3,
    true,
    'الإجراءات الرئيسية',
    'اختر مسارك السريع للوصول إلى الخدمة',
    NULL,
    '{
      "card1_title": "حجز موعد جديد",
      "card1_desc": "بدون تسجيل حساب – الاسم ورقم الهاتف فقط لاختيار العيادة والموعد المناسب.",
      "card1_btn": "ابدأ الحجز الآن",
      "card1_url": "/appointments/new",
      "card2_title": "متابعة حجزي",
      "card2_desc": "معرفة حالة الحجز، تأكيد الموعد، ورقم الدور وتعليمات الحضور برقم هاتفك.",
      "card2_btn": "استعلم عن حجزك",
      "card2_url": "/appointments/track"
    }'::jsonb
  ),
  (
    'clinics',
    4,
    true,
    'دليل العيادات التخصصية المتاحة',
    'استعرض التخصصات الدقيقة بمستشفى الأطفال التخصصي بالبحيرة واحجز موعد طفلك مباشرة في العيادة المناسبة.',
    'العيادات الخارجية التخصصية',
    '{
      "link_text": "عرض جدول كافة العيادات",
      "link_url": "/appointments/new"
    }'::jsonb
  ),
  (
    'how_it_works',
    5,
    true,
    'كيف يعمل النظام؟',
    'خطوات بسيطة وواضحة لتنظيم زيارة طفلك للعيادات الخارجية بكل سهولة',
    NULL,
    '{
      "steps": [
        {"num": "١. احجز", "title": "احجز موعدك", "desc": "اختر العيادة واليوم والموعد المناسب — يصل طلبك لموظف الحجز للمراجعة والتأكيد.", "icon": "Calendar"},
        {"num": "٢. تأكيد الحجز", "title": "تأكيد الحجز", "desc": "عند التأكيد يصبح حجزك مؤكدًا، وتظهر لك تعليمات الحضور والأوراق المطلوبة مع إمكانية طباعة الإيصال.", "icon": "ShieldCheck"},
        {"num": "٣. الحضور والكشف", "title": "الحضور والكشف بالعيادة", "desc": "حضور المريض في الموعد المحدد وتنظيم الكشف بالعيادة، مع إمكانية التحويل بين العيادات بنفس حجزك.", "icon": "UserCheck"}
      ]
    }'::jsonb
  ),
  (
    'hospital_banner',
    6,
    true,
    'مستشفى الأطفال التخصصي بالبحيرة',
    'زر موقع المستشفى الرسمي لمعرفة المزيد عن الخدمات والأقسام الطبية',
    NULL,
    '{
      "btn_label": "زيارة الموقع",
      "btn_url": "https://mohp.gov.eg",
      "icon": "Clock"
    }'::jsonb
  ),
  (
    'patient_guidelines',
    7,
    true,
    'تعليمات هامة لأولياء الأمور',
    'كل ما يهمك معرفته لضمان كشف ميسر وتجربة علاجية متكاملة لطفلك',
    NULL,
    '{
      "cards": [
        {
          "title": "ما يجب إحضاره عند الحضور",
          "icon": "FileText",
          "color": "#087F78",
          "items": [
            "شهادة ميلاد الطفل أو بطاقة التأمين الصحي (إن وجدت)",
            "أي تقارير طبية، فحوصات، تحاليل، أو أشعات سابقة تخص الحالة",
            "كتابة اسم الأدوية التي يتناولها الطفل بانتظام"
          ]
        },
        {
          "title": "إرشادات وتنظيم الحضور",
          "icon": "AlertCircle",
          "color": "#D97706",
          "items": [
            "يرجى الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء إجراءات التأكيد",
            "يُسمح بمرافق واحد فقط مع الطفل لتجنب الزحام وحرصاً على سلامة الأطفال",
            "في حال التعذر عن الحضور يرجى إلغاء الموعد لإتاحة الفرصة لطفل آخر"
          ]
        },
        {
          "title": "التواصل والاستفسارات",
          "icon": "PhoneCall",
          "color": "#2563EB",
          "items": [
            "مقر المستشفى: أبو حمص – دمسنا – محافظة البحيرة",
            "تنظيم الدخول: بأسبقية الحضور وتذاكر الانتظار اليومية",
            "الاستعلام وتأكيد الحجز إلكترونياً بالاسم ورقم الهاتف فقط"
          ]
        }
      ]
    }'::jsonb
  ),
  (
    'faq',
    8,
    true,
    'الأسئلة الشائعة لأولياء الأمور',
    'إجابات واضحة ومباشرة عن كافة الاستفسارات المتعلقة بنظام الحجز الإلكتروني ومواعيد الزيارة.',
    'مركز المساعدة والإرشادات',
    '{
      "items": [
        {
          "question": "هل أحتاج لإنشاء حساب أو إدخال كلمة مرور لحجز موعد لطفلي؟",
          "answer": "لا، إطلاقاً. حرصاً على التيسير وسرعة الخدمة لأولياء الأمور، لا يتطلب النظام إنشاء أي حساب أو كلمة مرور. يمكنك حجز الموعد مباشرة بإدخال اسم الطفل ورقم هاتف ولي الأمر لاختيار العيادة والموعد المناسب في أقل من دقيقة.",
          "category": "إجراءات الحجز"
        },
        {
          "question": "ما هي الخطوات الواجب اتباعها عند الوصول إلى المستشفى في يوم الموعد؟",
          "answer": "يرجى التوجه إلى مكتب الاستقبال بالدور الأرضي بمبنى العيادات الخارجية قبل موعدك بـ 15 إلى 30 دقيقة، مع إبراز الرقم المرجعي (BSCH-XXXX) أو إيصال الحجز المطبوع لتأكيد الحضور واستلام تذكرة الدخول للعيادة وتنسيق النداء الآلي.",
          "category": "يوم الكشف"
        },
        {
          "question": "هل يمكنني إلغاء الموعد إذا طرأ ظرف حال دون الحضور؟",
          "answer": "نعم، يمكنك إلغاء الموعد بكل سهولة في أي وقت عبر الدخول إلى صفحة \"متابعة حجز\" وإدخال الرقم المرجعي ورقم الهاتف المسجل، ثم الضغط على زر \"إلغاء الموعد\". نرجو المبادرة بالإلغاء لإتاحة الفرصة لطفل آخر في قائمة الانتظار.",
          "category": "التعديل والإلغاء"
        },
        {
          "question": "ما هي المستندات والتحاليل الواجب إحضارها عند الكشف بالعيادة؟",
          "answer": "يرجى إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي، بالإضافة إلى أي تقارير طبية، فحوصات، تحاليل، رسم قلب، أو أشعات سابقة تتعلق بالحالة، مع تدوين قائمة الأدوية التي يتناولها الطفل بانتظام لمناظرتها مع الاستشاري المعالج.",
          "category": "المستندات والفحوصات"
        },
        {
          "question": "كيف يتم تنظيم الحضور واستقبال الأطفال في العيادات الخارجية؟",
          "answer": "تعمل العيادات الخارجية التخصصية بنظام الحجز المسبق والتذاكر اليومية، ويتم استقبال المرضى وتنظيم دخولهم بأسبقية الحضور.",
          "category": "المواعيد والتنظيم"
        }
      ]
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- Populate presentation attributes for clinics if already in clinics table
UPDATE public.clinics SET english_title = 'Pediatric Cardiology', accent_color = '#DC2626', icon_name = 'HeartPulse', display_order = 1 WHERE id = 'cardio';
UPDATE public.clinics SET english_title = 'Echocardiography Unit', accent_color = '#0284C7', icon_name = 'Activity', display_order = 2 WHERE id = 'echo';
UPDATE public.clinics SET english_title = 'Pediatric Dentistry', accent_color = '#0D9488', icon_name = 'Smile', display_order = 3 WHERE id = 'dentistry';
UPDATE public.clinics SET english_title = 'Pediatric Neurology', accent_color = '#7C3AED', icon_name = 'Brain', display_order = 4 WHERE id = 'neuro';
UPDATE public.clinics SET english_title = 'Gastroenterology & Hepatology', accent_color = '#D97706', icon_name = 'Pill', display_order = 5 WHERE id = 'gi';
UPDATE public.clinics SET english_title = 'Clinical Nutrition', accent_color = '#16A34A', icon_name = 'Baby', display_order = 6 WHERE id = 'nutrition';
UPDATE public.clinics SET english_title = 'Audiology Clinic', accent_color = '#2563EB', icon_name = 'Ear', display_order = 7 WHERE id = 'audiology';
UPDATE public.clinics SET english_title = 'Pediatric Surgery', accent_color = '#E11D48', icon_name = 'Scissors', display_order = 8 WHERE id = 'surgery';

-- ------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------

-- 1. Website Settings
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published website settings" ON public.website_settings;
CREATE POLICY "Public can view published website settings"
  ON public.website_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage website settings" ON public.website_settings;
CREATE POLICY "Admin can manage website settings"
  ON public.website_settings FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 2. Homepage Sections
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view homepage sections" ON public.homepage_sections;
CREATE POLICY "Public can view homepage sections"
  ON public.homepage_sections FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admin can manage homepage sections"
  ON public.homepage_sections FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- 3. Navigation Items
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view navigation items" ON public.navigation_items;
CREATE POLICY "Public can view navigation items"
  ON public.navigation_items FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage navigation items" ON public.navigation_items;
CREATE POLICY "Admin can manage navigation items"
  ON public.navigation_items FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ------------------------------------------------------------------------
-- 7. Supabase Storage Bucket for CMS Assets
-- ------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-cms-assets',
  'public-cms-assets',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

-- Storage RLS: Public can view assets
DROP POLICY IF EXISTS "Public Access to CMS Assets" ON storage.objects;
CREATE POLICY "Public Access to CMS Assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'public-cms-assets');

-- Storage RLS: Only authenticated Admin can upload / update / delete assets
DROP POLICY IF EXISTS "Admin can upload CMS Assets" ON storage.objects;
CREATE POLICY "Admin can upload CMS Assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Admin can update CMS Assets" ON storage.objects;
CREATE POLICY "Admin can update CMS Assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Admin can delete CMS Assets" ON storage.objects;
CREATE POLICY "Admin can delete CMS Assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

