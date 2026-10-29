import type { AppointmentStatus } from '../types/index.ts';

/**
 * Validates Egyptian mobile phone numbers.
 * Must start with 010, 011, 012, or 015 and have exactly 11 digits.
 * Converts Arabic numerals (٠-٩) to standard digits.
 */
export function normalizeAndValidateEgyptianPhone(input: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (!input || typeof input !== 'string') {
    return { isValid: false, normalized: '', error: 'رقم الهاتف مطلوب' };
  }

  // Convert Arabic-Indic numerals to Latin digits
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let clean = input.trim();
  for (let i = 0; i < arabicNumerals.length; i++) {
    clean = clean.split(arabicNumerals[i]).join(String(i));
  }

  // Remove spaces, hyphens, parentheses
  clean = clean.replace(/[\s\-\(\)\+]/g, '');

  // Handle +20 or 20 country code
  if (clean.startsWith('0020')) {
    clean = clean.slice(4);
  } else if (clean.startsWith('20')) {
    clean = clean.slice(2);
  }

  // If missing leading zero but has 10 digits starting with 10, 11, 12, 15
  if (clean.length === 10 && /^(10|11|12|15)/.test(clean)) {
    clean = '0' + clean;
  }

  const regex = /^01[0125][0-9]{8}$/;
  if (!regex.test(clean)) {
    return {
      isValid: false,
      normalized: clean,
      error: 'يجب إدخال رقم هاتف محمول مصري صحيح مكون من 11 رقمًا (يبدأ بـ 010 أو 011 أو 012 أو 015)',
    };
  }

  return {
    isValid: true,
    normalized: clean,
  };
}

/**
 * Validates patient full name.
 * Requires at least 2 words (preferably 3 or 4 for quadruplicate name), min length 6 chars.
 */
export function validatePatientName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'اسم المريض مطلوب' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 5) {
    return { isValid: false, error: 'يجب أن لا يقل اسم المريض عن 5 أحرف' };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { isValid: false, error: 'يرجى إدخال اسم المريض ثنائي على الأقل (ويُفضل رباعي)' };
  }

  return { isValid: true };
}

/**
 * Validates allowed status transitions.
 */
export function canTransitionStatus(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): boolean {
  if (currentStatus === targetStatus) return true;

  switch (currentStatus) {
    case 'PENDING_REVIEW':
      return targetStatus === 'CONFIRMED' || targetStatus === 'CANCELLED';
    case 'CONFIRMED':
      return targetStatus === 'CHECKED_IN' || targetStatus === 'CANCELLED';
    case 'CHECKED_IN':
      return targetStatus === 'COMPLETED' || targetStatus === 'CANCELLED';
    case 'COMPLETED':
      // Completed appointments cannot be reverted
      return false;
    case 'CANCELLED':
      // Cancelled appointments cannot be reopened
      return false;
    default:
      return false;
  }
}

/**
 * Generates an appointment reference code (e.g. BSCH-4819).
 */
export function generateReferenceNumber(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `BSCH-${digits}`;
}

/**
 * Returns Arabic badge display info for an appointment status.
 */
export function getStatusDisplay(status: AppointmentStatus): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case 'PENDING_REVIEW':
      return {
        label: 'قيد المراجعة',
        color: '#D97706',
        bg: '#FEF3C7',
        border: '#FDE68A',
      };
    case 'CONFIRMED':
      return {
        label: 'مؤكد',
        color: '#087F78',
        bg: '#E6F4F2',
        border: '#B2DFDB',
      };
    case 'CHECKED_IN':
      return {
        label: 'حضر المريض (في الدور)',
        color: '#2563EB',
        bg: '#DBEAFE',
        border: '#BFDBFE',
      };
    case 'COMPLETED':
      return {
        label: 'مكتمل (تم الكشف)',
        color: '#15803D',
        bg: '#DCFCE7',
        border: '#BBF7D0',
      };
    case 'CANCELLED':
      return {
        label: 'ملغي',
        color: '#DC2626',
        bg: '#FEE2E2',
        border: '#FECACA',
      };
    default:
      return {
        label: 'غير معروف',
        color: '#64748B',
        bg: '#F1F5F9',
        border: '#E2E8F0',
      };
  }
}

/**
 * Formats a Date object to YYYY-MM-DD string in local time.
 */
export function formatLocalDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (YYYY-MM-DD) into Arabic human-readable format.
 */
export function formatArabicDate(dateStr: string): string {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const [year, month, day] = parts.map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
    const date = new Date(year, month - 1, day);
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const dayName = arabicDays[date.getDay()];
    const monthName = arabicMonths[month - 1];
    return `${dayName}، ${day} ${monthName} ${year}`;
  } catch {
    return dateStr;
  }
}
