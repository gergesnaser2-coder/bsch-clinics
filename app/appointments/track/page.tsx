'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Clock,
  Calendar,
  User,
  Printer,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Info,
  Phone,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Appointment } from '@/types';
import { getStatusDisplay, formatArabicDate } from '@/lib/rules';

function TrackContent() {
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get('phone') || '';

  const [phoneQuery, setPhoneQuery] = useState(initialPhone);

  // OTP flow state: strictly phone-number based as requested by hospital client
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'RESULTS'>('PHONE');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cancellation modal state
  const [cancellingAptId, setCancellingAptId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Request OTP for phone-only tracking via POST
  async function handleRequestOtp() {
    const cleanPhone = phoneQuery.trim();
    if (!cleanPhone) {
      setErrorMessage('يرجى إدخال رقم الهاتف المسجل بالحجز');
      return;
    }

    setIsSendingOtp(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/appointments/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', phone: cleanPhone }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'تعذر إرسال رمز التحقق');
      } else {
        setStep('OTP');
        setOtpNotice(data.demoNotice || 'تم إرسال رمز التحقق إلى رقم هاتفك المحمول');
      }
    } catch (err) {
      console.error('Request OTP error');
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSendingOtp(false);
    }
  }

  // Verify OTP and fetch appointments via POST (credentials never in URL)
  async function handleVerifyOtpAndFetch() {
    const cleanPhone = phoneQuery.trim();
    const cleanOtp = otpCode.trim();

    if (!cleanOtp) {
      setErrorMessage('يرجى إدخال رمز التحقق المكون من 4 أرقام');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);

    try {
      const res = await fetch('/api/appointments/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          phone: cleanPhone,
          otp: cleanOtp,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'رمز التحقق غير صحيح أو تعذر الاستعلام');
        setAppointments([]);
      } else {
        setAppointments(data.appointments || []);
        setStep('RESULTS');
      }
    } catch (err) {
      console.error('Error tracking appointment');
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة مرة أخرى');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancellingAptId) return;
    setIsCancelling(true);

    try {
      const res = await fetch(`/api/appointments/${cancellingAptId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'طلب إلغاء من المريض' }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh by re-verifying or marking cancelled in local state
        setAppointments((prev) =>
          prev.map((a) =>
            (a.id === cancellingAptId || a.referenceNumber === cancellingAptId)
              ? { ...a, status: 'CANCELLED' }
              : a
          )
        );
        setCancellingAptId(null);
        setCancelReason('');
      } else {
        alert(data.error || 'تعذر إلغاء الموعد');
      }
    } catch (err) {
      console.error('Cancel error');
      alert('حدث خطأ أثناء إلغاء الحجز');
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="w-full max-w-[900px] mx-auto px-4 sm:px-6 py-8">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex items-center justify-between text-xs text-[#8493A6]">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-[#087F78] transition-colors">
          <ArrowRight className="w-3.5 h-3.5" />
          <span>العودة للرئيسية</span>
        </Link>
        <span className="text-xs text-[#8493A6]">
          متابعة الحجز برقم الهاتف المسجل
        </span>
      </div>

      {/* Header of Tracking */}
      <div className="text-center mb-6 space-y-2">
        <div className="w-13 h-13 rounded-2xl bg-[#0284C7] text-white flex items-center justify-center mx-auto shadow-xs">
          <Search className="w-7 h-7 stroke-[2]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A]">
          متابعة الحجز برقم الهاتف
        </h1>
        <p className="text-xs sm:text-sm text-[#8493A6] max-w-md mx-auto">
          أدخل رقم الهاتف المسجل عند الحجز لتأكيد الهوية واستعراض تذكرة الموعد ورقم الدور
        </p>
      </div>

      {/* Main Input Box */}
      <div className="bg-white rounded-[22px] border border-[#E2E8EE] p-5 sm:p-6 shadow-xs max-w-xl mx-auto mb-8 text-right">
        {step !== 'RESULTS' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 'PHONE') {
                handleRequestOtp();
              } else if (step === 'OTP') {
                handleVerifyOtpAndFetch();
              }
            }}
            className="space-y-4"
          >
            {/* Phone Number Input */}
            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1.5 flex items-center justify-between">
                <span>رقم هاتف ولي الأمر المسجل بالحجز <span className="text-red-500">*</span></span>
                {step === 'OTP' && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('PHONE');
                      setOtpCode('');
                      setErrorMessage(null);
                    }}
                    className="text-2xs text-[#087F78] hover:underline"
                  >
                    تغيير الرقم
                  </button>
                )}
              </label>
              <div className="relative">
                <input
                  type="tel"
                  dir="ltr"
                  disabled={step === 'OTP'}
                  value={phoneQuery}
                  onChange={(e) => setPhoneQuery(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className={`w-full px-3.5 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]/20 text-xs sm:text-sm text-[#163C3A] text-right font-mono font-bold placeholder:text-[#8493A6] transition-all ${
                    step === 'OTP' ? 'bg-slate-100/70 text-slate-500' : 'bg-[#F6F9FB]'
                  }`}
                />
                <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* STEP 2: OTP Verification Card */}
            {step === 'OTP' && (
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200/80 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#087F78] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[#124E4A]">تأكيد ملكية رقم الهاتف</h4>
                    <p className="text-2xs text-[#5A6B82] leading-relaxed mt-0.5">
                      لحماية خصوصية بيانات طفلك، تم إرسال رمز تحقق مكوّن من 4 أرقام لهاتفك المحمول.
                    </p>
                  </div>
                </div>

                {otpNotice && (
                  <div className="p-2.5 rounded-lg bg-white border border-teal-200 text-teal-800 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#087F78]" />
                    <span>{otpNotice}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">
                    أدخل رمز التحقق (4 أرقام) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    dir="ltr"
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="••••"
                    className="w-full px-4 py-2.5 rounded-xl border border-teal-300 focus:border-[#087F78] bg-white text-center font-mono text-lg font-bold tracking-widest text-[#124E4A]"
                  />
                </div>

                <div className="flex items-center justify-between text-2xs text-[#8493A6] pt-1">
                  <span>صلاحية الرمز 5 دقائق</span>
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={isSendingOtp}
                    className="text-[#087F78] font-bold hover:underline disabled:opacity-50"
                  >
                    إعادة إرسال الرمز
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              {step === 'PHONE' ? (
                <button
                  type="submit"
                  disabled={isSendingOtp || loading}
                  className="w-full py-3 rounded-xl bg-[#087F78] hover:bg-[#124E4A] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSendingOtp || loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>متابعة الحجز برقم الهاتف</span>
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#087F78] hover:bg-[#124E4A] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>تأكيد الرمز وعرض الحجز</span>
                  )}
                </button>
              )}
            </div>
          </form>
        ) : (
          /* Step === 'RESULTS': Compact bar to search again */
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[#8493A6]">نتائج الاستعلام للرقم:</span>
              <strong className="font-mono text-[#124E4A] font-bold">{phoneQuery}</strong>
            </div>
            <button
              onClick={() => {
                setStep('PHONE');
                setAppointments([]);
                setHasSearched(false);
                setOtpCode('');
                setErrorMessage(null);
              }}
              className="text-[#087F78] font-bold hover:underline"
            >
              استعلام برقم هاتف آخر
            </button>
          </div>
        )}
      </div>

      {/* Results View */}
      {hasSearched && step === 'RESULTS' && (
        <div className="space-y-6">
          {appointments.length === 0 ? (
            <div className="bg-white rounded-[22px] border border-[#E2E8EE] p-8 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#124E4A] mb-1">لا توجد حجوزات مسجلة</h3>
              <p className="text-xs text-[#8493A6] mb-5">
                لا توجد حجوزات قائمة مسجلة برقم هذا الهاتف. يمكنك حجز موعد جديد في عيادات المستشفى التخصصية.
              </p>
              <Link
                href="/appointments/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#087F78] hover:bg-[#124E4A] text-white text-xs font-bold transition-all"
              >
                <span>حجز موعد جديد الآن</span>
              </Link>
            </div>
          ) : (
            appointments.map((apt) => {
              const status = getStatusDisplay(apt.status);
              return (
                <div
                  key={apt.id || apt.referenceNumber}
                  className="bg-white rounded-[22px] border border-[#E2E8EE] p-6 sm:p-7 shadow-xs text-right relative overflow-hidden"
                >
                  {/* Top Bar: Reference & Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#E6F4F2] text-[#087F78] flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-2xs text-[#8493A6] block">الرقم المرجعي للحجز</span>
                        <span className="text-lg sm:text-xl font-black text-[#124E4A] font-mono tracking-wide">
                          {apt.referenceNumber}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border"
                        style={{
                          backgroundColor: status.bg,
                          color: status.color,
                          borderColor: status.border,
                        }}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{status.label}</span>
                      </span>

                      {apt.queueNumber && apt.status !== 'CANCELLED' && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#E6F4F2] text-[#087F78] border border-[#B2DFDB]">
                          دورك في العيادة: #{apt.queueNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body: Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 py-5 border-b border-slate-100 text-xs">
                    <div>
                      <span className="text-[#8493A6] block mb-1">اسم المريض</span>
                      <span className="font-bold text-[#163C3A] text-sm flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#087F78]" />
                        <span>{apt.patientName}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[#8493A6] block mb-1">العيادة التخصصية</span>
                      <span className="font-bold text-[#087F78] text-sm block">{apt.clinicName}</span>
                    </div>

                    <div>
                      <span className="text-[#8493A6] block mb-1">تاريخ الحضور المقرر</span>
                      <span className="font-bold text-[#163C3A] text-sm block">
                        {formatArabicDate(apt.appointmentDate)}
                      </span>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="py-4 space-y-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-[#8493A6] leading-relaxed flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#087F78] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#124E4A] ml-1">تعليمات الحضور:</span>
                        يرجى الحضور في يوم الموعد والتوجه لمكتب الاستقبال بالدور الأرضي لاستلام تذكرة النداء الآلي بعد إبراز رقم الهاتف المسجل.
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-[#163C3A] hover:bg-slate-50 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#087F78]" />
                      <span>طباعة تذكرة الحجز</span>
                    </button>

                    {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                      <button
                        onClick={() => setCancellingAptId(apt.id || apt.referenceNumber)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>إلغاء الموعد</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Link to Book a new appointment */}
      <div className="text-center mt-10">
        <Link
          href="/appointments/new"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#087F78] hover:text-[#124E4A] hover:underline"
        >
          <span>ليس لديك حجز؟ احجز موعدًا جديداً الآن</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Cancellation Modal */}
      {cancellingAptId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-[#124E4A]">تأكيد إلغاء الموعد</h3>
              <p className="text-xs text-[#8493A6] mt-1">
                هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟ سيتم إتاحة الموعد فوراً لمرضى آخرين.
              </p>
            </div>

            <div>
              <label htmlFor="cancelReason" className="block text-xs font-semibold text-[#163C3A] mb-1">
                سبب الإلغاء (اختياري)
              </label>
              <input
                id="cancelReason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثال: تعذر الحضور / تغيير الموعد"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#163C3A] text-right"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingAptId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                {isCancelling ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackAppointmentPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F6F9FB]">
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<div className="p-12 text-center text-sm text-[#8493A6]">جاري التحميل...</div>}>
          <TrackContent />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
