import React from 'react';
import { Stethoscope, CalendarCheck2, Award, PhoneCall, Sparkles } from 'lucide-react';
import type { HomepageSection, TrustStatsSectionContent } from '@/types/cms';

interface TrustStatsBarProps {
  section?: HomepageSection;
}

export function TrustStatsBar({ section }: TrustStatsBarProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<TrustStatsSectionContent>;

  const defaultStats = [
    {
      icon: Stethoscope,
      value: '٨ عيادات',
      label: 'عيادات تخصصية دقيقة',
      description: 'قلب، أعصاب، أسنان، جراحة، وغيرها',
      accentBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      icon: CalendarCheck2,
      value: '١٠٠٪ رقمي',
      label: 'حجز إلكتروني منظم',
      description: 'بدون طوابير شباك وبأرقام دور متتابعة',
      accentBg: 'bg-teal-50 text-teal-700 border-teal-100',
    },
    {
      icon: Award,
      value: 'نخبة طبية',
      label: 'أطباء واستشاريون',
      description: 'كوادر مؤهلة في طب وجراحة الأطفال',
      accentBg: 'bg-sky-50 text-sky-700 border-sky-100',
    },
    {
      icon: PhoneCall,
      value: '٢٤/٧ متاح',
      label: 'طوارئ مركزية على مدار الساعة',
      description: 'الخط الساخن المركزي الموحد 137',
      accentBg: 'bg-amber-50/70 text-amber-800 border-amber-200/60',
    },
  ];

  const items = content.items && content.items.length > 0
    ? content.items.map((it, idx) => ({
        icon: idx === 0 ? Stethoscope : idx === 1 ? CalendarCheck2 : idx === 2 ? Award : PhoneCall,
        value: it.value,
        label: it.label,
        description: it.desc,
        accentBg: it.bg_color || defaultStats[idx % defaultStats.length].accentBg,
      }))
    : defaultStats;

  return (
    <section
      dir="rtl"
      aria-label="مؤشرات وإحصائيات المستشفى"
      className="my-6 sm:my-8"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        {items.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="group bg-white border border-[#E2E8EE]/80 hover:border-[#79C7C1] rounded-[20px] p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_-4px_rgba(8,127,120,0.12)] transition-all duration-200 ease-out transform hover:-translate-y-0.5 flex flex-col justify-between text-right"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border shadow-2xs group-hover:scale-105 transition-transform shrink-0 ${stat.accentBg}`}
                >
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                </div>
                <span className="text-xs font-mono font-bold text-[#5A6B82] bg-[#F6F9FB] px-2 py-0.5 rounded-full border border-slate-200/80">
                  0{idx + 1}
                </span>
              </div>

              <div>
                <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-[#124E4A] group-hover:text-[#087F78] transition-colors tracking-tight">
                  {stat.value}
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-[#163C3A] mt-1">
                  {stat.label}
                </h3>
                <p className="text-[11.5px] sm:text-xs text-[#5A6B82] mt-1 leading-relaxed">
                  {stat.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
