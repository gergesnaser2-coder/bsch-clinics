'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Clock,
  MapPin,
  Calendar,
  User,
  Printer,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Appointment } from '@/types';
import { getStatusDisplay, formatArabicDate } from '@/lib/rules';

function TrackContent() {
  const searchParams = useSearchParams();
  const initialRef = searchParams.get('ref') || searchParams.get('q') || '';
  const initialPhone = searchParams.get('phone') || '';

  const [refQuery, setRefQuery] = useState(initialRef);
  const [phoneQuery, setPhoneQuery] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cancellation modal state
  const [cancellingAptId, setCancellingAptId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!initialRef || !initialPhone) return;
    let active = true;

    async function fetchInitial() {
      setLoading(true);
      setHasSearched(true);
      try {
        const res = await fetch(
          `/api/appointments/track?ref=${encodeURIComponent(initialRef.trim())}&phone=${encodeURIComponent(initialPhone.trim())}`
        );
        const data = await res.json();
        if (active) {
          if (data.success && data.appointments) {
            setAppointments(data.appointments);
          } else {
            setErrorMessage(data.error || 'تعذر العثور على الحجز');
          }
        }
      } catch (err) {
        console.error(err);
        if (active) setErrorMessage('حدث خطأ أثناء الاتصال بالخادم');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchInitial();
    return () => {
      active = false;
    };
  }, [initialRef, initialPhone]);

  async function handleSearch(r?: string, p?: string) {
    const curRef = (r !== undefined ? r : refQuery).trim();
    const curPhone = (p !== undefined ? p : phoneQuery).trim();

    if (!curRef || !curPhone) {
      setErrorMessage('لأسباب أمنية وحماية خصوصية بيانات المرضى، يلزم إدخال كل من الرقم المرجعي ورقم الهاتف المسجل معاً.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);

    try {
      const res = await fetch(
        `/api/appointments/track?ref=${encodeURIComponent(curRef)}&phone=${encodeURIComponent(curPhone)}`
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'تعذر البحث عن الحجز');
        setAppointments([]);
      } else {
        setAppointments(data.appointments || []);
      }
    } catch (err) {
      console.error('Error tracking appointment:', err);
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
        // Refresh search results
        await handleSearch(refQuery, phoneQuery);
        setCancellingAptId(null);
        setCancelReason('');
      } else {
        alert(data.error || 'تعذر إلغاء الموعد');
      }
    } catch (err) {
      console.error('Cancel error:', err);
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
          الاستعلام الآمن بالرقم المرجعي ورقم الهاتف المسجل معاً
        </span>
      </div>

      {/* Header of Tracking */}
      <div className="text-center mb-6 space-y-2">
        <div className="w-13 h-13 rounded-2xl bg-[#0284C7] text-white flex items-center justify-center mx-auto shadow-sm">
          <Search className="w-7 h-7 stroke-[2]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A]">
          متابعة الحجز
        </h1>
        <p className="text-xs sm:text-sm text-[#8493A6]">
          تحقق أمني مزدوج: أدخل الرقم المرجعي ورقم الهاتف المسجل لحماية خصوصيتك
        </p>
      </div>

      {/* Search Input Box */}
      <div className="bg-white rounded-[22px] border border-[#E2E8EE] p-4 sm:p-5 shadow-xs max-w-xl mx-auto mb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1">
                الرقم المرجعي للحجز <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={refQuery}
                onChange={(e) => setRefQuery(e.target.value)}
                placeholder="مثال: BSCH-1042"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8EE] focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]/20 bg-[#F6F9FB] text-xs sm:text-sm text-[#163C3A] text-right font-mono font-bold placeholder:text-[#8493A6] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1">
                رقم الهاتف المسجل <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8EE] focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]/20 bg-[#F6F9FB] text-xs sm:text-sm text-[#163C3A] text-right font-mono font-bold placeholder:text-[#8493A6] transition-all"
              />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-3xs text-[#8493A6]">
              يُشترط تطابق الرقمين لحماية سرية المريض
            </span>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all shrink-0 cursor-pointer disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'استعلام عن الحجز'}
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="max-w-xl mx-auto mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-3 text-right">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Results View */}
      {hasSearched && (
        <div className="space-y-6">
          {appointments.length === 0 ? (
            <div className="bg-white rounded-[22px] border border-[#E2E8EE] p-8 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#124E4A] mb-1">لم يتم العثور على حجوزات</h3>
              <p className="text-xs text-[#8493A6] mb-5">
                تأكد من إدخال كل من الرقم المرجعي (BSCH-XXXX) ورقم الهاتف المسجل معاً بشكل صحيح للحصول على تفاصيل الموعد.
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
                  key={apt.id}
                  className="bg-white rounded-[22px] border border-[#E2E8EE] p-6 sm:p-7 shadow-xs text-right relative overflow-hidden"
                >
                  {/* Top Bar: Reference & Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#E6F4F2] text-[#087F78] flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-2xs text-[#8493A6] block">الرقم المرجعي</span>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 py-5 border-b border-slate-100 text-xs">
                    <div>
                      <span className="text-[#8493A6] block mb-1">اسم المريض</span>
                      <span className="font-bold text-[#163C3A] text-sm flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#087F78]" />
                        <span>{apt.patientName}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[#8493A6] block mb-1">العيادة والمكان</span>
                      <span className="font-bold text-[#087F78] text-sm block">{apt.clinicName}</span>
                    </div>

                    <div>
                      <span className="text-[#8493A6] block mb-1">تاريخ الموعد</span>
                      <span className="font-bold text-[#163C3A] text-sm block">
                        {formatArabicDate(apt.appointmentDate)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#8493A6] block mb-1">وقت الموعد</span>
                      <span className="font-bold text-[#163C3A] text-sm block font-mono">
                        الساعة {apt.appointmentTime}
                      </span>
                    </div>
                  </div>

                  {/* Instructions & Status History */}
                  <div className="py-4 space-y-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-[#8493A6] leading-relaxed flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#087F78] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#124E4A] ml-1">تعليمات الحضور:</span>
                        يرجى الحضور قبل الموعد بـ 20 دقيقة، والتوجه لمكتب الاستقبال بالدور الأرضي لاستلام تذكرة النداء بعد إبراز الرقم المرجعي أو رقم الهاتف.
                      </div>
                    </div>

                    {apt.statusHistory && apt.statusHistory.length > 0 && (
                      <div className="pt-2">
                        <span className="text-2xs font-semibold text-[#8493A6] block mb-2">سجل متابعة الطلب:</span>
                        <div className="space-y-1.5">
                          {apt.statusHistory.map((item, histIdx) => (
                            <div key={histIdx} className="text-2xs text-[#8493A6] flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#087F78]" />
                              <span>{item.note || getStatusDisplay(item.status).label}</span>
                              <span className="font-mono text-slate-400">
                                ({new Date(item.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-[#163C3A] hover:bg-slate-50 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#087F78]" />
                      <span>طباعة التذكرة</span>
                    </button>

                    {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                      <button
                        onClick={() => setCancellingAptId(apt.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>إلغاء الحجز</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Link to Book a new appointment (Matching screenshot 4) */}
      <div className="text-center mt-10">
        <Link
          href="/appointments/new"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#087F78] hover:text-[#124E4A] hover:underline"
        >
          <span>ليس لديك حجز؟ احجز موعدًا الآن</span>
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
