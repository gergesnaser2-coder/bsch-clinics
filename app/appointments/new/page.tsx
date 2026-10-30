'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  CalendarPlus,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  CreditCard,
  Stethoscope,
  Activity,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Printer,
  Search,
  ArrowRight,
  FileText,
  Info,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { submitBooking } from './actions';
import { normalizeAndValidateEgyptianPhone, validatePatientName, formatArabicDate } from '@/lib/rules';
import type { Clinic, Appointment } from '@/types';

// ============================================================================
// 1. ZOD SCHEMA & TYPES
// ============================================================================

const bookingSchema = z
  .object({
    // Section 1: Patient & Parent Data
    patientName: z
      .string()
      .min(1, 'الاسم الرباعي للمريض مطلوب')
      .refine(
        (val) => validatePatientName(val).isValid,
        'يرجى كتابة الاسم ثلاثياً أو رباعياً على الأقل كما هو مسجل في شهادة الميلاد'
      ),
    ageValue: z
      .string()
      .min(1, 'يرجى كتابة عمر الطفل')
      .refine((val) => {
        const num = Number(val);
        return !isNaN(num) && num > 0 && num <= 120;
      }, 'يرجى إدخال عمر صحيح أكبر من الصفر'),
    ageUnit: z.enum(['سنة', 'شهر', 'يوم'] as const),
    phoneNumber: z
      .string()
      .min(1, 'رقم الهاتف مطلوب لمتابعة الحجز')
      .refine(
        (val) => normalizeAndValidateEgyptianPhone(val).isValid,
        'رقم الهاتف غير صحيح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01 (010 / 011 / 012 / 015)'
      ),
    patientAddress: z
      .string()
      .min(3, 'العنوان بالتفصيل مطلوب (المركز / المدينة / الشارع)'),
    nationalId: z
      .string()
      .optional()
      .refine((val) => {
        if (!val || val.trim() === '') return true;
        const clean = val.replace(/\s+/g, '');
        return /^[0-9]{14}$/.test(clean);
      }, 'الرقم القومي يجب أن يتكون من 14 رقماً بالضبط في حال إدخاله'),

    // Section 2: Clinic & Appointment
    clinicId: z.string().min(1, 'يرجى اختيار العيادة التخصصية المطلوبة'),
    serviceType: z.string().min(1, 'يرجى اختيار نوع الكشف أو الخدمة'),
    appointmentDate: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isWalkInOnly = data.serviceType === 'WALK_IN_PROCEDURE';

    if (!isWalkInOnly && (!data.appointmentDate || data.appointmentDate.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appointmentDate'],
        message: 'يرجى اختيار تاريخ الحضور المتاح بالعيادة',
      });
    }
  });

type BookingFormValues = z.infer<typeof bookingSchema>;

// Service types options
const SERVICE_TYPE_OPTIONS = [
  {
    value: 'EXAMINATION',
    label: 'كشف جديد (استشارة أولى)',
    isWalkInOnly: false,
    badge: 'حجز إلكتروني متاح',
  },
  {
    value: 'FOLLOW_UP',
    label: 'متابعة كشف سابق (إعادة / استشارة دورية)',
    isWalkInOnly: false,
    badge: 'حجز إلكتروني متاح',
  },
  {
    value: 'WALK_IN_PROCEDURE',
    label: 'إجراء طبي / فحص مباشر (حضور مباشر لمكتب الاستقبال)',
    isWalkInOnly: true,
    badge: 'حضور مباشر',
  },
];

// Helper: check if a service is Walk-in Only
function isWalkInOnlyService(serviceType: string): boolean {
  return serviceType === 'WALK_IN_PROCEDURE';
}

// ============================================================================
// 2. MAIN PAGE WRAPPER (WITH SUSPENSE FOR SEARCH PARAMS)
// ============================================================================

export default function NewAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#087F78] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewAppointmentForm />
    </Suspense>
  );
}

// ============================================================================
// 3. BOOKING FORM COMPONENT
// ============================================================================

