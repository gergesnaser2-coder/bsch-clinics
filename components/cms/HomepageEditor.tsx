'use client';

import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Edit3,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import type {
  HomepageSection,
  HeroSectionContent,
  TrustStatsSectionContent,
  PrimaryActionsSectionContent,
  HowItWorksSectionContent,
  HospitalBannerSectionContent,
  TrustInfoSectionContent,
  FaqSectionContent,
} from '@/types/cms';

interface HomepageEditorProps {
  initialSections: HomepageSection[];
  token?: string;
  onSaved?: (sections: HomepageSection[]) => void;
}

export default function HomepageEditor({ initialSections, token, onSaved }: HomepageEditorProps) {
  const [sections, setSections] = useState<HomepageSection[]>(
    [...initialSections].sort((a, b) => a.display_order - b.display_order)
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || 'hero');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  // Reorder Sections
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    // Recalculate display_order
    const updated = newSections.map((sec, idx) => ({
      ...sec,
      display_order: idx + 1,
    }));

    setSections(updated);

    // Persist reorder to server
    try {
      setSaving(true);
      setError(null);
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'reorder',
          sections: updated.map((s) => ({ id: s.id, display_order: s.display_order })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حفظ ترتيب الأقسام');
      }

      setSuccessMsg('تم حفظ ونشر ترتيب الأقسام الجديد بنجاح');
      if (onSaved) onSaved(updated);
    } catch (err: any) {
      setError(err.message || 'فشل تحديث الترتيب');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Visibility
  const handleToggleVisibility = async (sectionId: string, currentVisible: boolean) => {
    const updated = sections.map((sec) =>
      sec.id === sectionId ? { ...sec, is_visible: !currentVisible } : sec
    );
    setSections(updated);

    try {
      setSaving(true);
      setError(null);
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sectionId,
          updates: { is_visible: !currentVisible },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر تعديل ظهور القسم');
      }

      setSuccessMsg(`تم ${!currentVisible ? 'إظهار' : 'إخفاء'} القسم بنجاح`);
      if (onSaved) onSaved(updated);
    } catch (err: any) {
      setError(err.message || 'فشل تحديث حالة الظهور');
    } finally {
      setSaving(false);
    }
  };

  // Update selected section basic fields
  const handleBasicChange = (field: keyof HomepageSection, val: any) => {
    if (!selectedSection) return;
    setSections((prev) =>
      prev.map((s) => (s.id === selectedSectionId ? { ...s, [field]: val } : s))
    );
  };

  // Update selected section content
  const handleContentChange = (contentField: string, val: any) => {
    if (!selectedSection) return;
    setSections((prev) =>
      prev.map((s) =>
        s.id === selectedSectionId
          ? {
              ...s,
              content: {
                ...s.content,
                [contentField]: val,
              },
            }
          : s
      )
    );
  };

  // Save selected section details
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSection) return;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sectionId: selectedSection.id,
          updates: {
            title: selectedSection.title,
            subtitle: selectedSection.subtitle,
            badge_text: selectedSection.badge_text,
            is_visible: selectedSection.is_visible,
            display_order: selectedSection.display_order,
            content: selectedSection.content,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حفظ بيانات القسم');
      }

      setSuccessMsg(`تم حفظ قسم (${selectedSection.title || selectedSection.id}) ونشره بنجاح`);
      if (onSaved) onSaved(sections);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ القسم');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-center gap-2">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sections Overview & Reorder Table */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#087F78]" />
            <h3 className="text-base font-bold text-[#163C3A]">أقسام الصفحة الرئيسية وترتيب العرض</h3>
          </div>
          <span className="text-xs text-[#8493A6]">
            يمكنك إخفاء أي قسم أو تحريكه لأعلى وأسفل وسينعكس فوراً على الموقع
          </span>
        </div>

        <div className="divide-y divide-[#F1F5F9] border border-[#E2E8EE] rounded-2xl overflow-hidden">
          {sections.map((sec, idx) => {
            const isSelected = sec.id === selectedSectionId;
            return (
              <div
                key={sec.id}
                className={`p-4 flex items-center justify-between gap-4 transition-all ${
                  isSelected ? 'bg-teal-50/50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-[#5A6E85] text-xs font-bold flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#163C3A]">
                        {sec.title || sec.id}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-[#5A6E85]">
                        {sec.id}
                      </span>
                      {!sec.is_visible && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          مخفي حالياً
                        </span>
                      )}
                    </div>
                    {sec.subtitle && (
                      <p className="text-[11px] text-[#8493A6] truncate max-w-md">
                        {sec.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Move Up */}
                  <button
                    type="button"
                    disabled={idx === 0 || saving}
                    onClick={() => handleMove(idx, 'up')}
                    className="p-1.5 rounded-lg border border-[#CBD5E1] text-[#5A6E85] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="تحريك لأعلى"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Down */}
                  <button
                    type="button"
                    disabled={idx === sections.length - 1 || saving}
                    onClick={() => handleMove(idx, 'down')}
                    className="p-1.5 rounded-lg border border-[#CBD5E1] text-[#5A6E85] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="تحريك لأسفل"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle Visibility */}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleVisibility(sec.id, sec.is_visible)}
                    className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all ${
                      sec.is_visible
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={sec.is_visible ? 'القسم مرئي، اضغط للإخفاء' : 'القسم مخفي، اضغط للإظهار'}
                  >
                    {sec.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Select for Edit */}
                  <button
                    type="button"
                    onClick={() => setSelectedSectionId(sec.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                      isSelected
                        ? 'bg-[#087F78] text-white'
                        : 'border border-[#CBD5E1] text-[#163C3A] hover:bg-white'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل المحتوى</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Section Editor Card */}
      {selectedSection && (
        <form
          onSubmit={handleSaveSection}
          className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#087F78]" />
              <h3 className="text-base font-bold text-[#163C3A]">
                تعديل محتوى قسم: {selectedSection.title || selectedSection.id}
              </h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-bold text-[#163C3A]">
                {selectedSection.is_visible ? 'القسم مفعّل ومعروض' : 'القسم معطّل ومخفي'}
              </span>
              <input
                type="checkbox"
                checked={selectedSection.is_visible}
                onChange={(e) => handleBasicChange('is_visible', e.target.checked)}
                className="w-4 h-4 text-[#087F78] rounded-md focus:ring-[#087F78]"
              />
            </label>
          </div>

          {/* Common Section Meta Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                عنوان القسم الرئيسي
              </label>
              <input
                type="text"
                value={selectedSection.title}
                onChange={(e) => handleBasicChange('title', e.target.value)}
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                العنوان الفرعي أو الوصف المختصر
              </label>
              <input
                type="text"
                value={selectedSection.subtitle || ''}
                onChange={(e) => handleBasicChange('subtitle', e.target.value)}
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                شارة القسم (Badge Text)
              </label>
              <input
                type="text"
                value={selectedSection.badge_text || ''}
                onChange={(e) => handleBasicChange('badge_text', e.target.value)}
                placeholder="مثال: الحجز الإلكتروني متاح الآن"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>
          </div>

          {/* Specialized Section Editors */}
          {selectedSection.id === 'hero' && (
            <HeroSectionSubEditor
              content={selectedSection.content as HeroSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'hero' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'trust_stats' && (
            <TrustStatsSectionSubEditor
              content={selectedSection.content as TrustStatsSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'trust_stats' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'primary_actions' && (
            <PrimaryActionsSectionSubEditor
              content={selectedSection.content as PrimaryActionsSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'primary_actions' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'how_it_works' && (
            <HowItWorksSectionSubEditor
              content={selectedSection.content as HowItWorksSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'how_it_works' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'hospital_banner' && (
            <HospitalBannerSectionSubEditor
              content={selectedSection.content as HospitalBannerSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'hospital_banner' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'trust_info' && (
            <TrustInfoSectionSubEditor
              content={selectedSection.content as TrustInfoSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'trust_info' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {selectedSection.id === 'faq' && (
            <FaqSectionSubEditor
              content={selectedSection.content as FaqSectionContent}
              onChange={(newContent) =>
                setSections((prev) =>
                  prev.map((s) => (s.id === 'faq' ? { ...s, content: newContent } : s))
                )
              }
            />
          )}

          {/* Save Action */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#F1F5F9]">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-[#087F78] hover:bg-[#066560] text-white px-8 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ والنشر...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ تعديلات القسم ونشرها فورياً</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// SUB-EDITORS FOR HOMEPAGE SECTIONS
// -------------------------------------------------------------

function HeroSectionSubEditor({
  content,
  onChange,
}: {
  content: HeroSectionContent;
  onChange: (c: HeroSectionContent) => void;
}) {
  const updateField = (field: keyof HeroSectionContent, val: any) => {
    onChange({ ...content, [field]: val });
  };

  const updateBullet = (idx: number, field: string, val: string) => {
    const updatedBullets = [...(content.feature_card_bullets || [])];
    updatedBullets[idx] = { ...updatedBullets[idx], [field]: val };
    onChange({ ...content, feature_card_bullets: updatedBullets });
  };

  return (
    <div className="space-y-6 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">نصوص وأزرار واجهة الهيرو (Hero Banner)</h4>

      <div>
        <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
          فقرة الشرح الترحيبية
        </label>
        <textarea
          rows={2}
          value={content.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Primary CTA */}
        <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#163C3A]">زر الإجراء الأساسي (Primary CTA)</span>
            <input
              type="checkbox"
              checked={content.primary_cta_visible !== false}
              onChange={(e) => updateField('primary_cta_visible', e.target.checked)}
              className="w-4 h-4 text-[#087F78] rounded-md"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">نص الزر</label>
            <input
              type="text"
              value={content.primary_cta_label || ''}
              onChange={(e) => updateField('primary_cta_label', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">الرابط الموجه</label>
            <input
              type="text"
              value={content.primary_cta_url || ''}
              onChange={(e) => updateField('primary_cta_url', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 font-mono"
            />
          </div>
        </div>

        {/* Secondary CTA */}
        <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#163C3A]">زر الإجراء الثانوي (Secondary CTA)</span>
            <input
              type="checkbox"
              checked={content.secondary_cta_visible !== false}
              onChange={(e) => updateField('secondary_cta_visible', e.target.checked)}
              className="w-4 h-4 text-[#087F78] rounded-md"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">نص الزر</label>
            <input
              type="text"
              value={content.secondary_cta_label || ''}
              onChange={(e) => updateField('secondary_cta_label', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">الرابط الموجه</label>
            <input
              type="text"
              value={content.secondary_cta_url || ''}
              onChange={(e) => updateField('secondary_cta_url', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Feature Card Bullets */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-[#163C3A]">بطاقة مميزات الحجز الجانبية (Feature Card)</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">عنوان البطاقة</label>
            <input
              type="text"
              value={content.feature_card_title || ''}
              onChange={(e) => updateField('feature_card_title', e.target.value)}
              className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">شارة البطاقة</label>
            <input
              type="text"
              value={content.feature_card_badge || ''}
              onChange={(e) => updateField('feature_card_badge', e.target.value)}
              className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6E85] mb-1">تذييل البطاقة</label>
            <input
              type="text"
              value={content.feature_card_footer || ''}
              onChange={(e) => updateField('feature_card_footer', e.target.value)}
              className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5"
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          {content.feature_card_bullets?.map((bullet, bIdx) => (
            <div key={bIdx} className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={bullet.title}
                onChange={(e) => updateBullet(bIdx, 'title', e.target.value)}
                placeholder="عنوان الميزة"
                className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 font-bold text-[#163C3A]"
              />
              <input
                type="text"
                value={bullet.desc}
                onChange={(e) => updateBullet(bIdx, 'desc', e.target.value)}
                placeholder="وصف الميزة"
                className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 text-[#5A6E85] sm:col-span-2"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrustStatsSectionSubEditor({
  content,
  onChange,
}: {
  content: TrustStatsSectionContent;
  onChange: (c: TrustStatsSectionContent) => void;
}) {
  const updateItem = (idx: number, field: string, val: string) => {
    const updated = [...(content.items || [])];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange({ items: updated });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">مؤشرات وإحصائيات الثقة (4 بطاقات)</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {content.items?.map((item, idx) => (
          <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
            <span className="text-[11px] font-bold text-[#087F78]">مؤشر رقم {idx + 1}</span>
            <div>
              <label className="block text-[10px] text-[#5A6E85]">القيمة الرقمية (Value)</label>
              <input
                type="text"
                value={item.value}
                onChange={(e) => updateItem(idx, 'value', e.target.value)}
                className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#5A6E85]">العنوان (Label)</label>
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(idx, 'label', e.target.value)}
                className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#5A6E85]">الوصف التوضيحي</label>
              <input
                type="text"
                value={item.desc}
                onChange={(e) => updateItem(idx, 'desc', e.target.value)}
                className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryActionsSectionSubEditor({
  content,
  onChange,
}: {
  content: PrimaryActionsSectionContent;
  onChange: (c: PrimaryActionsSectionContent) => void;
}) {
  const updateField = (field: keyof PrimaryActionsSectionContent, val: string) => {
    onChange({ ...content, [field]: val });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">بطاقات الإجراءات السريعة (حجز جديد / متابعة حجز)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1 */}
        <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
          <span className="text-xs font-bold text-[#087F78]">بطاقة حجز موعد جديد</span>
          <input
            type="text"
            value={content.card1_title || ''}
            onChange={(e) => updateField('card1_title', e.target.value)}
            placeholder="عنوان البطاقة"
            className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1.5 font-bold"
          />
          <textarea
            rows={2}
            value={content.card1_desc || ''}
            onChange={(e) => updateField('card1_desc', e.target.value)}
            placeholder="وصف الإجراء"
            className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg p-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={content.card1_btn || ''}
              onChange={(e) => updateField('card1_btn', e.target.value)}
              placeholder="نص الزر"
              className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1"
            />
            <input
              type="text"
              value={content.card1_url || ''}
              onChange={(e) => updateField('card1_url', e.target.value)}
              placeholder="رابط التوجيه"
              className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 font-mono"
            />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
          <span className="text-xs font-bold text-sky-700">بطاقة متابعة حجز قائم</span>
          <input
            type="text"
            value={content.card2_title || ''}
            onChange={(e) => updateField('card2_title', e.target.value)}
            placeholder="عنوان البطاقة"
            className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1.5 font-bold"
          />
          <textarea
            rows={2}
            value={content.card2_desc || ''}
            onChange={(e) => updateField('card2_desc', e.target.value)}
            placeholder="وصف الإجراء"
            className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg p-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={content.card2_btn || ''}
              onChange={(e) => updateField('card2_btn', e.target.value)}
              placeholder="نص الزر"
              className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1"
            />
            <input
              type="text"
              value={content.card2_url || ''}
              onChange={(e) => updateField('card2_url', e.target.value)}
              placeholder="رابط التوجيه"
              className="text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorksSectionSubEditor({
  content,
  onChange,
}: {
  content: HowItWorksSectionContent;
  onChange: (c: HowItWorksSectionContent) => void;
}) {
  const updateStep = (idx: number, field: string, val: string) => {
    const updated = [...(content.steps || [])];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange({ steps: updated });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">خطوات الحجز المبسطة (3 خطوات)</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {content.steps?.map((step, idx) => (
          <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#087F78]">الخطوة {step.num}</span>
            </div>
            <input
              type="text"
              value={step.title}
              onChange={(e) => updateStep(idx, 'title', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1.5 font-bold"
            />
            <textarea
              rows={2}
              value={step.desc}
              onChange={(e) => updateStep(idx, 'desc', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg p-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HospitalBannerSectionSubEditor({
  content,
  onChange,
}: {
  content: HospitalBannerSectionContent;
  onChange: (c: HospitalBannerSectionContent) => void;
}) {
  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">بانر المستشفى والمنظومة الشاملة</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#5A6E85] mb-1">نص زر التوجيه</label>
          <input
            type="text"
            value={content.btn_label || ''}
            onChange={(e) => onChange({ ...content, btn_label: e.target.value })}
            className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#5A6E85] mb-1">رابط الزر الخارجي</label>
          <input
            type="text"
            value={content.btn_url || ''}
            onChange={(e) => onChange({ ...content, btn_url: e.target.value })}
            className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 font-mono"
          />
        </div>
      </div>
    </div>
  );
}

function TrustInfoSectionSubEditor({
  content,
  onChange,
}: {
  content: TrustInfoSectionContent;
  onChange: (c: TrustInfoSectionContent) => void;
}) {
  const updatePillar = (idx: number, field: string, val: string) => {
    const updated = [...(content.pillars || [])];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange({ pillars: updated });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <h4 className="text-xs font-bold text-[#163C3A]">ركائز الثقة والاعتماد الطبي (3 ركائز)</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {content.pillars?.map((pillar: any, idx: number) => (
          <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
            <span className="text-xs font-bold text-[#087F78]">ركيزة {idx + 1}</span>
            <input
              type="text"
              value={pillar.title}
              onChange={(e) => updatePillar(idx, 'title', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2 py-1 font-bold"
            />
            <textarea
              rows={2}
              value={pillar.desc}
              onChange={(e) => updatePillar(idx, 'desc', e.target.value)}
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg p-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqSectionSubEditor({
  content,
  onChange,
}: {
  content: FaqSectionContent;
  onChange: (c: FaqSectionContent) => void;
}) {
  const items = content.items || [];

  const updateItem = (idx: number, field: string, val: any) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange({ items: updated });
  };

  const addItem = () => {
    onChange({
      items: [
        ...items,
        {
          q: 'سؤال شائع جديد؟',
          a: 'إجابة واضحة ومبسطة للمرضى وذويهم.',
          is_active: true,
        },
      ],
    });
  };

  const removeItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    onChange({ items: updated });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[#F1F5F9]">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#163C3A]">الأسئلة الشائعة وإجاباتها ({items.length})</h4>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs bg-[#087F78] hover:bg-[#066560] text-white px-3 py-1.5 rounded-xl font-bold transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة سؤال جديد</span>
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#087F78]">سؤال {idx + 1}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-[#5A6E85] cursor-pointer">
                  <span>{item.is_active !== false ? 'مفعّل' : 'معطّل'}</span>
                  <input
                    type="checkbox"
                    checked={item.is_active !== false}
                    onChange={(e) => updateItem(idx, 'is_active', e.target.checked)}
                    className="w-3.5 h-3.5 text-[#087F78] rounded-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="حذف السؤال"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input
              type="text"
              value={item.q}
              onChange={(e) => updateItem(idx, 'q', e.target.value)}
              placeholder="نص السؤال"
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 font-bold text-[#163C3A]"
            />

            <textarea
              rows={2}
              value={item.a}
              onChange={(e) => updateItem(idx, 'a', e.target.value)}
              placeholder="نص الإجابة"
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg p-2 text-[#5A6E85]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

