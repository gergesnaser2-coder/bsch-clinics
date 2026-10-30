import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, Clock, MapPin, ShieldCheck, Mail } from 'lucide-react';
import type { WebsiteSettings } from '@/types/cms';

interface SiteFooterProps {
  settings?: WebsiteSettings;
}

export function SiteFooter({ settings }: SiteFooterProps) {
  const footerLogo = settings?.footer_logo_url || '/logo-main.png';
  const summary =
    settings?.footer_summary ||
    'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.';
  const address =
    settings?.hospital_address ||
    'أبو حمص – دمسنا – محافظة البحيرة';
  const workingHours = settings?.working_hours?.trim() || '';
  const rawPhone = settings?.contact_phone?.trim() || '';
  const contactPhone = rawPhone && !rawPhone.includes('XXXX') && !rawPhone.includes('3123456') ? rawPhone : '';
  const rawEmail = settings?.contact_email?.trim() || '';
  const contactEmail = rawEmail && !rawEmail.includes('example') && rawEmail !== 'info@bsch.gov.eg' && rawEmail !== 'info@bsch-clinics.gov.eg' ? rawEmail : '';
  const copyright =
    settings?.footer_copyright ||
    'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.';
  const statusBadge =
    settings?.footer_status_badge ||
    'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢';

  return (
    <footer className="bg-white border-t border-[#E2E8EE] mt-16 text-[#163C3A] text-sm">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            <p className="text-xs text-[#5A6B82] leading-relaxed max-w-lg">
              {summary}
            </p>
          </div>

          {/* Contact & Location */}
          <div className="space-y-3">
            <h4 className="font-semibold text-xs text-[#124E4A] uppercase tracking-wider">
              المقر ومواعيد العيادات
            </h4>
            <ul className="space-y-2.5 text-xs text-[#5A6B82]">
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span className="leading-relaxed font-semibold text-[#163C3A]">{address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span>
                  {workingHours ? `العيادات الخارجية: ${workingHours}` : 'تنظيم الكشف: بأسبقية الحضور وتذاكر الانتظار اليومية'}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                {contactPhone ? (
                  <span>هاتف الاستعلام: <strong className="font-mono text-[#124E4A]">{contactPhone}</strong></span>
                ) : (
                  <span>هاتف الاستعلام: <span className="text-slate-400 italic font-sans">قيد الاعتماد من إدارة المستشفى</span></span>
                )}
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                {contactEmail ? (
                  <span className="font-mono">{contactEmail}</span>
                ) : (
                  <span>البريد الإلكتروني: <span className="text-slate-400 italic font-sans">قيد الاعتماد من إدارة المستشفى</span></span>
                )}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright, Status, and Staff Portal link */}
        <div className="mt-8 pt-6 border-t border-[#E2E8EE] flex flex-col sm:flex-row items-center justify-between text-xs text-[#5A6B82] gap-3">
          <p>© {new Date().getFullYear()} {copyright}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-2xs sm:text-xs">{statusBadge}</span>
            <span className="text-slate-300">|</span>
            <Link
              href="/staff/login"
              className="inline-flex items-center gap-1.5 text-2xs text-[#8493A6] hover:text-[#087F78] transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#087F78]" />
              <span>دخول الطاقم الطبي</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
