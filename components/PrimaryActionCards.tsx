import React from 'react';
import Link from 'next/link';
import { CalendarPlus, Search, ArrowLeft } from 'lucide-react';
import type { HomepageSection, PrimaryActionsSectionContent } from '@/types/cms';

interface PrimaryActionCardsProps {
  section?: HomepageSection;
}

export function PrimaryActionCards({ section }: PrimaryActionCardsProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<PrimaryActionsSectionContent>;

  const card1Title = content.card1_title || 'حجز موعد جديد';
  const card1Desc =
    content.card1_desc ||
    'بدون تسجيل حساب – الاسم ورقم الهاتف فقط لاختيار العيادة والموعد المناسب.';
  const card1Btn = content.card1_btn || 'ابدأ الحجز الآن';
  const card1Url = content.card1_url || '/appointments/new';

  const card2Title = content.card2_title || 'متابعة حجزي';
  const card2Desc =
    content.card2_desc ||
    'معرفة حالة الحجز، تأكيد الموعد، ورقم الدور وتعليمات الحضور برقم هاتفك.';
  const card2Btn = content.card2_btn || 'استعلم عن حجزك';
  const card2Url = content.card2_url || '/appointments/track';

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 my-6 sm:my-8" aria-label="الإجراءات الرئيسية">
      {/* Card 1: حجز موعد جديد */}
      <Link
        href={card1Url}
        className="group relative bg-gradient-to-br from-white via-white to-emerald-50/40 border border-emerald-200/70 hover:border-[#087F78] rounded-[22px] p-6 sm:p-7 shadow-[0_2px_6px_0_rgba(8,127,120,0.05)] hover:shadow-[0_10px_25px_-5px_rgba(8,127,120,0.15)] transition-all duration-200 ease-out flex flex-col justify-between focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 text-right">
            <h3 className="text-xl sm:text-2xl font-bold text-[#124E4A] group-hover:text-[#087F78] transition-colors">
              {card1Title}
            </h3>
            <p className="text-sm text-[#5A6B82] leading-relaxed">
              {card1Desc}
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#087F78] flex items-center justify-center text-white shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <CalendarPlus className="w-7 h-7 stroke-[2]" />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#087F78]">
          <span>{card1Btn}</span>
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1.5 transition-transform duration-200 ease-out" />
        </div>
      </Link>

      {/* Card 2: متابعة حجز */}
      <Link
        href={card2Url}
        className="group relative bg-white border border-[#E2E8EE]/80 hover:border-[#0284C7] rounded-[22px] p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] hover:shadow-[0_10px_25px_-5px_rgba(2,132,199,0.12)] transition-all duration-200 ease-out flex flex-col justify-between focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 text-right">
            <h3 className="text-xl sm:text-2xl font-bold text-[#124E4A] group-hover:text-[#0284C7] transition-colors">
              {card2Title}
            </h3>
            <p className="text-sm text-[#5A6B82] leading-relaxed">
              {card2Desc}
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#0284C7] flex items-center justify-center text-white shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <Search className="w-7 h-7 stroke-[2]" />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0284C7]">
          <span>{card2Btn}</span>
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1.5 transition-transform duration-200 ease-out" />
        </div>
      </Link>
    </section>
  );
}
