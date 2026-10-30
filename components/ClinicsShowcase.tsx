import React from 'react';
import Link from 'next/link';
import {
  HeartPulse,
  Activity,
  Smile,
  Brain,
  Pill,
  Baby,
  Ear,
  Scissors,
  MapPin,
  Calendar,
  Clock,
  ArrowLeft,
  Sparkles,
  Stethoscope,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import type { ClinicPresentation } from '@/types/cms';

interface ClinicsShowcaseProps {
  clinics?: ClinicPresentation[];
}

export function ClinicsShowcase({ clinics }: ClinicsShowcaseProps) {
  const getIcon = (iconName?: string, clinicId?: string) => {
    switch (iconName?.toLowerCase() || clinicId?.toLowerCase()) {
      case 'heart':
      case 'cardio':
        return HeartPulse;
      case 'activity':
      case 'echo':
        return Activity;
      case 'smile':
      case 'dentistry':
        return Smile;
      case 'neuro':
      case 'brain':
        return Brain;
      case 'nutrition':
      case 'pill':
        return Pill;
      case 'baby':
      case 'growth':
        return Baby;
      case 'phonetics':
      case 'ear':
        return Ear;
      case 'surgery':
      case 'scissors':
        return Scissors;
      case 'stethoscope':
        return Stethoscope;
      case 'shield':
        return ShieldCheck;
      case 'filetext':
        return FileText;
      default:
        return Sparkles;
    }
  };

  const defaultClinics = [
    {
      id: 'cardio',
      name: 'عيادة قلب الأطفال',
      english_title: 'Pediatric Cardiology',
      description: 'تشخيص ومتابعة عيوب القلب الخلقية، أمراض الصمامات، واضطراب نبض القلب.',
      accent_color: '#DC2626',
      icon_name: 'Heart',
    },
    {
      id: 'echo',
      name: 'عيادة الإيكو والموجات الصوتية',
      english_title: 'Echocardiography Unit',
      description: 'فحص السونار والإيكو الدقيق على القلب لحديثي الولادة والأطفال.',
      accent_color: '#0284C7',
      icon_name: 'Activity',
    },
    {
      id: 'dentistry',
      name: 'عيادة طب أسنان الأطفال',
      english_title: 'Pediatric Dentistry',
      description: 'فحص وعلاج تسوس الأسنان، الحشو الوقائي، علاج العصب، وتقويم الأسنان المبكر.',
      accent_color: '#0D9488',
      icon_name: 'Smile',
    },
    {
      id: 'neuro',
      name: 'عيادة النفسية والعصبية',
      english_title: 'Pediatric Neurology',
      description: 'متابعة نوبات الصرع والتشنجات، تأخر التطور الحركي، وفرط الحركة وتشتت الانتباه.',
      accent_color: '#4F46E5',
      icon_name: 'Brain',
    },
    {
      id: 'nutrition',
      name: 'عيادة التغذية العلاجية',
      english_title: 'Clinical Nutrition',
      description: 'علاج سوء التغذية، النحافة الشديدة، حساسية الألبان والطعام، وسمنة الأطفال.',
      accent_color: '#059669',
      icon_name: 'Pill',
    },
    {
      id: 'growth',
      name: 'عيادة النمو والغدد الصماء',
      english_title: 'Growth & Endocrinology',
      description: 'تقييم قصر القامة، اضطرابات هرمون النمو، نشاط الغدة الدرقية، وسكري الأطفال.',
      accent_color: '#D97706',
      icon_name: 'Baby',
    },
    {
      id: 'phonetics',
      name: 'عيادة التخاطب وتنمية المهارات',
      english_title: 'Phonetics & Speech',
      description: 'جلسات علاج تأخر الكلام، اللدغات والتأتأة، وصعوبات التواصل اللغوي للأطفال.',
      accent_color: '#7C3AED',
      icon_name: 'Ear',
    },
    {
      id: 'surgery',
      name: 'عيادة جراحة الأطفال التخصصية',
      english_title: 'Pediatric Surgery',
      description: 'مناظرة حالات الفتق الإربي، الخصية المعلقة، وتجهيز العمليات الجراحية المجدولة.',
      accent_color: '#E11D48',
      icon_name: 'Scissors',
    },
  ];

  const items = clinics && clinics.length > 0
    ? clinics
        .filter((c) => c.is_featured_on_homepage !== false)
        .sort((a, b) => a.display_order - b.display_order)
    : defaultClinics;

  return (
    <section
      dir="rtl"
      aria-label="دليل العيادات التخصصية"
      className="my-10 sm:my-14"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 text-right">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#087F78] text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>العيادات الخارجية التخصصية</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A] tracking-tight">
            دليل العيادات التخصصية المتاحة
          </h2>
          <p className="text-xs sm:text-sm text-[#5A6B82] mt-1 max-w-2xl leading-relaxed">
            استعرض التخصصات الدقيقة بمستشفى الأطفال التخصصي بالبحيرة واحجز موعد طفلك مباشرة في العيادة المناسبة.
          </p>
        </div>

        <Link
          href="/appointments/new"
          className="self-start sm:self-auto inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#087F78] hover:text-[#124E4A] transition-colors group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] rounded-lg p-1"
        >
          <span>عرض جدول كافة العيادات</span>
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1.5 transition-transform duration-200" />
        </Link>
      </div>

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
        {items.map((clinic) => {
          const Icon = getIcon(clinic.icon_name, clinic.id);
          const accentColor = clinic.accent_color || '#087F78';

          return (
            <div
              key={clinic.id}
              className="group bg-white border border-[#E2E8EE]/80 hover:border-[#087F78] rounded-[22px] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] hover:shadow-[0_10px_25px_-5px_rgba(8,127,120,0.12)] transition-all duration-300 flex flex-col justify-between text-right relative overflow-hidden h-full"
            >
              {/* Top Accent Strip */}
              <div
                className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                style={{ backgroundColor: accentColor }}
              />

              <div>
                {/* Header: Icon + Accredited Badge */}
                <div className="flex items-start justify-between gap-3 mb-3.5">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center border shadow-2xs group-hover:scale-105 transition-transform shrink-0"
                    style={{
                      backgroundColor: `${accentColor}15`,
                      color: accentColor,
                      borderColor: `${accentColor}30`,
                    }}
                  >
                    <Icon className="w-6 h-6 stroke-[2]" />
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#124E4A] bg-[#F6F9FB] border border-[#E2E8EE]/80 px-2.5 py-1 rounded-full">
                    <MapPin className="w-3 h-3 text-[#087F78] shrink-0" />
                    <span>مبنى العيادات</span>
                  </span>
                </div>

                {/* Title & English Subtitle */}
                <h3 className="text-base sm:text-lg font-bold text-[#124E4A] group-hover:text-[#087F78] transition-colors leading-snug">
                  {clinic.name}
                </h3>
                {clinic.english_title && (
                  <span className="block text-[11px] font-mono font-semibold text-[#5A6B82] mt-0.5 tracking-wide">
                    {clinic.english_title}
                  </span>
                )}

                {/* Description */}
                <div className="min-h-[3.8rem] mt-2.5 flex items-start">
                  <p className="text-xs text-[#5A6B82] leading-relaxed line-clamp-3">
                    {clinic.description}
                  </p>
                </div>

                {/* Meta details */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-[#5A6B82]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#087F78]" />
                    السبت - الخميس
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#087F78]" />
                    أسبقية الحضور
                  </span>
                </div>
              </div>

              {/* Crucial CTA: Next.js Link pointing to /book?clinic=[clinic_id] */}
              <div className="mt-5">
                <Link
                  href={`/book?clinic=${clinic.id}`}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#F6F9FB] hover:bg-[#087F78] group-hover:bg-[#087F78] text-[#124E4A] hover:text-white group-hover:text-white border border-[#E2E8EE] hover:border-[#087F78] group-hover:border-[#087F78] text-xs font-bold transition-all duration-200 ease-out flex items-center justify-center gap-2 shadow-2xs group-hover:shadow-md cursor-pointer active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78]"
                  title={`احجز موعد في ${clinic.name}`}
                >
                  <span>احجز في هذه العيادة</span>
                  <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1.5 transition-transform duration-200" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
