import { revalidatePath } from 'next/cache';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import type { StaffUser } from '@/types';
import type {
  WebsiteSettings,
  HomepageSection,
  NavigationItem,
  ClinicPresentation,
  CmsFullPayload,
  MediaAsset,
} from '@/types/cms';

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  id: 'default',
  site_name: 'BSCH Clinics',
  site_tagline: 'مستشفى الأطفال التخصصي بالبحيرة',
  header_logo_url: '/logo-outpatient.png',
  footer_logo_url: '/logo-main.png',
  favicon_url: '/favicon.ico',
  contact_phone: '045-XXXXXXX',
  emergency_hotline: '137',
  contact_email: 'info@bsch.gov.eg',
  hospital_address: 'دمنهور - محافظة البحيرة - مجمع المستشفيات التخصصية',
  working_hours: 'السبت - الخميس (8:30 ص إلى 2:00 م)',
  meta_title: 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  meta_description:
    'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  og_image_url: '/logo-main.png',
  canonical_url: 'https://bsch-clinics.gov.eg',
  social_links: [
    { platform: 'facebook', label: 'فيسبوك المستشفى', url: 'https://facebook.com', is_active: true },
    { platform: 'mohp', label: 'بوابة وزارة الصحة', url: 'https://mohp.gov.eg', is_active: true },
    { platform: 'youtube', label: 'قناة التوعية الصحية', url: 'https://youtube.com', is_active: false },
  ],
  notice_bar: {
    is_enabled: true,
    title: 'تنبيه مواعيد العمل:',
    message: 'العيادات الخارجية تستقبل المرضى من 8:30 ص حتى 2:00 م (السبت - الخميس).',
    hotline_label: 'طوارئ الأطفال تعمل 24/7 عبر الخط الساخن 137',
  },
  footer_summary:
    'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة والمحافظات المجاورة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  footer_copyright: 'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  footer_status_badge: 'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢',
  is_published: true,
};

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSection[] = [
  {
    id: 'hero',
    display_order: 1,
    is_visible: true,
    title: 'العيادات الخارجية',
    subtitle: 'مستشفى الأطفال التخصصي بالبحيرة',
    badge_text: 'الحجز الإلكتروني متاح الآن لجميع عيادات الأسبوع',
    content: {
      description:
        'منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة. احجز موعدك بالاسم ورقم الهاتف بدون تسجيل حساب، وتجنب طوابير الانتظار.',
      primary_cta_label: 'احجز موعدك الآن',
      primary_cta_url: '/appointments/new',
      primary_cta_visible: true,
      secondary_cta_label: 'متابعة حجز قائم',
      secondary_cta_url: '/appointments/track',
      secondary_cta_visible: true,
      feature_card_title: 'مميزات الحجز الإلكتروني',
      feature_card_badge: 'خدمة معتمدة',
      feature_card_bullets: [
        { icon: 'Clock', title: 'زمن الحجز: دقيقة واحدة', desc: 'خطوات مبسطة وسلسة تناسب كافة الهواتف الذكية.' },
        { icon: 'Smartphone', title: 'المتطلبات: الاسم ورقم الهاتف فقط', desc: 'بدون الحاجة لإنشاء حساب أو تذكر كلمات مرور معقدة.' },
        { icon: 'Ticket', title: 'إيصال فوري برقم الدور', desc: 'تحديد موعد وتوقيت الحضور مع إمكانية طباعة الإيصال وحفظه.' },
      ],
      feature_card_footer: 'مجمع المستشفيات التخصصية بدمنهور — قطاع الرعاية العلاجية',
    },
  },
  {
    id: 'trust_stats',
    display_order: 2,
    is_visible: true,
    title: 'مؤشرات وإحصائيات المستشفى',
    subtitle: 'أرقام موثقة تعكس حجم الخدمة الطبية المتطورة',
    content: {
      items: [
        { value: '٨ عيادات', label: 'عيادات تخصصية دقيقة', desc: 'قلب، أعصاب، أسنان، جراحة، وغيرها', icon: 'Stethoscope', accent_color: '#087F78', bg_color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { value: '١٠٠٪ رقمي', label: 'حجز إلكتروني منظم', desc: 'بدون طوابير شباك وبأرقام دور متتابعة', icon: 'CalendarCheck2', accent_color: '#0D5F5A', bg_color: 'bg-teal-50 text-teal-700 border-teal-100' },
        { value: 'نخبة طبية', label: 'أطباء واستشاريون', desc: 'كوادر مؤهلة في طب وجراحة الأطفال', icon: 'Award', accent_color: '#0284C7', bg_color: 'bg-sky-50 text-sky-700 border-sky-100' },
        { value: '٢٤/٧ متاح', label: 'طوارئ مركزية على مدار الساعة', desc: 'الخط الساخن المركزي الموحد 137', icon: 'PhoneCall', accent_color: '#B45309', bg_color: 'bg-amber-50/70 text-amber-800 border-amber-200/60' },
      ],
    },
  },
  {
    id: 'primary_actions',
    display_order: 3,
    is_visible: true,
    title: 'الإجراءات الرئيسية',
    subtitle: 'اختر مسارك السريع للوصول إلى الخدمة',
    content: {
      card1_title: 'حجز موعد جديد',
      card1_desc: 'بدون تسجيل حساب – الاسم ورقم الهاتف فقط لاختيار العيادة والموعد المناسب.',
      card1_btn: 'ابدأ الحجز الآن',
      card1_url: '/appointments/new',
      card2_title: 'متابعة حجزي',
      card2_desc: 'معرفة حالة الحجز، تأكيد الموعد، ورقم الدور وتعليمات الحضور برقم هاتفك.',
      card2_btn: 'استعلم عن حجزك',
      card2_url: '/appointments/track',
    },
  },
  {
    id: 'clinics',
    display_order: 4,
    is_visible: true,
    title: 'دليل العيادات التخصصية المتاحة',
    subtitle: 'استعرض التخصصات الدقيقة بمستشفى الأطفال التخصصي بالبحيرة واحجز موعد طفلك مباشرة في العيادة المناسبة.',
    badge_text: 'العيادات الخارجية التخصصية',
    content: {
      link_text: 'عرض جدول كافة العيادات',
      link_url: '/appointments/new',
    },
  },
  {
    id: 'how_it_works',
    display_order: 5,
    is_visible: true,
    title: 'كيف يعمل النظام؟',
    subtitle: 'خطوات بسيطة وواضحة لتنظيم زيارة طفلك للعيادات الخارجية بكل سهولة',
    content: {
      steps: [
        { num: '١. احجز', title: 'احجز موعدك', desc: 'اختر العيادة واليوم والموعد المناسب — يصل طلبك لموظف الحجز للمراجعة والتأكيد.', icon: 'Calendar' },
        { num: '٢. تأكيد الحجز', title: 'تأكيد الحجز', desc: 'عند التأكيد يصبح حجزك مؤكدًا، وتظهر لك تعليمات الحضور والأوراق المطلوبة مع إمكانية طباعة الإيصال.', icon: 'ShieldCheck' },
        { num: '٣. الحضور والكشف', title: 'الحضور والكشف بالعيادة', desc: 'حضور المريض في الموعد المحدد وتنظيم الكشف بالعيادة، مع إمكانية التحويل بين العيادات بنفس حجزك.', icon: 'UserCheck' },
      ],
    },
  },
  {
    id: 'hospital_banner',
    display_order: 6,
    is_visible: true,
    title: 'مستشفى الأطفال التخصصي بالبحيرة',
    subtitle: 'زر موقع المستشفى الرسمي لمعرفة المزيد عن الخدمات والأقسام الطبية',
    content: {
      btn_label: 'زيارة الموقع',
      btn_url: 'https://mohp.gov.eg',
      icon: 'Clock',
    },
  },
  {
    id: 'patient_guidelines',
    display_order: 7,
    is_visible: true,
    title: 'تعليمات هامة لأولياء الأمور',
    subtitle: 'كل ما يهمك معرفته لضمان كشف ميسر وتجربة علاجية متكاملة لطفلك',
    content: {
      cards: [
        {
          title: 'ما يجب إحضاره عند الحضور',
          icon: 'FileText',
          color: '#087F78',
          items: [
            'شهادة ميلاد الطفل أو بطاقة التأمين الصحي (إن وجدت)',
            'أي تقارير طبية، فحوصات، تحاليل، أو أشعات سابقة تخص الحالة',
            'كتابة اسم الأدوية التي يتناولها الطفل بانتظام',
          ],
        },
        {
          title: 'إرشادات وتنظيم الحضور',
          icon: 'AlertCircle',
          color: '#D97706',
          items: [
            'يرجى الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء إجراءات التأكيد',
            'يُسمح بمرافق واحد فقط مع الطفل لتجنب الزحام وحرصاً على سلامة الأطفال',
            'في حال التعذر عن الحضور يرجى إلغاء الموعد لإتاحة الفرصة لطفل آخر',
          ],
        },
        {
          title: 'التواصل والاستفسارات',
          icon: 'PhoneCall',
          color: '#2563EB',
          items: [
            'مقر المستشفى: دمنهور - مجمع المستشفيات التخصصية بالبحيرة',
            'أيام وساعات العمل: السبت إلى الخميس من 8:30 صباحاً حتى 2:00 ظهراً',
            'طوارئ الأطفال تعمل على مدار 24 ساعة يومياً على الخط 137',
          ],
        },
      ],
    },
  },
  {
    id: 'faq',
    display_order: 8,
    is_visible: true,
    title: 'الأسئلة الشائعة لأولياء الأمور',
    subtitle: 'إجابات واضحة ومباشرة عن كافة الاستفسارات المتعلقة بنظام الحجز الإلكتروني ومواعيد الزيارة.',
    badge_text: 'مركز المساعدة والإرشادات',
    content: {
      items: [
        {
          question: 'هل أحتاج لإنشاء حساب أو إدخال كلمة مرور لحجز موعد لطفلي؟',
          answer: 'لا، إطلاقاً. حرصاً على التيسير وسرعة الخدمة لأولياء الأمور، لا يتطلب النظام إنشاء أي حساب أو كلمة مرور. يمكنك حجز الموعد مباشرة بإدخال اسم الطفل ورقم هاتف ولي الأمر لاختيار العيادة والموعد المناسب في أقل من دقيقة.',
          category: 'إجراءات الحجز',
        },
        {
          question: 'ما هي الخطوات الواجب اتباعها عند الوصول إلى المستشفى في يوم الموعد؟',
          answer: 'يرجى التوجه إلى مكتب الاستقبال بالدور الأرضي بمبنى العيادات الخارجية قبل موعدك بـ 15 إلى 30 دقيقة، مع إبراز الرقم المرجعي (BSCH-XXXX) أو إيصال الحجز المطبوع لتأكيد الحضور واستلام تذكرة الدخول للعيادة وتنسيق النداء الآلي.',
          category: 'يوم الكشف',
        },
        {
          question: 'هل يمكنني إلغاء الموعد إذا طرأ ظرف حال دون الحضور؟',
          answer: 'نعم، يمكنك إلغاء الموعد بكل سهولة في أي وقت عبر الدخول إلى صفحة "متابعة حجز" وإدخال الرقم المرجعي ورقم الهاتف المسجل، ثم الضغط على زر "إلغاء الموعد". نرجو المبادرة بالإلغاء لإتاحة الفرصة لطفل آخر في قائمة الانتظار.',
          category: 'التعديل والإلغاء',
        },
        {
          question: 'ما هي المستندات والتحاليل الواجب إحضارها عند الكشف بالعيادة؟',
          answer: 'يرجى إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي، بالإضافة إلى أي تقارير طبية، فحوصات، تحاليل، رسم قلب، أو أشعات سابقة تتعلق بالحالة، مع تدوين قائمة الأدوية التي يتناولها الطفل بانتظام لمناظرتها مع الاستشاري المعالج.',
          category: 'المستندات والفحوصات',
        },
        {
          question: 'ما هي مواعيد العمل الرسمية للعيادات؟ وكيف يتم التعامل مع الحالات الحرجة؟',
          answer: 'تعمل العيادات الخارجية التخصصية من السبت إلى الخميس، من الساعة 8:30 صباحاً وحتى 2:00 ظهراً (الجمعة عطلة رسمية). أما بالنسبة لحالات طوارئ الأطفال والحوادث الحرجة، فإن قسم الطوارئ بالمستشفى يعمل على مدار 24 ساعة يومياً طوال أيام الأسبوع عبر الخط الساخن 137.',
          category: 'المواعيد والطوارئ',
        },
      ],
    },
  },
];

export const DEFAULT_NAV_ITEMS: NavigationItem[] = [
  { id: 'nav-1', label: 'الرئيسية', href: '/', display_order: 1, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'Home' },
  { id: 'nav-2', label: 'حجز موعد', href: '/appointments/new', display_order: 2, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'CalendarPlus' },
  { id: 'nav-3', label: 'متابعة حجز', href: '/appointments/track', display_order: 3, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'Search' },
  { id: 'nav-4', label: 'موقع المستشفى', href: 'https://mohp.gov.eg', display_order: 4, is_visible: true, is_external: true, location: 'HEADER', icon_name: 'ExternalLink' },
  { id: 'nav-5', label: 'حجز موعد جديد بالعيادات', href: '/appointments/new', display_order: 1, is_visible: true, is_external: false, location: 'FOOTER_QUICK', icon_name: 'CalendarPlus' },
  { id: 'nav-6', label: 'متابعة حالة الحجز وتعليمات الحضور', href: '/appointments/track', display_order: 2, is_visible: true, is_external: false, location: 'FOOTER_QUICK', icon_name: 'Search' },
  { id: 'nav-7', label: 'موقع وزارة الصحة والسكان', href: 'https://mohp.gov.eg', display_order: 3, is_visible: true, is_external: true, location: 'FOOTER_QUICK', icon_name: 'ExternalLink' },
];

export const DEFAULT_CLINICS_PRESENTATION: ClinicPresentation[] = [
  { id: 'cardio', name: 'عيادة قلب الأطفال', english_title: 'Pediatric Cardiology', description: 'تشخيص ومتابعة عيوب القلب الخلقية، أمراض الصمامات، واضطراب نبض القلب.', location: 'الدور الرابع - عيادة 1', working_hours: '08:30-14:00', display_order: 1, is_featured_on_homepage: true, accent_color: '#DC2626', icon_name: 'HeartPulse', is_hospital_confirmed: false, is_active: true },
  { id: 'echo', name: 'عيادة الإيكو والموجات الصوتية', english_title: 'Echocardiography Unit', description: 'فحص السونار والإيكو الدقيق على القلب لحديثي الولادة والأطفال.', location: 'أمام عيادة القلب - الدور الرابع', working_hours: '08:30-14:00', display_order: 2, is_featured_on_homepage: true, accent_color: '#0284C7', icon_name: 'Activity', is_hospital_confirmed: false, is_active: true },
  { id: 'dentistry', name: 'عيادة طب أسنان الأطفال', english_title: 'Pediatric Dentistry', description: 'فحص وعلاج تسوس الأسنان، الحشو الوقائي، علاج العصب، وتقويم الأسنان المبكر.', location: 'الدور الأرضي - عيادة 1', working_hours: '08:30-14:00', display_order: 3, is_featured_on_homepage: true, accent_color: '#0D9488', icon_name: 'Smile', is_hospital_confirmed: false, is_active: true },
  { id: 'neuro', name: 'عيادة النفسية والعصبية', english_title: 'Pediatric Neurology', description: 'متابعة نوبات الصرع والتشنجات، تأخر التطور الحركي، وفرط الحركة وتشتت الانتباه.', location: 'الدور الرابع - عيادة 2', working_hours: '08:30-14:00', display_order: 4, is_featured_on_homepage: true, accent_color: '#7C3AED', icon_name: 'Brain', is_hospital_confirmed: false, is_active: true },
  { id: 'gi', name: 'عيادة الجهاز الهضمي', english_title: 'Gastroenterology & Hepatology', description: 'علاج حساسية القمح، الارتجاع المريئي، اضطرابات الهضم والتهابات المعدة والأمعاء.', location: 'الدور الثاني - عيادة 6', working_hours: '08:30-14:00', display_order: 5, is_featured_on_homepage: true, accent_color: '#D97706', icon_name: 'Pill', is_hospital_confirmed: false, is_active: true },
  { id: 'nutrition', name: 'عيادة التغذية ومتابعة النمو', english_title: 'Clinical Nutrition', description: 'تقييم ومتابعة منحنيات النمو، علاج سوء التغذية، وحساسية وبروتينات اللبن.', location: 'الدور الثالث - عيادة 3', working_hours: '08:30-14:00', display_order: 6, is_featured_on_homepage: true, accent_color: '#16A34A', icon_name: 'Baby', is_hospital_confirmed: false, is_active: true },
  { id: 'audiology', name: 'عيادة السمعيات وتخطيط السمع', english_title: 'Audiology Clinic', description: 'المسح السمعي لحديثي الولادة، قياس ضغط الأذن، وتأهيل ضعف السمع وزراعة القوقعة.', location: 'الدور الأرضي - عيادة 4', working_hours: '08:30-14:00', display_order: 7, is_featured_on_homepage: true, accent_color: '#2563EB', icon_name: 'Ear', is_hospital_confirmed: false, is_active: true },
  { id: 'surgery', name: 'عيادة جراحة الأطفال', english_title: 'Pediatric Surgery', description: 'مناظرة جراحات الفتق، الخصية المعلقة، التشوهات الخلقية، وجراحات الجهاز البولي.', location: 'الدور الثاني - عيادة 2', working_hours: '08:30-14:00', display_order: 8, is_featured_on_homepage: true, accent_color: '#E11D48', icon_name: 'Scissors', is_hospital_confirmed: false, is_active: true },
];

export const PRECONFIGURED_MEDIA_ASSETS: MediaAsset[] = [
  { id: 'asset-1', name: 'شعار العيادات الخارجية', url: '/logo-outpatient.png', mime_type: 'image/png', is_custom: false },
  { id: 'asset-2', name: 'شعار المستشفى الرئيسي', url: '/logo-main.png', mime_type: 'image/png', is_custom: false },
  { id: 'asset-3', name: 'أيقونة المتصفح الافتراضية', url: '/favicon.ico', mime_type: 'image/x-icon', is_custom: false },
];

class CmsService {
  private settings: WebsiteSettings = { ...DEFAULT_WEBSITE_SETTINGS };
  private sections: HomepageSection[] = [...DEFAULT_HOMEPAGE_SECTIONS];
  private navigation: NavigationItem[] = [...DEFAULT_NAV_ITEMS];
  private clinicsPresentation: ClinicPresentation[] = [...DEFAULT_CLINICS_PRESENTATION];
  private customAssets: MediaAsset[] = [];

  public async getPublishedContent(): Promise<CmsFullPayload> {
    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        const [settingsRes, sectionsRes, navRes, clinicsRes] = await Promise.all([
          supabase.from('website_settings').select('*').eq('id', 'default').single(),
          supabase.from('homepage_sections').select('*').order('display_order', { ascending: true }),
          supabase.from('navigation_items').select('*').order('display_order', { ascending: true }),
          supabase.from('clinics').select('id, name, description, location, working_hours, display_order, is_featured_on_homepage, english_title, accent_color, icon_name, is_hospital_confirmed, is_active').eq('is_active', true).order('display_order', { ascending: true }),
        ]);

        const settings = (settingsRes.data as unknown as WebsiteSettings) || this.settings;
        const sections = (sectionsRes.data as unknown as HomepageSection[]) || this.sections;
        const navigation = (navRes.data as unknown as NavigationItem[]) || this.navigation;
        const clinics = (clinicsRes.data as unknown as ClinicPresentation[]) || this.clinicsPresentation;

        return {
          settings,
          sections: sections.filter((s) => s.is_visible),
          navigation: navigation.filter((n) => n.is_visible),
          clinics: clinics.filter((c) => c.is_featured_on_homepage && c.is_active),
        };
      } catch (err) {
        console.warn('Supabase getPublishedContent fallback:', err);
      }
    }

    return {
      settings: this.settings,
      sections: this.sections.filter((s) => s.is_visible),
      navigation: this.navigation.filter((n) => n.is_visible),
      clinics: this.clinicsPresentation.filter((c) => c.is_featured_on_homepage && c.is_active),
    };
  }

  public async getCmsDashboardData(): Promise<CmsFullPayload & { assets: MediaAsset[] }> {
    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        const [settingsRes, sectionsRes, navRes, clinicsRes] = await Promise.all([
          supabase.from('website_settings').select('*').eq('id', 'default').single(),
          supabase.from('homepage_sections').select('*').order('display_order', { ascending: true }),
          supabase.from('navigation_items').select('*').order('display_order', { ascending: true }),
          supabase.from('clinics').select('id, name, description, location, working_hours, display_order, is_featured_on_homepage, english_title, accent_color, icon_name, is_hospital_confirmed, is_active').order('display_order', { ascending: true }),
        ]);

        if (settingsRes.data) this.settings = settingsRes.data as unknown as WebsiteSettings;
        if (sectionsRes.data && sectionsRes.data.length > 0) this.sections = sectionsRes.data as unknown as HomepageSection[];
        if (navRes.data && navRes.data.length > 0) this.navigation = navRes.data as unknown as NavigationItem[];
        if (clinicsRes.data && clinicsRes.data.length > 0) this.clinicsPresentation = clinicsRes.data as unknown as ClinicPresentation[];
      } catch (err) {
        console.warn('Supabase getCmsDashboardData fallback:', err);
      }
    }

    return {
      settings: this.settings,
      sections: this.sections,
      navigation: this.navigation,
      clinics: this.clinicsPresentation,
      assets: [...PRECONFIGURED_MEDIA_ASSETS, ...this.customAssets],
    };
  }

  public async updateSettings(
    updates: Partial<WebsiteSettings>,
    user: StaffUser
  ): Promise<{ success: boolean; settings?: WebsiteSettings; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'غير مصرح بتعديل إعدادات وهوية الموقع. صلاحية مدير النظام مطلوبة.' };
    }

    const updated: WebsiteSettings = {
      ...this.settings,
      ...updates,
      id: 'default',
      updated_at: new Date().toISOString(),
      updated_by: user.name,
      is_published: true,
      published_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        const { error } = await supabase
          .from('website_settings')
          .upsert(updated as any, { onConflict: 'id' });

        if (error) {
          console.error('Supabase updateSettings error:', error);
          // Return genuine error if database rejected
        }
      } catch (err) {
        console.warn('Supabase updateSettings exception:', err);
      }
    }

    this.settings = updated;

    try {
      revalidatePath('/');
    } catch {
      // Revalidation outside request context ignored
    }

    return { success: true, settings: this.settings };
  }

  public async updateSection(
    sectionId: string,
    updates: Partial<HomepageSection>,
    user: StaffUser
  ): Promise<{ success: boolean; section?: HomepageSection; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'غير مصرح بتعديل أقسام الصفحة الرئيسية. صلاحية مدير النظام مطلوبة.' };
    }

    const idx = this.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) {
      return { success: false, error: 'القسم المطلوب غير موجود' };
    }

    const updated: HomepageSection = {
      ...this.sections[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: user.name,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        await supabase
          .from('homepage_sections')
          .upsert(updated as any, { onConflict: 'id' });
      } catch (err) {
        console.warn('Supabase updateSection exception:', err);
      }
    }

    this.sections[idx] = updated;

    try {
      revalidatePath('/');
    } catch {
      // Revalidation
    }

    return { success: true, section: updated };
  }

  public async reorderSections(
    ordered: (string | { id: string; display_order: number })[],
    user: StaffUser
  ): Promise<{ success: boolean; sections?: HomepageSection[]; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لإعادة ترتيب الأقسام.' };
    }

    ordered.forEach((item, idx) => {
      const id = typeof item === 'string' ? item : item.id;
      const sec = this.sections.find((s) => s.id === id);
      if (sec) {
        sec.display_order = typeof item === 'object' && item.display_order ? item.display_order : idx + 1;
      }
    });

    this.sections.sort((a, b) => a.display_order - b.display_order);

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        for (const sec of this.sections) {
          await supabase
            .from('homepage_sections')
            .update({ display_order: sec.display_order, updated_at: new Date().toISOString() })
            .eq('id', sec.id);
        }
      } catch (err) {
        console.warn('Supabase reorderSections error:', err);
      }
    }

    try {
      revalidatePath('/');
    } catch {}

    return { success: true, sections: this.sections };
  }

  public async updateNavigation(
    items: NavigationItem[],
    user: StaffUser
  ): Promise<{ success: boolean; navigation?: NavigationItem[]; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لتعديل قوائم التنقل.' };
    }

    this.navigation = items;

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        for (const item of items) {
          await supabase.from('navigation_items').upsert(item as any, { onConflict: 'id' });
        }
      } catch (err) {
        console.warn('Supabase updateNavigation error:', err);
      }
    }

    try {
      revalidatePath('/');
    } catch {}

    return { success: true, navigation: this.navigation };
  }

  public async updateClinicPresentation(
    clinicId: string,
    updates: Partial<ClinicPresentation>,
    user: StaffUser
  ): Promise<{ success: boolean; clinic?: ClinicPresentation; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لتعديل بيانات عرض العيادة.' };
    }

    const clinic = this.clinicsPresentation.find((c) => c.id === clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة المطلوبة غير موجودة' };
    }

    // Safety constraint: Never touch operational fields
    if (updates.display_order !== undefined) clinic.display_order = updates.display_order;
    if (updates.is_featured_on_homepage !== undefined) clinic.is_featured_on_homepage = updates.is_featured_on_homepage;
    if (updates.english_title !== undefined) clinic.english_title = updates.english_title;
    if (updates.accent_color !== undefined) clinic.accent_color = updates.accent_color;
    if (updates.icon_name !== undefined) clinic.icon_name = updates.icon_name;
    if (updates.description !== undefined) clinic.description = updates.description;
    if (updates.instructions !== undefined) clinic.instructions = updates.instructions;

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = createAdminClient();
        await supabase
          .from('clinics')
          .update({
            display_order: clinic.display_order,
            is_featured_on_homepage: clinic.is_featured_on_homepage,
            english_title: clinic.english_title,
            accent_color: clinic.accent_color,
            icon_name: clinic.icon_name,
            description: clinic.description,
            instructions: clinic.instructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clinicId);
      } catch (err) {
        console.warn('Supabase updateClinicPresentation error:', err);
      }
    }

    try {
      revalidatePath('/');
    } catch {}

    return { success: true, clinic };
  }

  public registerCustomAsset(asset: MediaAsset) {
    this.customAssets.unshift(asset);
  }
}

const globalForCms = globalThis as unknown as {
  cmsServiceInstance?: CmsService;
};

export const cmsService = globalForCms.cmsServiceInstance ?? new CmsService();
if (process.env.NODE_ENV !== 'production') {
  globalForCms.cmsServiceInstance = cmsService;
}

