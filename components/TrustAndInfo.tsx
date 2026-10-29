import React from 'react';
import { FileText, AlertCircle, PhoneCall, CheckCircle2 } from 'lucide-react';
import type { HomepageSection, TrustInfoSectionContent } from '@/types/cms';

interface TrustAndInfoProps {
  section?: HomepageSection;
}

export function TrustAndInfo({ section }: TrustAndInfoProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<TrustInfoSectionContent>;

  const title = section?.title || 'تعليمات هامة لأولياء الأمور';
  const subtitle =
    section?.subtitle ||
    'كل ما يهمك معرفته لضمان كشف ميسر وتجربة علاجية متكاملة لطفلك';

  const defaultInstructions = [
    {
      title: 'ما يجب إحضاره عند الحضور',
      items: [
        'شهادة ميلاد الطفل أو بطاقة التأمين الصحي (إن وجدت)',
        'أي تقارير طبية، فحوصات، تحاليل، أو أشعات سابقة تخص الحالة',
        'كتابة اسم الأدوية التي يتناولها الطفل بانتظام',
      ],
      icon: FileText,
      color: '#087F78',
    },
    {
      title: 'إرشادات وتنظيم الحضور',
      items: [
        'يرجى الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء إجراءات التأكيد',
        'يُسمح بمرافق واحد فقط مع الطفل لتجنب الزحام وحرصاً على سلامة الأطفال',
        'في حال التعذر عن الحضور يرجى إلغاء الموعد لإتاحة الفرصة لطفل آخر',
      ],
      icon: AlertCircle,
      color: '#D97706',
    },
    {
      title: 'التواصل والاستفسارات',
      items: [
        'مقر المستشفى: دمنهور - مجمع المستشفيات التخصصية بالبحيرة',
        'أيام وساعات العمل: السبت إلى الخميس من 8:30 صباحاً حتى 2:00 ظهراً',
        'طوارئ الأطفال تعمل على مدار 24 ساعة يومياً على الخط 137',
      ],
      icon: PhoneCall,
      color: '#2563EB',
    },
  ];

  const instructions = content.pillars && content.pillars.length > 0
    ? content.pillars.map((pil: any, idx: number) => ({
        title: pil.title,
        items: pil.desc.split('\n').filter(Boolean),
        icon: idx === 0 ? FileText : idx === 1 ? AlertCircle : PhoneCall,
        color: idx === 0 ? '#087F78' : idx === 1 ? '#D97706' : '#2563EB',
      }))
    : defaultInstructions;

  return (
    <section className="bg-white border border-[#E2E8EE]/80 rounded-[22px] p-6 sm:p-8 my-6 sm:my-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
      <div className="text-right mb-6">
        <h3 className="text-xl sm:text-2xl font-bold text-[#124E4A]">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-[#5A6B82] mt-1 leading-relaxed">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {instructions.map((card: any, idx: number) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="p-5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2.5 mb-3 text-right">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${card.color}15`, color: card.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-[#124E4A]">{card.title}</h4>
                </div>
                <ul className="space-y-2 text-right">
                  {card.items.map((item: string, itemIdx: number) => (
                    <li key={itemIdx} className="flex items-start gap-2 text-xs text-[#163C3A] leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#087F78] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
