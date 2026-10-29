'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarPlus,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Printer,
  Search,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Clinic, Appointment, AppointmentSlot } from '@/types';
import { normalizeAndValidateEgyptianPhone, validatePatientName, formatArabicDate } from '@/lib/rules';

function getDefaultBookingDate(): string {
  const today = new Date();
  const target = new Date(today);
  target.setDate(today.getDate() + 1);
  if (target.getDay() === 5) {
    target.setDate(target.getDate() + 1);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function NewAppointmentPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);

  // Form State
  const [patientName, setPatientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getDefaultBookingDate);
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Slots State
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Fetch Clinics on mount
  useEffect(() => {
    let active = true;
    async function loadClinics() {
      try {
        const res = await fetch('/api/clinics');
        const data = await res.json();
        if (active && data.clinics && data.clinics.length > 0) {
          setClinics(data.clinics);
          const urlParams = new URLSearchParams(window.location.search);
          const targetClinicId = urlParams.get('clinic');
          const matched = targetClinicId ? data.clinics.find((c: Clinic) => c.id === targetClinicId) : null;
          setSelectedClinicId(matched ? matched.id : data.clinics[0].id);
        }
      } catch (err) {
        console.error('Error fetching clinics:', err);
      } finally {
        if (active) setLoadingClinics(false);
      }
    }
    loadClinics();
    return () => {
      active = false;
    };
  }, []);

  // Fetch slots whenever selectedClinicId or selectedDate changes
  useEffect(() => {
    if (!selectedClinicId || !selectedDate) return;

    let isMounted = true;
    async function loadSlots() {
      setLoadingSlots(true);
      try {
        const res = await fetch(`/api/slots?clinicId=${selectedClinicId}&date=${selectedDate}`);
        const data = await res.json();
        if (isMounted) {
          if (data.slots && data.slots.length > 0) {
            setSlots(data.slots);
            const firstOpen = data.slots.find((s: AppointmentSlot) => s.isAvailable);
            setSelectedTime(firstOpen ? firstOpen.time : data.slots[0].time);
          } else {
            setSlots([]);
            setSelectedTime('');
          }
        }
      } catch (err) {
        console.error('Error fetching slots:', err);
      } finally {
        if (isMounted) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      isMounted = false;
    };
  }, [selectedClinicId, selectedDate]);

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // Validate patient name
    const nameVal = validatePatientName(patientName);
    if (!nameVal.isValid) {
      setErrorMessage(nameVal.error || 'يرجى إدخال اسم المريض بشكل صحيح');
      return;
    }

    // Validate phone number
    const phoneVal = normalizeAndValidateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      setErrorMessage(phoneVal.error || 'يرجى إدخال رقم هاتف محمول مصري صحيح');
      return;
    }

    if (!selectedClinicId) {
      setErrorMessage('يرجى اختيار العيادة المطلوبة');
      return;
    }

    if (!selectedDate) {
      setErrorMessage('يرجى اختيار تاريخ الموعد');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: selectedClinicId,
          patientName,
          phoneNumber: phoneVal.normalized,
          patientAge,
          patientAddress,
          appointmentDate: selectedDate,
          appointmentTime: selectedTime || '09:00',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'تعذر تسجيل الحجز، يرجى مراجعة البيانات والمحاولة ثانية.');
      } else {
        setConfirmedAppointment(data.appointment);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage('حدث خطأ في الاتصال بالخادم، يرجى المحاولة بعد قليل.');
    } finally {
      setSubmitting(false);
    }
  }

  // Calculate next 10 dates for fast selection
  const upcomingDates: { dateStr: string; label: string; isFriday: boolean }[] = [];
  const baseDate = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dayOfWeek = d.getDay();
    const isFriday = dayOfWeek === 5;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    upcomingDates.push({
      dateStr,
      label: `${dayNames[dayOfWeek]} (${dd}/${mm})`,
      isFriday,
    });
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F9FB]">
      <SiteHeader />

      <main className="flex-1 w-full max-w-[1000px] mx-auto px-4 sm:px-6 py-8">
        
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between text-xs text-[#8493A6]">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-[#087F78] transition-colors">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة للرئيسية</span>
          </Link>
          <span className="bg-emerald-50 text-[#087F78] px-2.5 py-1 rounded-full font-medium">
            حجز فوري بدون حساب
          </span>
        </div>

        {confirmedAppointment ? (
          /* Confirmation & Ticket View */
          <div className="bg-white rounded-[24px] border border-[#E2E8EE] p-6 sm:p-10 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center max-w-lg mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#087F78] flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A]">
                تم تسجيل طلب الحجز بنجاح!
              </h1>
              <p className="text-sm text-[#8493A6] leading-relaxed">
                تم استلام طلبك وسيتم مراجعته وتأكيده من قبل موظف الحجز. احتفظ بالرقم المرجعي لمتابعة الحجز وتعليمات الحضور.
              </p>
            </div>

            {/* Ticket Card */}
            <div className="mt-8 max-w-xl mx-auto bg-gradient-to-br from-[#F6F9FB] to-white border-2 border-dashed border-[#79C7C1] rounded-[20px] p-6 text-right relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <span className="text-xs text-[#8493A6] block mb-1">الرقم المرجعي للحجز</span>
                  <span className="text-2xl sm:text-3xl font-black text-[#087F78] tracking-wider font-mono">
                    {confirmedAppointment.referenceNumber}
                  </span>
                </div>
                <div className="text-left sm:text-left">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>قيد المراجعة</span>
                  </span>
                  {confirmedAppointment.queueNumber && (
                    <span className="block text-xs text-[#8493A6] mt-1">
                      رقم الدور المبدئي: #{confirmedAppointment.queueNumber}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-200 text-sm">
                <div>
                  <span className="text-xs text-[#8493A6] block">اسم المريض</span>
                  <span className="font-bold text-[#163C3A] text-base">{confirmedAppointment.patientName}</span>
                </div>
                <div>
                  <span className="text-xs text-[#8493A6] block">رقم الهاتف</span>
                  <span className="font-bold text-[#163C3A] font-mono">{confirmedAppointment.phoneNumber}</span>
                </div>
                <div>
                  <span className="text-xs text-[#8493A6] block">العيادة</span>
                  <span className="font-bold text-[#087F78]">{confirmedAppointment.clinicName}</span>
                </div>
                <div>
                  <span className="text-xs text-[#8493A6] block">الموعد والتاريخ</span>
                  <span className="font-bold text-[#163C3A]">
                    {formatArabicDate(confirmedAppointment.appointmentDate)} — الساعة {confirmedAppointment.appointmentTime}
                  </span>
                </div>
              </div>

              <div className="pt-4 text-xs text-[#8493A6] space-y-1">
                <p className="font-semibold text-[#124E4A]">تعليمات الحضور:</p>
                <p>• الحضور قبل الموعد بـ 20 دقيقة لاستلام بطاقة العيادة من شباك الحجز.</p>
                <p>• إحضار شهادة ميلاد الطفل وأي فحوصات سابقة تخص الحالة.</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-300 text-sm font-semibold text-[#163C3A] hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Printer className="w-4 h-4 text-[#087F78]" />
                <span>طباعة إيصال الحجز</span>
              </button>

              <Link
                href={`/appointments/track?ref=${confirmedAppointment.referenceNumber}&phone=${confirmedAppointment.phoneNumber}`}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#087F78] hover:bg-[#124E4A] text-white text-sm font-bold shadow-xs hover:shadow-md transition-all"
              >
                <Search className="w-4 h-4" />
                <span>متابعة حالة الحجز الآن</span>
              </Link>

              <button
                onClick={() => {
                  setConfirmedAppointment(null);
                  setPatientName('');
                  setPhoneNumber('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold text-[#8493A6] hover:text-[#087F78]"
              >
                <span>حجز موعد لطفل آخر</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Booking Form (Matching screenshot 3) */
          <div className="bg-white rounded-[24px] border border-[#E2E8EE] p-6 sm:p-10 shadow-xs">
            
            {/* Header of the Form */}
            <div className="text-center mb-8 space-y-2">
              <div className="w-13 h-13 rounded-2xl bg-[#087F78] text-white flex items-center justify-center mx-auto shadow-sm">
                <CalendarPlus className="w-7 h-7 stroke-[2]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A]">
                حجز موعد جديد
              </h1>
              <p className="text-xs sm:text-sm text-[#8493A6]">
                بدون تسجيل دخول – الاسم ورقم الهاتف فقط
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3 text-right">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 text-right">
              
              {/* Field 1: Patient Name */}
              <div>
                <label htmlFor="patientName" className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                  اسم المريض (رباعي) <span className="text-red-500">*</span>
                </label>
                <input
                  id="patientName"
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="الاسم رباعي"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-[#163C3A] text-sm placeholder:text-[#8493A6] transition-all"
                />
              </div>

              {/* Field 2: Phone Number */}
              <div>
                <label htmlFor="phoneNumber" className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                  رقم الهاتف <span className="text-red-500">*</span>
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  required
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-[#163C3A] text-sm placeholder:text-[#8493A6] text-right transition-all font-mono"
                />
                <span className="block text-2xs text-[#8493A6] mt-1">
                  مكون من 11 رقمًا (يبدأ بـ 010 أو 011 أو 012 أو 015) لمتابعة الحجز
                </span>
              </div>

              {/* Grid 2 Columns: Age & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="patientAge" className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                    السن
                  </label>
                  <input
                    id="patientAge"
                    type="text"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="مثال: 5 سنوات"
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-[#163C3A] text-sm placeholder:text-[#8493A6] transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="patientAddress" className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                    العنوان
                  </label>
                  <input
                    id="patientAddress"
                    type="text"
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    placeholder="مثال: دمنهور – شارع..."
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-[#163C3A] text-sm placeholder:text-[#8493A6] transition-all"
                  />
                </div>
              </div>

              {/* Field 3: Clinic Selection (Matching screenshot 3) */}
              <div className="pt-2">
                <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-3">
                  العيادة <span className="text-red-500">*</span>
                </label>

                {loadingClinics ? (
                  <div className="p-8 text-center text-sm text-[#8493A6]">جاري تحميل العيادات...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {clinics.map((clinic) => {
                      const isSelected = selectedClinicId === clinic.id;
                      return (
                        <button
                          key={clinic.id}
                          type="button"
                          onClick={() => setSelectedClinicId(clinic.id)}
                          className={`p-4 rounded-xl border text-right transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#087F78] bg-[#E6F4F2]/50 shadow-2xs ring-1 ring-[#087F78]'
                              : 'border-[#E2E8EE] bg-white hover:border-[#79C7C1] hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-bold text-sm sm:text-base text-[#124E4A]">
                              {clinic.name}
                            </span>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-[#087F78] text-white flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>

                          {clinic.location && (
                            <p className="text-2xs text-[#8493A6] flex items-center gap-1 mb-2">
                              <MapPin className="w-3 h-3 text-[#087F78] shrink-0" />
                              <span>{clinic.location}</span>
                            </p>
                          )}

                          <div className="flex items-center justify-between text-2xs text-[#8493A6] pt-2 border-t border-slate-100">
                            <span className="flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-[#087F78]" />
                              <span>{clinic.workingHours}</span>
                            </span>
                            <span className="text-[#087F78] font-semibold">متاح اليوم</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Field 4: Date Selection */}
              <div className="pt-2">
                <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                  تاريخ الموعد <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {upcomingDates.slice(0, 7).map((d) => {
                    const isSelected = selectedDate === d.dateStr;
                    return (
                      <button
                        key={d.dateStr}
                        type="button"
                        disabled={d.isFriday}
                        onClick={() => setSelectedDate(d.dateStr)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                          d.isFriday
                            ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                            : isSelected
                            ? 'bg-[#087F78] text-white border-[#087F78] shadow-xs'
                            : 'bg-white border-[#E2E8EE] text-[#163C3A] hover:border-[#79C7C1]'
                        }`}
                      >
                        {d.label}
                        {d.isFriday && ' (عطلة)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 5: Time Slots Selection */}
              {slots.length > 0 && (
                <div className="pt-1">
                  <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-2">
                    الموعد المحدد <span className="text-red-500">*</span>
                  </label>
                  {loadingSlots ? (
                    <div className="text-xs text-[#8493A6]">جاري فحص المواعيد المتاحة...</div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {slots.map((slot) => {
                        const isSelected = selectedTime === slot.time;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={!slot.isAvailable}
                            onClick={() => setSelectedTime(slot.time)}
                            className={`py-2 px-2 rounded-lg text-xs font-mono font-medium transition-all border text-center ${
                              !slot.isAvailable
                                ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                                : isSelected
                                ? 'bg-[#124E4A] text-white border-[#124E4A] shadow-xs font-bold'
                                : 'bg-white border-[#E2E8EE] text-[#163C3A] hover:border-[#087F78]'
                            }`}
                          >
                            <span>{slot.time}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 sm:py-4 rounded-xl bg-[#087F78] hover:bg-[#124E4A] text-white text-base sm:text-lg font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري إرسال طلب الحجز...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>إرسال طلب الحجز</span>
                    </>
                  )}
                </button>

                <p className="text-center text-2xs sm:text-xs text-[#8493A6] mt-4 leading-relaxed">
                  بعد إرسال الطلب سيقوم موظف الحجز بمراجعته وتأكيده، ويمكنك متابعة الحالة وتعليمات الحضور من صفحة &quot;متابعة الحجز&quot;.
                </p>
              </div>

            </form>

          </div>
        )}

      </main>

      <SiteFooter />
    </div>
  );
}
