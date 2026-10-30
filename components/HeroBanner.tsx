import React from 'react';
import Link from 'next/link';
import {
  CalendarPlus,
  ArrowLeft,
  Clock,
  Smartphone,
  Ticket,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type { HomepageSection, HeroSectionContent } from '@/types/cms';

interface HeroBannerProps {
  section?: HomepageSection;
}

export function HeroBanner({ section }: HeroBannerProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<HeroSectionContent>;

  const badgeText = section?.badge_text || 'الحجز الإلكتروني متاح الآن لجميع عيادات الأسبوع';
  const title = section?.title || 'العيادات الخارجية';
  const subtitle = section?.subtitle || 'مستشفى الأطفال التخصصي بالبحيرة';
  const description =
    content.description ||
    'منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة. احجز موعدك بالاسم ورقم الهاتف بدون تسجيل حساب، وتجنب طوابير الانتظار.';

  const primaryCtaLabel = content.primary_cta_label || 'احجز موعدك الآن';
  const primaryCtaUrl = content.primary_cta_url || '/appointments/new';
  const primaryCtaVisible = content.primary_cta_visible !== false;

  const secondaryCtaLabel = content.secondary_cta_label || 'متابعة حجز قائم';
  const secondaryCtaUrl = content.secondary_cta_url || '/appointments/track';
  const secondaryCtaVisible = content.secondary_cta_visible !== false;

  const cardTitle = content.feature_card_title || 'مميزات الحجز الإلكتروني';
  const cardBadge = content.feature_card_badge || 'خدمة معتمدة';
  const cardFooter =
    content.feature_card_footer || 'مستشفى الأطفال التخصصي — أبو حمص – دمسنا – محافظة البحيرة';
  const bullets = content.feature_card_bullets || [
    {
      icon: 'Clock',
      title: 'زمن الحجز: دقيقة واحدة',
      desc: 'خطوات مبسطة وسلسة تناسب كافة الهواتف الذكية.',
    },
    {
      icon: 'Smartphone',
      title: 'المتطلبات: الاسم ورقم الهاتف فقط',
      desc: 'بدون الحاجة لإنشاء حساب أو تذكر كلمات مرور معقدة.',
    },
    {
      icon: 'Ticket',
      title: 'إيصال فوري برقم الدور',
      desc: 'تحديد موعد وتوقيت الحضور مع إمكانية طباعة الإيصال وحفظه.',
    },
  ];

  return (
    <section
      dir="rtl"
      aria-label="القسم التعريفي الرئيسي"
      className="relative overflow-hidden rounded-[26px] shadow-lg border border-[#0A3D39]"
    >
      {/* Rich Deep Hospital Teal Gradient Background */}
      <div
        className="relative min-h-[380px] sm:min-h-[420px] md:min-h-[440px] bg-[#0A3D39] bg-gradient-to-br from-[#052A27] via-[#0D5F5A] to-[#087F78] flex items-center text-white"
        style={{
          backgroundColor: '#0A3D39',
          backgroundImage: 'linear-gradient(135deg, #052A27 0%, #0D5F5A 52%, #087F78 100%)',
        }}
      >
        {/* Subtle Decorative Clinic Pattern */}
        <div className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none">
            <defs>
              <pattern id="hero-clinic-pattern" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="1.5" fill="#FFFFFF" />
                <path d="M15 30h30M30 15v30" stroke="#FFFFFF" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-clinic-pattern)" />
          </svg>
        </div>

        {/* Content Container (Two-column layout on Desktop) */}
        <div className="relative z-10 w-full px-5 sm:px-8 md:px-12 lg:px-16 py-8 sm:py-12 md:py-14 text-right">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Right Column: Hero Heading, Tagline, CTAs (7 columns) */}
            <div className="lg:col-span-7 flex flex-col items-start gap-4 sm:gap-5">
              {/* Top Live Status Pill Badge */}
              {badgeText && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-300/40 text-emerald-100 text-xs font-bold shadow-xs backdrop-blur-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span>{badgeText}</span>
                </div>
              )}

              {/* Main Typography */}
              <div className="space-y-1.5 sm:space-y-2">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight drop-shadow-xs">
                  {title}
                </h1>
                {subtitle && (
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#79C7C1] drop-shadow-xs">
                    {subtitle}
                  </h2>
                )}
              </div>

              {/* Subtitle / Description */}
              <p className="text-xs sm:text-sm md:text-base text-emerald-50/95 leading-relaxed max-w-xl font-normal">
                {description}
              </p>

              {/* Primary Call to Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {primaryCtaVisible && (
                  <Link
                    href={primaryCtaUrl}
                    className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-full bg-white text-[#087F78] hover:bg-emerald-50 text-sm md:text-base font-extrabold shadow-md hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#087F78]"
                  >
                    <CalendarPlus className="w-5 h-5 text-[#087F78]" />
                    <span>{primaryCtaLabel}</span>
                    <ArrowLeft className="w-4 h-4 text-[#087F78]" />
                  </Link>
                )}

                {secondaryCtaVisible && (
                  <Link
                    href={secondaryCtaUrl}
                    className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#052A27]/80 hover:bg-[#052A27] text-white border border-[#79C7C1]/60 text-sm font-bold backdrop-blur-md transition-all duration-200 ease-out active:scale-[0.99] cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#79C7C1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#052A27]"
                  >
                    <Search className="w-4 h-4 text-[#79C7C1]" />
                    <span>{secondaryCtaLabel}</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Left Column: Feature Card (5 columns) */}
            <div className="lg:col-span-5 w-full">
              <div
                className="relative rounded-[22px] p-5 sm:p-6 shadow-2xl text-white space-y-4 border border-emerald-400/30 transition-transform duration-300 hover:border-emerald-300/50"
                style={{
                  backgroundColor: 'rgba(5, 42, 39, 0.82)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
              >
                {/* Header of Floating Card */}
                <div className="flex items-center justify-between pb-3 border-b border-white/15">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <ShieldCheck className="w-5 h-5 text-emerald-300" />
                    <span className="font-bold text-xs sm:text-sm">{cardTitle}</span>
                  </div>
                  {cardBadge && (
                    <span className="text-[11px] font-medium text-emerald-100 bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20">
                      {cardBadge}
                    </span>
                  )}
                </div>

                {/* Bullets */}
                <ul className="space-y-3.5 text-xs sm:text-sm">
                  {bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                        {idx === 0 ? (
                          <Clock className="w-4 h-4" />
                        ) : idx === 1 ? (
                          <Smartphone className="w-4 h-4" />
                        ) : (
                          <Ticket className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs sm:text-sm">{bullet.title}</h4>
                        <p className="text-[11.5px] sm:text-xs text-emerald-100/95 mt-0.5 leading-relaxed">
                          {bullet.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Footer of Floating Card */}
                {cardFooter && (
                  <div className="pt-3 border-t border-white/15 text-[11px] text-emerald-200/90 text-center font-medium">
                    {cardFooter}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
