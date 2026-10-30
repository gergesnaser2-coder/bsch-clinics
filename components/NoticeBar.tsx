'use client';

import React, { useState, useEffect } from 'react';
import { Bell, X, PhoneCall } from 'lucide-react';
import type { NoticeBarConfig } from '@/types/cms';

const NOTICE_STORAGE_KEY = 'bsch_notice_dismissed_until';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface NoticeBarProps {
  config?: NoticeBarConfig;
}

export function NoticeBar({ config }: NoticeBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const dismissedUntil = localStorage.getItem(NOTICE_STORAGE_KEY);
      if (!dismissedUntil || Date.now() > Number(dismissedUntil)) {
        setIsVisible(true);
      }
    } catch {
      // In case localStorage is blocked or throws in private browsing
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      const expiry = Date.now() + DISMISS_DURATION_MS;
      localStorage.setItem(NOTICE_STORAGE_KEY, expiry.toString());
    } catch {
      // Ignore storage errors
    }
  };

  // If disabled via CMS or dismissed, don't render
  if (config?.is_enabled === false) {
    return null;
  }

  // Prevent hydration mismatch
  if (!isMounted || !isVisible) {
    return null;
  }

  const title = config?.title || 'تنظيم العيادات الخارجية:';
  const message =
    config?.message ||
    'الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.';
  const hotlineLabel =
    config?.hotline_label || 'مستشفى الأطفال التخصصي — دمسنا';

  return (
    <aside
      dir="rtl"
      role="alert"
      aria-label="تنبيه إداري عاجل"
      className="relative z-50 bg-[#0A3D39] bg-gradient-to-r from-[#0A3D39] via-[#0D5F5A] to-[#124E4A] text-white border-b border-[#163C3A] shadow-xs"
      style={{ backgroundColor: '#0A3D39' }}
    >
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
        {/* Announcement Content */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400/20 text-amber-300 shrink-0 ring-1 ring-amber-400/30 animate-pulse">
            <Bell className="w-3.5 h-3.5" />
          </span>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-right text-emerald-50 leading-relaxed">
            <span className="font-bold text-amber-300 shrink-0">{title}</span>
            <span>{message}</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-emerald-100 font-medium bg-white/10 px-2 py-0.5 rounded-md border border-white/15">
              <PhoneCall className="w-3 h-3 text-amber-300" />
              <span>{hotlineLabel}</span>
            </span>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-emerald-200/80 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label="إغلاق التنبيه لمدة 24 ساعة"
          title="إغلاق التنبيه لمدة 24 ساعة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
