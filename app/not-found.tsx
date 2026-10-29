import Link from 'next/link';
import { Stethoscope, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F6F9FB] flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg">
        <div className="w-16 h-16 bg-[#087F78]/10 text-[#087F78] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Stethoscope className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-extrabold text-[#163C3A] mb-2 font-mono">404</h1>
        <h2 className="text-xl font-bold text-slate-800 mb-2">الصفحة المطلوبة غير موجودة</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          عذراً، الرابط الذي تحاول الوصول إليه غير متاح أو ربما تم نقله. يمكنك العودة للصفحة الرئيسية لحجز موعد جديد أو الاستعلام.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#087F78] hover:bg-[#124E4A] text-white rounded-xl text-sm font-bold shadow-md transition"
          >
            <Home className="w-4 h-4" />
            الرئيسية
          </Link>
          <Link
            href="/appointments/track"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#163C3A] rounded-xl text-sm font-bold transition"
          >
            استعلام عن موعد
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
