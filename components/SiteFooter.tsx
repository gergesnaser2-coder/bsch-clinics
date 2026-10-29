import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, Clock, MapPin, ExternalLink, ShieldCheck, Share2 } from 'lucide-react';
import type { WebsiteSettings } from '@/types/cms';

interface SiteFooterProps {
  settings?: WebsiteSettings;
}

export function SiteFooter({ settings }: SiteFooterProps) {
  const footerLogo = settings?.footer_logo_url || '/logo-main.png';
  const summary =
    settings?.footer_summary ||
    'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة والمحافظات المجاورة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.';
  const address =
    settings?.hospital_address ||
    'دمنهور - محافظة البحيرة - مجمع المستشفيات التخصصية';
  const workingHours =
    settings?.working_hours || 'السبت - الخميس (8:30 ص إلى 2:00 م)';
  const hotline = settings?.emergency_hotline || '137';
  const copyright =
    settings?.footer_copyright ||
    `مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.`;
  const statusBadge =
    settings?.footer_status_badge ||
    'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢';
  const activeSocialLinks =
    settings?.social_links?.filter((s) => s.is_active) || [];

  return (
    <footer className="bg-white border-t border-[#E2E8EE] mt-16 text-[#163C3A] text-sm">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Identity & Hospital Summary */}
          <div className="md:col-span-2 space-y-3">
            <Link
              href="/"
              className="inline-block group focus:outline-hidden focus:ring-2 focus:ring-[#087F78] rounded-xl p-1 transition-opacity hover:opacity-95"
              aria-label="الرئيسية - مستشفى الأطفال التخصصي بالبحيرة"
            >
              <Image
                src={footerLogo}
                alt="شعار مستشفى الأطفال التخصصي بالبحيرة - صحة .. أمل .. مستقبل أفضل لأطفالنا"
                width={192}
                height={192}
                className="w-36 sm:w-44 h-auto object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
              />
            </Link>
            <p className="text-xs text-[#5A6B82] leading-relaxed max-w-md">
              {summary}
            </p>

            {/* Social Links if configured */}
            {activeSocialLinks.length > 0 && (
              <div className="pt-2 flex items-center gap-2 flex-wrap">
                {activeSocialLinks.map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-[#087F78] text-[#5A6B82] text-xs font-semibold transition-colors"
                  >
                    <span>{s.label}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Contact & Location */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-xs text-[#124E4A] uppercase tracking-wider">
              بيانات التواصل والمقر
            </h4>
            <ul className="space-y-2.5 text-xs text-[#5A6B82]">
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span className="leading-relaxed">{address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span>{workingHours}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200/60 flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <span>
                  طوارئ الأطفال المركزية:{' '}
                  <strong className="font-mono text-[#124E4A]">{hotline}</strong>
                </span>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-xs text-[#124E4A] uppercase tracking-wider">
              روابط سريعة
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/appointments/new"
                  className="text-[#5A6B82] hover:text-[#087F78] transition-colors"
                >
                  حجز موعد جديد بالعيادات
                </Link>
              </li>
              <li>
                <Link
                  href="/appointments/track"
                  className="text-[#5A6B82] hover:text-[#087F78] transition-colors"
                >
                  متابعة حالة الحجز وتعليمات الحضور
                </Link>
              </li>
              <li>
                <a
                  href="https://mohp.gov.eg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#5A6B82] hover:text-[#087F78] transition-colors"
                >
                  <span>موقع وزارة الصحة والسكان</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li className="pt-2 border-t border-slate-100">
                <Link
                  href="/staff/login"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#087F78] transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#087F78]" />
                  <span>دخول الموظفين والأطباء</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[#E2E8EE] flex flex-col sm:flex-row items-center justify-between text-xs text-[#5A6B82] gap-3">
          <p>© {new Date().getFullYear()} {copyright}</p>
          <p className="flex items-center gap-2">
            <span>{statusBadge}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