function NewAppointmentForm() {
  const searchParams = useSearchParams();
  const preselectedClinic = searchParams.get('clinic') || '';

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Initialize React Hook Form with Zod Resolver
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      patientName: '',
      ageValue: '',
      ageUnit: 'سنة',
      phoneNumber: '',
      patientAddress: '',
      nationalId: '',
      clinicId: '',
      serviceType: 'EXAMINATION',
      appointmentDate: '',
      notes: '',
    },
    mode: 'onTouched',
  });

  // Watch critical reactive fields
  const selectedClinicId = watch('clinicId');
  const selectedServiceType = watch('serviceType');
  const selectedDate = watch('appointmentDate');

  const isWalkInOnly = isWalkInOnlyService(selectedServiceType);

  // Fetch real clinics from database
  useEffect(() => {
    let active = true;
    async function loadClinics() {
      try {
        const res = await fetch('/api/clinics');
        const data = await res.json();
        if (active && data.clinics && data.clinics.length > 0) {
          setClinics(data.clinics);
          const matched = preselectedClinic
            ? data.clinics.find((c: Clinic) => c.id === preselectedClinic)
            : null;
          setValue('clinicId', matched ? matched.id : data.clinics[0].id);
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
  }, [preselectedClinic, setValue]);

  // Selected clinic details
  const activeClinic = useMemo(() => {
    return clinics.find((c) => c.id === selectedClinicId) || null;
  }, [clinics, selectedClinicId]);

  // Calculate upcoming valid dates constrained by clinic operating days
  const availableDates = useMemo(() => {
    if (!activeClinic) return [];

    const dates: { dateStr: string; label: string; dayOfWeekName: string }[] = [];
    const baseDate = new Date();
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    // Hospital Outpatient Clinics operating days (typically Sat-Thu, Fri off)
    const allowedDays =
      activeClinic.daysOfWeek && activeClinic.daysOfWeek.length > 0
        ? activeClinic.daysOfWeek
        : [0, 1, 2, 3, 4, 6]; // Default: all days except Friday (5)

    for (let i = 1; i <= 21 && dates.length < 10; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const dayOfWeek = d.getDay();

      // Check if day is allowed and not Friday
      if (allowedDays.includes(dayOfWeek) && dayOfWeek !== 5) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        dates.push({
          dateStr,
          label: `${dayNames[dayOfWeek]} (${dd}/${mm})`,
          dayOfWeekName: dayNames[dayOfWeek],
        });
      }
    }

    return dates;
  }, [activeClinic]);

  // If clinic changes and previously chosen date is not valid, default to first available date
  useEffect(() => {
    if (isWalkInOnly) {
      setValue('appointmentDate', '');
      return;
    }
    if (availableDates.length > 0 && !selectedDate) {
      setValue('appointmentDate', availableDates[0].dateStr);
    }
  }, [availableDates, isWalkInOnly, selectedDate, setValue]);

  // Form Submit Handler
  const onSubmit = async (values: BookingFormValues) => {
    setServerError(null);

    // Business Logic Safety: Prevent Walk-in Submission
    if (isWalkInOnlyService(values.serviceType)) {
      setServerError(
        'هذه الخدمة لا تقبل الحجز الإلكتروني المسبق. يلزم الحضور المباشر للمستشفى لمكتب الاستقبال.'
      );
      return;
    }

    setSubmitting(true);

    try {
      // Combined age format
      const combinedAge = `${values.ageValue} ${values.ageUnit}`;

      // Call Server Action
      const result = await submitBooking({
        clinicId: values.clinicId,
        patientName: values.patientName,
        phoneNumber: values.phoneNumber,
        patientAge: combinedAge,
        patientAddress: values.patientAddress,
        nationalId: values.nationalId,
        serviceType: values.serviceType,
        appointmentDate: values.appointmentDate || '',
        appointmentTime: '09:00',
        notes: values.notes,
      });

      if (!result.success || !result.appointment) {
        setServerError(result.error || 'تعذر تسجيل طلب الحجز، يرجى المحاولة لاحقاً');
      } else {
        setConfirmedAppointment(result.appointment);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setServerError('حدث خطأ في الاتصال بالخادم، يرجى إعادة المحاولة بعد قليل.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="flex flex-col min-h-screen bg-slate-50 selection:bg-[#087F78] selection:text-white font-sans antialiased"
    >
      <SiteHeader />

      <main className="flex-1 w-full max-w-[880px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex items-center justify-between text-xs text-slate-500">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-[#087F78] transition-colors font-medium"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة إلى الصفحة الرئيسية</span>
          </Link>
          <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-100/80 text-[#087F78] px-3 py-1 rounded-full font-bold">
            <Sparkles className="w-3 h-3" />
            <span>منظومة الحجز الرقمية المباشرة</span>
          </span>
        </div>

        {confirmedAppointment ? (
          /* ================================================================ */
          /* SUCCESS STATE: CONFIRMATION TICKET                                */
          /* ================================================================ */
          <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200/80 p-6 sm:p-10 shadow-sm animate-in fade-in zoom-in-95 duration-200 text-right">
            <div className="text-center max-w-lg mx-auto space-y-3 pb-6 border-b border-slate-100">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#124E4A] tracking-tight">
                تم تسجيل طلب الحجز بنجاح!
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                تم استلام طلبكم في منظومة العيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة، وهو قيد
                المراجعة والاعتماد من موظف الحجز.
              </p>
            </div>

            {/* Ticket Card Component */}
            <div className="mt-8 max-w-xl mx-auto bg-gradient-to-b from-[#F6F9FB] to-white border-2 border-dashed border-[#79C7C1] rounded-[24px] p-6 relative overflow-hidden shadow-2xs">
              {/* Reference Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                    الرقم المرجعي المعتمد للحجز
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-[#087F78] tracking-widest font-mono">
                    {confirmedAppointment.referenceNumber}
                  </span>
                </div>
                <div className="text-right sm:text-left">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <Clock className="w-3.5 h-3.5" />
                    <span>قيد المراجعة</span>
                  </span>
                  {confirmedAppointment.queueNumber && (
                    <span className="block text-[11px] text-slate-500 mt-1 font-mono">
                      رقم الدور المبدئي: #{confirmedAppointment.queueNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Patient and Clinic Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-200 text-xs sm:text-sm">
                <div>
                  <span className="text-[11px] text-slate-400 block font-semibold">اسم الطفل (المريض)</span>
                  <span className="font-bold text-[#163C3A] text-sm sm:text-base">
                    {confirmedAppointment.patientName}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-semibold">رقم هاتف ولي الأمر</span>
                  <span className="font-bold text-[#163C3A] font-mono text-sm sm:text-base">
                    {confirmedAppointment.phoneNumber}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-semibold">العيادة التخصصية</span>
                  <span className="font-bold text-[#087F78] text-sm sm:text-base">
                    {confirmedAppointment.clinicName}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-semibold">تاريخ وتوقيت الحضور</span>
                  <span className="font-bold text-[#163C3A]">
                    {formatArabicDate(confirmedAppointment.appointmentDate)} — الفترة الصباحية
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <div className="pt-4 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <p className="font-bold text-[#124E4A] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#087F78]" />
                  <span>تعليمات الحضور المؤكدة:</span>
                </p>
                <p>• الحضور لمبنى العيادات الخارجية قبل الموعد بـ 20 دقيقة لاستلام بطاقة العيادة.</p>
                <p>• إحضار أصل شهادة ميلاد الطفل وأي تقارير أو فحوصات طبية سابقة تخص الحالة.</p>
                <p>• يُرجى الاحتفاظ بالرقم المرجعي أو طباعة الإيصال لإبرازه لموظف الاستقبال.</p>

                {activeClinic?.instructions && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 text-teal-900 bg-teal-50/70 p-3 rounded-xl border border-teal-100">
                    <p className="font-bold text-[#124E4A] mb-1 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-[#087F78]" />
                      <span>تنبيه خاص بعيادة {confirmedAppointment.clinicName}:</span>
                    </p>
                    <p className="whitespace-pre-line leading-relaxed text-teal-950 font-medium text-[11px] sm:text-xs">
                      {activeClinic.instructions}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 text-xs sm:text-sm font-bold text-[#163C3A] hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Printer className="w-4 h-4 text-[#087F78]" />
                <span>طباعة إيصال الحجز</span>
              </button>

              <Link
                href={`/appointments/track?ref=${confirmedAppointment.referenceNumber}&phone=${confirmedAppointment.phoneNumber}`}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#087F78] hover:bg-[#066560] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all"
              >
                <Search className="w-4 h-4" />
                <span>متابعة حالة الحجز الآن</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setConfirmedAppointment(null);
                  reset();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold text-slate-500 hover:text-[#087F78] transition-colors"
              >
                <span>حجز موعد لطفل آخر</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* MAIN BOOKING FORM                                                */
          /* ================================================================ */
          <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200/80 p-6 sm:p-10 shadow-sm text-right">
            {/* Header of Form */}
            <div className="text-center mb-8 sm:mb-10 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#087F78] mx-auto shadow-2xs">
                <CalendarPlus className="w-7 h-7 stroke-[2]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#124E4A] tracking-tight">
                حجز موعد جديد بالعيادات الخارجية
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                خدمة رقمية فورية ميسرة لأولياء الأمور — أدخل بيانات الطفل وولي الأمر لاختيار العيادة وتحديد
                الموعد المناسب.
              </p>
            </div>

            {/* Server Error Alert Banner */}
            {serverError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                <span className="leading-relaxed">{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-10" noValidate>
              {/* ============================================================ */}
              {/* SECTION 1: PATIENT & PARENT DATA                             */}
              {/* ============================================================ */}
              <div className="space-y-6">
                {/* Section 1 Title Header with Soft Teal Badge */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-[#087F78] font-black text-sm flex items-center justify-center border border-teal-200/80 shadow-2xs shrink-0">
                    1
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#163C3A]">
                      بيانات المريض وولي الأمر
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      يرجى كتابة البيانات بدقة لمطابقتها مع الأوراق الثبوتية للطفل
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Field 1: Full Name */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="patientName"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      الاسم الرباعي للطفل <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="patientName"
                        type="text"
                        {...register('patientName')}
                        placeholder="اكتب الاسم كما يظهر في شهادة الميلاد"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs focus:outline-hidden ${
                          errors.patientName
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.patientName && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.patientName.message}
                      </p>
                    )}
                  </div>

                  {/* Field 2: Combined Age (Number + Dropdown) */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5">
                      العمر <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="1"
                          max="120"
                          {...register('ageValue')}
                          placeholder="الرقم (مثال: 4)"
                          className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 font-mono transition-all shadow-2xs focus:outline-hidden ${
                            errors.ageValue
                              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                          }`}
                        />
                      </div>
                      <div className="w-32">
                        <select
                          {...register('ageUnit')}
                          className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-[#163C3A] text-xs sm:text-sm font-semibold transition-all focus:border-[#087F78] focus:outline-hidden shadow-2xs cursor-pointer"
                        >
                          <option value="سنة">سنة</option>
                          <option value="شهر">شهر</option>
                          <option value="يوم">يوم</option>
                        </select>
                      </div>
                    </div>
                    {errors.ageValue && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.ageValue.message}
                      </p>
                    )}
                  </div>

                  {/* Field 3: Phone Number */}
                  <div>
                    <label
                      htmlFor="phoneNumber"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      رقم هاتف ولي الأمر <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="phoneNumber"
                        type="tel"
                        dir="ltr"
                        {...register('phoneNumber')}
                        placeholder="01xxxxxxxxx"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 font-mono text-right transition-all shadow-2xs focus:outline-hidden ${
                          errors.phoneNumber
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.phoneNumber ? (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.phoneNumber.message}
                      </p>
                    ) : (
                      <span className="block text-[10.5px] text-slate-400 mt-1">
                        مكون من 11 رقماً (يبدأ بـ 010 أو 011 أو 012 أو 015) لمتابعة وتأكيد الحجز
                      </span>
                    )}
                  </div>

                  {/* Field 4: Address */}
                  <div>
                    <label
                      htmlFor="patientAddress"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      العنوان بالكامل <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="patientAddress"
                        type="text"
                        {...register('patientAddress')}
                        placeholder="مثال: أبو حمص - دمسنا"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs focus:outline-hidden ${
                          errors.patientAddress
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.patientAddress && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.patientAddress.message}
                      </p>
                    )}
                  </div>

                  {/* Field 5: National ID (Optional) */}
                  <div>
                    <label
                      htmlFor="nationalId"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      الرقم القومي للطفل أو ولي الأمر{' '}
                      <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
                    </label>
                    <div className="relative">
                      <input
                        id="nationalId"
                        type="text"
                        dir="ltr"
                        maxLength={14}
                        {...register('nationalId')}
                        placeholder="14 رقماً (من شهادة الميلاد أو البطاقة)"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 font-mono text-right transition-all shadow-2xs focus:outline-hidden ${
                          errors.nationalId
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.nationalId && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.nationalId.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 2: CLINIC & APPOINTMENT                              */}
              {/* ============================================================ */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                {/* Section 2 Title Header with Soft Teal Badge */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-[#087F78] font-black text-sm flex items-center justify-center border border-teal-200/80 shadow-2xs shrink-0">
                    2
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#163C3A]">
                      العيادة وتفاصيل الموعد
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      حدد التخصص الطبي المطلوب ونوع الخدمة وتاريخ الحضور
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Field 6: Clinic Select Dropdown */}
                  <div>
                    <label
                      htmlFor="clinicId"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      العيادة التخصصية <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      {loadingClinics ? (
                        <div className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs text-slate-400 bg-slate-50 flex items-center gap-2">
                          <div className="w-3.5 h-3.5 border-2 border-[#087F78] border-t-transparent rounded-full animate-spin" />
                          <span>جاري تحميل العيادات التخصصية...</span>
                        </div>
                      ) : (
                        <select
                          id="clinicId"
                          {...register('clinicId')}
                          className={`w-full px-4 py-3 rounded-xl border bg-white text-[#163C3A] text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden cursor-pointer ${
                            errors.clinicId
                              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                          }`}
                        >
                          <option value="">-- اختر العيادة --</option>
                          {clinics.map((clinic) => (
                            <option key={clinic.id} value={clinic.id}>
                              {clinic.name} {clinic.location ? `(${clinic.location})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {errors.clinicId && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.clinicId.message}
                      </p>
                    )}
                    {activeClinic && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 text-[#087F78] font-bold">
                          <Clock className="w-3 h-3" />
                          <span>{activeClinic.workingHours || 'أسبقية الحضور وتذاكر اليوم'}</span>
                        </span>
                        <span>•</span>
                        <span>{activeClinic.location || 'مبنى العيادات الخارجية'}</span>
                      </div>
                    )}
                  </div>

                  {/* Field 7: Service Type Select Dropdown */}
                  <div>
                    <label
                      htmlFor="serviceType"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      نوع الكشف أو الخدمة <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="serviceType"
                      {...register('serviceType')}
                      className={`w-full px-4 py-3 rounded-xl border bg-white text-[#163C3A] text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden cursor-pointer ${
                        errors.serviceType
                          ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                          : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                      }`}
                    >
                      {SERVICE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {errors.serviceType && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.serviceType.message}
                      </p>
                    )}
                    <span className="block text-[10.5px] text-slate-400 mt-1">
                      اختر الخدمة المطابقة لحالة الطفل لضمان التوجيه الصحيح
                    </span>
                  </div>

                  {/* ======================================================== */}
                  {/* DYNAMIC CLINIC INSTRUCTIONS & REQUIRED DOCUMENTS BANNER  */}
                  {/* ======================================================== */}
                  {activeClinic?.instructions && (
                    <div className="md:col-span-2 p-4 sm:p-5 rounded-2xl bg-teal-50/90 border border-teal-200/80 text-teal-950 text-xs sm:text-sm animate-in fade-in slide-in-from-top-2 duration-300 shadow-2xs">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-teal-100/90 text-[#087F78] flex items-center justify-center shrink-0 mt-0.5 border border-teal-200 shadow-2xs">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-[#124E4A] text-xs sm:text-sm flex items-center gap-1.5">
                              <span>تعليمات العيادة والأوراق المطلوبة</span>
                              <span className="text-[11px] font-medium text-slate-600">({activeClinic.name})</span>
                            </h4>
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-200/60 text-[#087F78] border border-teal-300/40 shrink-0">
                              تنبيه طبي مسبق
                            </span>
                          </div>
                          <p className="text-teal-950/90 leading-relaxed font-medium whitespace-pre-line text-xs sm:text-sm">
                            {activeClinic.instructions}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ======================================================== */}
                  {/* CRITICAL BUSINESS LOGIC: WALK-IN ONLY WARNING BANNER    */}
                  {/* ======================================================== */}
                  {isWalkInOnly && (
                    <div className="md:col-span-2 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs sm:text-sm space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-amber-950 text-sm">
                            تنبيه هام: هذه الخدمة مخصصة للحضور المباشر فقط
                          </h4>
                          <p className="mt-1 leading-relaxed text-amber-900/90 font-medium">
                            هذه الخدمة لا تقبل الحجز الإلكتروني المسبق. يلزم الحضور المباشر لمكتب الاستقبال
                            بالعيادات الخارجية لتنسيق موعد الفحص وفقاً لأولوية الحالات.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Field 8: Date Selection Dropdown / Datepicker */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="appointmentDate"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      تاريخ الحضور المتاح بالعيادة{' '}
                      {!isWalkInOnly && <span className="text-red-500">*</span>}
                    </label>

                    <div className="relative">
                      <select
                        id="appointmentDate"
                        disabled={isWalkInOnly}
                        {...register('appointmentDate')}
                        className={`w-full px-4 py-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden ${
                          isWalkInOnly
                            ? 'bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                            : errors.appointmentDate
                            ? 'border-red-300 bg-white text-[#163C3A] focus:border-red-500 focus:ring-2 focus:ring-red-100 cursor-pointer'
                            : 'border-slate-200 bg-white text-[#163C3A] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 cursor-pointer'
                        }`}
                      >
                        {isWalkInOnly ? (
                          <option value="">
                            تم تعطيل تحديد الموعد لأن الخدمة تتطلب حضوراً مباشراً
                          </option>
                        ) : (
                          <>
                            <option value="">-- اختر يوماً متاحاً بالعيادة --</option>
                            {availableDates.map((d) => (
                              <option key={d.dateStr} value={d.dateStr}>
                                {d.label}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {errors.appointmentDate && !isWalkInOnly && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.appointmentDate.message}
                      </p>
                    )}

                    {!isWalkInOnly && (
                      <p className="text-[10.5px] text-slate-400 mt-1">
                        تظهر فقط الأيام المعتمدة لعمل العيادة وتستثنى العطلات الرسمية وأيام الجمعة.
                      </p>
                    )}
                  </div>

                  {/* Field 9: Notes (Optional Textarea) */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="notes"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      ملاحظات أو تفاصيل إضافية{' '}
                      <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      {...register('notes')}
                      placeholder="اذكر أي شكوى طبية سابقة، أدوية منتظمة يتناولها الطفل، أو ملاحظات هامة للموظف المختص..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs resize-y focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* FOOTER & SUBMISSION SECTION                                  */}
              {/* ============================================================ */}
              <div className="space-y-5 pt-4">
                {/* Bottom Info Banner with Lock Icon */}
                <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 flex items-start gap-3 text-xs text-[#124E4A] leading-relaxed">
                  <Lock className="w-4 h-4 text-[#087F78] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">ضمان الخصوصية وسرية البيانات:</span>
                    <p className="mt-0.5 text-teal-900/85">
                      الطلب معلق حتى يعتمد من موظف الحجز. سيتم مراجعة الموعد ومطابقة البيانات وإصدار إيصال
                      الحجز المعتمد وفقاً للأولويات الطبية والسعة المقررة للعيادة.
                    </p>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || isWalkInOnly}
                  className={`w-full py-4 rounded-2xl text-white text-sm sm:text-base font-bold shadow-md transition-all flex items-center justify-center gap-2.5 ${
                    isWalkInOnly
                      ? 'bg-slate-300 border border-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : submitting
                      ? 'bg-[#066560] cursor-wait opacity-90'
                      : 'bg-[#087F78] hover:bg-[#066560] active:scale-[0.99] cursor-pointer shadow-teal-900/10 hover:shadow-lg'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري إرسال طلب الحجز للتحقق والاعتماد...</span>
                    </>
                  ) : isWalkInOnly ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-slate-500" />
                      <span>الحجز الإلكتروني غير متاح لهذه الخدمة (حضور مباشر فقط)</span>
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="w-5 h-5" />
                      <span>تأكيد وإرسال طلب الحجز الآن</span>
                    </>
                  )}
                </button>

                <div className="text-center text-[11px] text-slate-400 space-y-1">
                  <p>
                    بالضغط على تأكيد الحجز، أنت تقر بصحة البيانات المدخلة وموافقتك على تعليمات الحضور المعتمدة.
                  </p>
                  <p>
                    هل لديك حجز سابق؟{' '}
                    <Link
                      href="/appointments/track"
                      className="text-[#087F78] hover:underline font-bold"
                    >
                      اضغط هنا لمتابعة حالة حجزك أو إلغائه
                    </Link>
                  </p>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
