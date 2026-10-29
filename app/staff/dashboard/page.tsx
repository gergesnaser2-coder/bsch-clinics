'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Stethoscope,
  LogOut,
  Search,
  CheckCircle2,
  Clock,
  UserCheck,
  Megaphone,
  Printer,
  Calendar,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  UserPlus,
  Settings,
  History,
  Volume2,
  ExternalLink,
  Sliders,
  Check,
  X,
  Shield,
  Building,
  Globe,
} from 'lucide-react';
import CmsDashboard from '@/components/cms/CmsDashboard';
import { Appointment, Clinic, AppointmentStatus, AuditLogItem } from '@/types';
import { getStatusDisplay, formatArabicDate, formatLocalDate } from '@/lib/rules';

export default function StaffDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: string;
    clinicId?: string;
  } | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'CLINICS' | 'AUDIT' | 'CMS'>('QUEUE');

  // Appointments & Clinics State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [dateFilterType, setDateFilterType] = useState<'TODAY' | 'TOMORROW' | 'CUSTOM' | 'ALL'>('TODAY');
  const [customDate, setCustomDate] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Refresh Trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Banner Callout
  const [activeCallout, setActiveCallout] = useState<string | null>(null);

  // Transfer Modal State
  const [transferApt, setTransferApt] = useState<Appointment | null>(null);
  const [targetClinicId, setTargetClinicId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Walk-In Modal State
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInPatientName, setWalkInPatientName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInClinicId, setWalkInClinicId] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInAddress, setWalkInAddress] = useState('');
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // Admin Clinics Management State
  const [adminClinics, setAdminClinics] = useState<Clinic[]>([]);
  const [loadingAdminClinics, setLoadingAdminClinics] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);

  // Admin Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Helper date calculators
  const getEffectiveDateString = useCallback((): string => {
    const today = new Date();
    if (dateFilterType === 'TODAY') {
      return formatLocalDate(today);
    } else if (dateFilterType === 'TOMORROW') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return formatLocalDate(tomorrow);
    } else if (dateFilterType === 'CUSTOM') {
      return customDate || formatLocalDate(today);
    }
    return 'ALL';
  }, [dateFilterType, customDate]);

  // Load clinics on mount
  useEffect(() => {
    let active = true;
    async function loadClinics() {
      try {
        const res = await fetch('/api/clinics');
        const data = await res.json();
        if (active && data.clinics) {
          setClinics(data.clinics);
          if (data.clinics.length > 0) {
            setTargetClinicId(data.clinics[0].id);
            setWalkInClinicId(data.clinics[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching clinics:', err);
      }
    }
    loadClinics();
    return () => {
      active = false;
    };
  }, []);

  // Fetch appointments on filter change
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    async function loadAppointments() {
      try {
        const effectiveDate = getEffectiveDateString();
        const url = new URL('/api/staff/appointments', window.location.origin);
        if (selectedClinic !== 'ALL') url.searchParams.set('clinicId', selectedClinic);
        if (selectedStatus !== 'ALL') url.searchParams.set('status', selectedStatus);
        if (effectiveDate !== 'ALL') url.searchParams.set('date', effectiveDate);
        if (searchQuery) url.searchParams.set('search', searchQuery);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('bsch_staff_token');
          router.push('/staff/login');
          return;
        }

        const data = await res.json();
        if (active && data.success) {
          setAppointments(data.appointments || []);
          setCurrentUser(data.user);
          // Auto filter doctor to their clinic if not set
          if (data.user?.role === 'DOCTOR' && data.user?.clinicId && selectedClinic === 'ALL') {
            setSelectedClinic(data.user.clinicId);
          }
        }
      } catch (err) {
        console.error('Error fetching staff data:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAppointments();
    return () => {
      active = false;
    };
  }, [router, selectedClinic, selectedStatus, searchQuery, getEffectiveDateString, refreshKey]);

  // Fetch Admin Clinics
  const fetchAdminClinics = useCallback(async () => {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingAdminClinics(true);
    try {
      const res = await fetch('/api/staff/clinics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.clinics) {
        setAdminClinics(data.clinics);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAdminClinics(false);
    }
  }, []);

  // Fetch Admin Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingAuditLogs(true);
    try {
      const res = await fetch('/api/staff/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.logs) {
        setAuditLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAuditLogs(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    if (activeTab === 'CLINICS') {
      fetch('/api/staff/clinics', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.clinics) {
            setAdminClinics(data.clinics);
          }
        })
        .catch((e) => console.error(e));
    } else if (activeTab === 'AUDIT') {
      fetch('/api/staff/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.logs) {
            setAuditLogs(data.logs);
          }
        })
        .catch((e) => console.error(e));
    }

    return () => {
      active = false;
    };
  }, [activeTab]);

  // Status Change Handler
  async function handleStatusChange(appointmentId: string, newStatus: AppointmentStatus, note?: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, note }),
      });

      const data = await res.json();
      if (data.success) {
        if (newStatus === 'CHECKED_IN') {
          setActiveCallout(`تم نداء المريض: ${data.appointment.patientName} (${data.appointment.clinicName}) - دور #${data.appointment.queueNumber || 1}`);
          setTimeout(() => setActiveCallout(null), 8000);
        }
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر تغيير الحالة');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('حدث خطأ أثناء تعديل حالة الحجز');
    }
  }

  // Recall Patient Handler
  async function handleRecall(appointmentId: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/recall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.success) {
        setActiveCallout(`📢 إعادة نداء: دور #${data.appointment.queueNumber} - المريض ${data.appointment.patientName} (${data.appointment.clinicName})`);
        setTimeout(() => setActiveCallout(null), 8000);
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر إعادة نداء المريض');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ في إعادة النداء');
    }
  }

  // Transfer Clinic Handler
  async function handleConfirmTransfer() {
    if (!transferApt || !targetClinicId) return;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    setIsTransferring(true);
    try {
      const res = await fetch(`/api/appointments/${transferApt.id}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetClinicId,
          reason: transferReason || 'تحويل استشاري بين العيادات',
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم تحويل المريض بنجاح');
        setTransferApt(null);
        setTransferReason('');
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر تحويل المريض');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء التحويل');
    } finally {
      setIsTransferring(false);
    }
  }

  // Walk-In Booking Handler
  async function handleWalkInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWalkInError(null);
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    setWalkInSubmitting(true);
    try {
      const res = await fetch('/api/appointments/walk-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinicId: walkInClinicId,
          patientName: walkInPatientName,
          phoneNumber: walkInPhone,
          patientAge: walkInAge,
          patientAddress: walkInAddress,
          appointmentDate: formatLocalDate(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم تسجيل الحجز بنجاح');
        setShowWalkInModal(false);
        setWalkInPatientName('');
        setWalkInPhone('');
        setWalkInAge('');
        setWalkInAddress('');
        setRefreshKey((k) => k + 1);
      } else {
        setWalkInError(data.error || 'تعذر تسجيل الحجز الحضوري');
      }
    } catch (err) {
      console.error(err);
      setWalkInError('حدث خطأ أثناء إرسال البيانات');
    } finally {
      setWalkInSubmitting(false);
    }
  }

  // Admin Clinic Update Handler
  async function handleSaveClinic(clinic: Clinic) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/staff/clinics/${clinic.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(clinic),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم تحديث العيادة بنجاح');
        setEditingClinic(null);
        fetchAdminClinics();
      } else {
        alert(data.error || 'تعذر تحديث العيادة');
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء الحفظ');
    }
  }

  function handleLogout() {
    const token = localStorage.getItem('bsch_staff_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error);
    }
    localStorage.removeItem('bsch_staff_token');
    localStorage.removeItem('bsch_staff_user');
    router.push('/staff/login');
  }

  // Metrics
  const totalCount = appointments.length;
  const pendingCount = appointments.filter((a) => a.status === 'PENDING_REVIEW').length;
  const confirmedCount = appointments.filter((a) => a.status === 'CONFIRMED').length;
  const checkedInCount = appointments.filter((a) => a.status === 'CHECKED_IN').length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  const isAdmin = currentUser?.role === 'ADMIN';
  const isDoctor = currentUser?.role === 'DOCTOR';
  const isReceptionist = currentUser?.role === 'RECEPTIONIST';

  return (
    <div className="min-h-screen bg-[#F6F9FB] flex flex-col text-right">
      
      {/* Top Staff Header */}
      <header className="bg-white border-b border-[#E2E8EE] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-[1250px] mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#087F78] text-white flex items-center justify-center shadow-xs">
              <Stethoscope className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <span className="text-base font-bold text-[#124E4A] block">
                لوحة تحكم العيادات الخارجية
              </span>
              <span className="text-2xs text-[#8493A6]">
                مستشفى الأطفال التخصصي بالبحيرة
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Walk-in Booking Button */}
            {(isReceptionist || isAdmin) && (
              <button
                onClick={() => setShowWalkInModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-colors"
                title="تسجيل مريض حضر للمستشفى مباشرة"
              >
                <UserPlus className="w-4 h-4" />
                <span>حجز حضوري سريع</span>
              </button>
            )}

            {currentUser && (
              <div className="hidden md:flex flex-col text-left text-xs bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                <span className="font-bold text-[#163C3A]">{currentUser.name}</span>
                <span className="text-[#087F78] text-3xs font-semibold">
                  {currentUser.role === 'ADMIN'
                    ? '🛡️ مدير النظام'
                    : currentUser.role === 'DOCTOR'
                    ? '🩺 طبيب العيادة'
                    : '📋 الاستقبال والحجز'}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1250px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Callout Broadcast Alert */}
        {activeCallout && (
          <div className="p-4 rounded-2xl bg-blue-600 text-white flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-blue-200 block">
                  تنبيه نداء المريض بالعيادة
                </span>
                <span className="text-sm sm:text-base font-extrabold">{activeCallout}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveCallout(null)}
              className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Role Tabs */}
        <div className="flex items-center justify-between border-b border-[#E2E8EE] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('QUEUE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'QUEUE'
                  ? 'bg-[#087F78] text-white shadow-xs'
                  : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>طابور العيادة والحجوزات</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('CLINICS')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    activeTab === 'CLINICS'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>إدارة العيادات والسعة</span>
                </button>

                <button
                  onClick={() => setActiveTab('AUDIT')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    activeTab === 'AUDIT'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>سجل العمليات (Audit Logs)</span>
                </button>

                <button
                  onClick={() => setActiveTab('CMS')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    activeTab === 'CMS'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>إدارة الموقع (CMS)</span>
                </button>
              </>
            )}
          </div>

          <div className="text-xs text-[#8493A6] hidden sm:block">
            {isDoctor ? '🩺 وضع شاشة الطبيب المباشر' : isAdmin ? '🛡️ وضع مدير المستشفى الكامل' : '📋 وضع موظف الاستقبال والتنظيم'}
          </div>
        </div>

        {/* TAB 1: QUEUE & APPOINTMENTS */}
        {activeTab === 'QUEUE' && (
          <>
            {/* Metric Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="bg-white rounded-2xl border border-[#E2E8EE] p-4 text-right shadow-2xs">
                <span className="text-2xs font-semibold text-[#8493A6] block">إجمالي الحجوزات</span>
                <span className="text-2xl font-black text-[#124E4A] font-mono mt-1 block">{totalCount}</span>
              </div>

              <div className="bg-white rounded-2xl border border-[#FDE68A] bg-amber-50/40 p-4 text-right shadow-2xs">
                <span className="text-2xs font-semibold text-[#D97706] block">بانتظار التأكيد</span>
                <span className="text-2xl font-black text-[#D97706] font-mono mt-1 block">{pendingCount}</span>
              </div>

              <div className="bg-white rounded-2xl border border-[#B2DFDB] bg-[#E6F4F2]/40 p-4 text-right shadow-2xs">
                <span className="text-2xs font-semibold text-[#087F78] block">المؤكدة (في الانتظار)</span>
                <span className="text-2xl font-black text-[#087F78] font-mono mt-1 block">{confirmedCount}</span>
              </div>

              <div className="bg-white rounded-2xl border border-blue-200 bg-blue-50/40 p-4 text-right shadow-2xs">
                <span className="text-2xs font-semibold text-blue-600 block">في الدور / تم النداء</span>
                <span className="text-2xl font-black text-blue-700 font-mono mt-1 block">{checkedInCount}</span>
              </div>

              <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 text-right shadow-2xs col-span-2 sm:col-span-1">
                <span className="text-2xs font-semibold text-emerald-700 block">تم الكشف (مكتمل)</span>
                <span className="text-2xl font-black text-emerald-700 font-mono mt-1 block">{completedCount}</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl border border-[#E2E8EE] p-4 shadow-2xs space-y-3">
              
              {/* Date Filter Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#087F78]" />
                  <span className="text-xs font-bold text-[#124E4A]">فلترة التاريخ:</span>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDateFilterType('TODAY')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'TODAY'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      اليوم
                    </button>
                    <button
                      onClick={() => setDateFilterType('TOMORROW')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'TOMORROW'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      غداً
                    </button>
                    <button
                      onClick={() => setDateFilterType('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'ALL'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      كل التواريخ
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-2xs text-[#8493A6]">أو حدد تاريخاً:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      setDateFilterType('CUSTOM');
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[#E2E8EE] text-[#163C3A] font-mono"
                  />
                </div>
              </div>

              {/* Search, Clinic, and Status Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                  
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-[#8493A6] absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث باسم المريض، رقم الهاتف، أو الكود..."
                      className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E2E8EE] text-xs text-[#163C3A] text-right focus:border-[#087F78] bg-[#F6F9FB]"
                    />
                  </div>

                  {/* Clinic Filter */}
                  <select
                    value={selectedClinic}
                    onChange={(e) => setSelectedClinic(e.target.value)}
                    disabled={isDoctor && !!currentUser?.clinicId}
                    className="px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] bg-white focus:border-[#087F78]"
                  >
                    {!isDoctor && <option value="ALL">جميع العيادات</option>}
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] bg-white focus:border-[#087F78]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="PENDING_REVIEW">قيد المراجعة</option>
                    <option value="CONFIRMED">مؤكد (في الانتظار)</option>
                    <option value="CHECKED_IN">حضر المريض (في الدور)</option>
                    <option value="COMPLETED">مكتمل (تم الكشف)</option>
                    <option value="CANCELLED">ملغي</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="p-2 rounded-xl border border-[#E2E8EE] hover:bg-slate-50 text-[#8493A6] hover:text-[#087F78] transition-colors"
                    title="تحديث البيانات"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] hover:bg-slate-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#087F78]" />
                    <span>طباعة الكشف</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Appointments Table / Roster */}
            <div className="bg-white rounded-2xl border border-[#E2E8EE] shadow-2xs overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-xs text-[#8493A6]">جاري تحميل جدول الحجوزات...</div>
              ) : appointments.length === 0 ? (
                <div className="p-12 text-center text-xs text-[#8493A6] space-y-2">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>لا توجد حجوزات مطابقة للفلاتر المحددة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#F6F9FB] border-b border-[#E2E8EE] text-[#8493A6] font-semibold">
                      <tr>
                        <th className="py-3 px-4">الدور / الكود</th>
                        <th className="py-3 px-4">اسم المريض</th>
                        <th className="py-3 px-4">رقم الهاتف</th>
                        <th className="py-3 px-4">العيادة</th>
                        <th className="py-3 px-4">التاريخ والموعد</th>
                        <th className="py-3 px-4">الحالة</th>
                        <th className="py-3 px-4 text-center">الإجراءات المتاحة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8EE]">
                      {appointments.map((apt) => {
                        const status = getStatusDisplay(apt.status);
                        return (
                          <tr key={apt.id} className="hover:bg-slate-50/70 transition-colors">
                            
                            {/* Queue & Code */}
                            <td className="py-3 px-4 font-mono">
                              <span className="font-bold text-[#124E4A] block">{apt.referenceNumber}</span>
                              {apt.queueNumber && (
                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-[#E6F4F2] text-[#087F78] text-2xs font-bold">
                                  دور #{apt.queueNumber}
                                </span>
                              )}
                            </td>

                            {/* Patient Name */}
                            <td className="py-3 px-4">
                              <span className="font-bold text-[#163C3A] text-sm block">{apt.patientName}</span>
                              {apt.patientAge && (
                                <span className="text-2xs text-[#8493A6] block">{apt.patientAge} {apt.patientAddress ? `— ${apt.patientAddress}` : ''}</span>
                              )}
                            </td>

                            {/* Phone */}
                            <td className="py-3 px-4 font-mono text-[#163C3A]" dir="ltr">
                              {apt.phoneNumber}
                            </td>

                            {/* Clinic */}
                            <td className="py-3 px-4 font-semibold text-[#087F78]">
                              {apt.clinicName}
                            </td>

                            {/* Date & Time */}
                            <td className="py-3 px-4">
                              <span className="block text-[#163C3A]">{formatArabicDate(apt.appointmentDate)}</span>
                              <span className="font-mono text-2xs text-[#8493A6]">الساعة {apt.appointmentTime}</span>
                            </td>

                            {/* Status Badge */}
                            <td className="py-3 px-4">
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold border"
                                style={{
                                  backgroundColor: status.bg,
                                  color: status.color,
                                  borderColor: status.border,
                                }}
                              >
                                <span>{status.label}</span>
                              </span>
                            </td>

                            {/* Workflow Actions */}
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                
                                {/* Action: Confirm Booking */}
                                {apt.status === 'PENDING_REVIEW' && (
                                  <>
                                    <button
                                      onClick={() => handleStatusChange(apt.id, 'CONFIRMED', 'تمت مراجعة الطلب وتأكيده')}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#087F78] hover:bg-[#124E4A] text-white text-2xs font-bold shadow-2xs"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>تأكيد الحجز</span>
                                    </button>
                                    <button
                                      onClick={() => handleStatusChange(apt.id, 'CANCELLED', 'إلغاء الحجز لعدم استيفاء الشروط')}
                                      className="px-2 py-1 rounded-lg text-2xs text-red-600 hover:bg-red-50"
                                    >
                                      إلغاء
                                    </button>
                                  </>
                                )}

                                {/* Action: Call Patient */}
                                {apt.status === 'CONFIRMED' && (
                                  <button
                                    onClick={() => handleStatusChange(apt.id, 'CHECKED_IN', 'حضر المريض وتم تسجيل الدور ونداؤه')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-2xs font-bold shadow-2xs"
                                  >
                                    <UserCheck className="w-3 h-3" />
                                    <span>حضور ونداء المريض</span>
                                  </button>
                                )}

                                {/* Action: Recall Patient (Re-triggers call on TV and audio chime) */}
                                {apt.status === 'CHECKED_IN' && (
                                  <>
                                    <button
                                      onClick={() => handleRecall(apt.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-2xs font-bold shadow-2xs"
                                      title="إعادة بث نداء صوتي وبصري على شاشة الانتظار"
                                    >
                                      <Volume2 className="w-3 h-3 animate-pulse" />
                                      <span>إعادة النداء 🔊</span>
                                    </button>

                                    <button
                                      onClick={() => handleStatusChange(apt.id, 'COMPLETED', 'تم الكشف وصرف العلاج بنجاح')}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#15803D] hover:bg-emerald-800 text-white text-2xs font-bold shadow-2xs"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>إتمام الكشف</span>
                                    </button>
                                  </>
                                )}

                                {/* Action: Transfer Clinic Modal */}
                                {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                                  <button
                                    onClick={() => {
                                      setTransferApt(apt);
                                      const nextClinic = clinics.find((c) => c.id !== apt.clinicId);
                                      if (nextClinic) setTargetClinicId(nextClinic.id);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-2xs font-bold"
                                    title="تحويل المريض لعيادة أخرى"
                                  >
                                    <ArrowRightLeft className="w-3 h-3" />
                                    <span>تحويل لعيادة</span>
                                  </button>
                                )}

                                {apt.status === 'COMPLETED' && (
                                  <span className="text-2xs text-emerald-600 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>تم الكشف</span>
                                  </span>
                                )}

                                {apt.status === 'CANCELLED' && (
                                  <span className="text-2xs text-red-500 font-medium">
                                    ملغي
                                  </span>
                                )}

                              </div>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: ADMIN CLINICS MANAGEMENT */}
        {activeTab === 'CLINICS' && isAdmin && (
          <div className="bg-white rounded-2xl border border-[#E2E8EE] p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-[#124E4A]">إدارة العيادات والسعة اليومية</h3>
                <p className="text-xs text-[#8493A6]">
                  تعديل حالة العيادة (مفعلة / متوقفة مؤقتاً)، السعة القصوى، والموقع الداخلي
                </p>
              </div>
              <button
                onClick={fetchAdminClinics}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loadingAdminClinics ? (
              <div className="p-8 text-center text-xs text-[#8493A6]">جاري تحميل العيادات...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {adminClinics.map((clinic) => (
                  <div
                    key={clinic.id}
                    className="p-4 rounded-xl border border-[#E2E8EE] bg-slate-50/50 hover:bg-white transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base text-[#124E4A]">{clinic.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                            clinic.isHospitalConfirmed
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {clinic.isHospitalConfirmed ? 'معتمدة رسمياً' : 'بيانات استرشادية'}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-2xs font-bold ${
                            clinic.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {clinic.isActive ? 'مفعلة ونشطة' : 'متوقفة مؤقتاً'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[#8493A6]">{clinic.description}</p>

                    <div className="grid grid-cols-2 gap-2 text-2xs text-[#163C3A] pt-2 border-t border-slate-200">
                      <div>الموقع: <span className="font-semibold">{clinic.location}</span></div>
                      <div>المواعيد: <span className="font-mono">{clinic.workingHours}</span></div>
                      <div>السعة اليومية: <span className="font-bold text-[#087F78]">{clinic.maxDailySlots} مريض</span></div>
                      <div>مدة الكشف: <span className="font-mono">{clinic.slotDurationMinutes} دقيقة</span></div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const updated = { ...clinic, isActive: !clinic.isActive };
                          handleSaveClinic(updated);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-2xs font-bold transition-colors ${
                          clinic.isActive
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        {clinic.isActive ? 'تعطيل مؤقت' : 'تفعيل العيادة'}
                      </button>

                      <button
                        onClick={() => setEditingClinic({ ...clinic })}
                        className="px-3 py-1.5 rounded-lg bg-[#087F78] text-white hover:bg-[#124E4A] text-2xs font-bold"
                      >
                        تعديل السعة والإعدادات
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADMIN AUDIT LOGS */}
        {activeTab === 'AUDIT' && isAdmin && (
          <div className="bg-white rounded-2xl border border-[#E2E8EE] p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-[#124E4A]">سجل العمليات والتدقيق (Audit Logs)</h3>
                <p className="text-xs text-[#8493A6]">
                  توثيق كافة التغييرات والتحويلات وتأكيد وتعديل الحالات لضمان الشفافية
                </p>
              </div>
              <button
                onClick={fetchAuditLogs}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loadingAuditLogs ? (
              <div className="p-8 text-center text-xs text-[#8493A6]">جاري تحميل السجلات...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">لا توجد عمليات مسجلة</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#F6F9FB] border-b border-[#E2E8EE] text-[#8493A6]">
                    <tr>
                      <th className="py-2.5 px-3">التوقيت</th>
                      <th className="py-2.5 px-3">الموظف / الدور</th>
                      <th className="py-2.5 px-3">العملية</th>
                      <th className="py-2.5 px-3">التفاصيل</th>
                      <th className="py-2.5 px-3">الكود المرجعي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8EE]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-2xs text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-[#163C3A] block">{log.staffName}</span>
                          <span className="text-3xs text-[#8493A6]">{log.staffRole}</span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#087F78]">{log.action}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs">{log.details}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                          {log.referenceNumber || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: WEBSITE CONTENT MANAGEMENT (CMS) */}
        {activeTab === 'CMS' && isAdmin && (
          <CmsDashboard currentUser={currentUser} />
        )}

      </main>

      {/* MODAL 1: TRANSFER CLINIC */}
      {transferApt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#124E4A] flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#087F78]" />
                <span>تحويل حجز مريض لعيادة أخرى</span>
              </h3>
              <button
                onClick={() => setTransferApt(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
              <div>المريض: <span className="font-bold text-[#163C3A]">{transferApt.patientName}</span></div>
              <div>العيادة الحالية: <span className="font-bold text-red-700">{transferApt.clinicName}</span></div>
              <div>رقم الدور الحالي: <span className="font-mono font-bold">#{transferApt.queueNumber}</span></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                اختر العيادة المحول إليها <span className="text-red-500">*</span>
              </label>
              <select
                value={targetClinicId}
                onChange={(e) => setTargetClinicId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-xs font-bold text-[#124E4A] bg-white focus:border-[#087F78]"
              >
                {clinics
                  .filter((c) => c.id !== transferApt.clinicId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.location})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                سبب التحويل / الملاحظات الطبية
              </label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="مثال: توصية استشاري الأطفال بإجراء فحص إيكو للقلب أولاً..."
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs text-[#163C3A] focus:border-[#087F78] placeholder:text-[#8493A6]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setTransferApt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                disabled={isTransferring}
                onClick={handleConfirmTransfer}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#124E4A] text-white shadow-xs"
              >
                {isTransferring ? 'جاري التحويل...' : 'تأكيد التحويل الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: WALK-IN BOOKING */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#124E4A] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-500" />
                <span>حجز حضوري مباشر (مكتب الاستقبال)</span>
              </h3>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {walkInError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{walkInError}</span>
              </div>
            )}

            <form onSubmit={handleWalkInSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  اسم الطفل (رباعي) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={walkInPatientName}
                  onChange={(e) => setWalkInPatientName(e.target.value)}
                  placeholder="الاسم رباعي"
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs text-[#163C3A] focus:border-[#087F78]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">
                    رقم الهاتف <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs text-right font-mono focus:border-[#087F78]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">
                    العيادة المطلوبة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={walkInClinicId}
                    onChange={(e) => setWalkInClinicId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#124E4A] bg-white focus:border-[#087F78]"
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">السن</label>
                  <input
                    type="text"
                    value={walkInAge}
                    onChange={(e) => setWalkInAge(e.target.value)}
                    placeholder="مثال: 4 سنوات"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">العنوان</label>
                  <input
                    type="text"
                    value={walkInAddress}
                    onChange={(e) => setWalkInAddress(e.target.value)}
                    placeholder="مثال: دمنهور"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs focus:border-[#087F78]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs"
                >
                  {walkInSubmitting ? 'جاري التسجيل...' : 'تسجيل وطباعة الدور فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT CLINIC (ADMIN) */}
      {editingClinic && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#124E4A] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#087F78]" />
                <span>تعديل إعدادات {editingClinic.name}</span>
              </h3>
              <button
                onClick={() => setEditingClinic(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">الموقع الداخلي</label>
                <input
                  type="text"
                  value={editingClinic.location}
                  onChange={(e) => setEditingClinic({ ...editingClinic, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs focus:border-[#087F78]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">السعة اليومية القصوى</label>
                  <input
                    type="number"
                    value={editingClinic.maxDailySlots}
                    onChange={(e) => setEditingClinic({ ...editingClinic, maxDailySlots: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-mono focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">مواعيد العمل</label>
                  <input
                    type="text"
                    value={editingClinic.workingHours}
                    onChange={(e) => setEditingClinic({ ...editingClinic, workingHours: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-mono focus:border-[#087F78]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  تعليمات العيادة والأوراق المطلوبة
                </label>
                <textarea
                  rows={3}
                  value={editingClinic.instructions || ''}
                  onChange={(e) => setEditingClinic({ ...editingClinic, instructions: e.target.value })}
                  placeholder="اكتب التعليمات والتحاليل أو الفحوصات المطلوبة من ولي الأمر عند الحضور..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs focus:border-[#087F78] placeholder:text-slate-400 resize-y"
                />
                <p className="text-3xs text-[#8493A6] mt-0.5">
                  تظهر هذه الإرشادات للمرضى ديناميكياً في صفحة الحجز فور اختيار العيادة.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={editingClinic.isHospitalConfirmed ?? false}
                    onChange={(e) => setEditingClinic({ ...editingClinic, isHospitalConfirmed: e.target.checked })}
                    className="rounded border-slate-300 text-[#087F78] focus:ring-[#087F78]"
                  />
                  <span className="text-xs font-bold text-[#163C3A]">اعتماد بيانات العيادة رسمياً من إدارة المستشفى</span>
                </label>
                <p className="text-3xs text-[#8493A6] mr-5">تأكيد صحة اسم العيادة وموقعها ومواعيدها وسعتها رسمياً</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingClinic(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveClinic(editingClinic)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#124E4A] text-white shadow-xs"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
