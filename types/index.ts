export type AppointmentStatus =
  | 'PENDING_REVIEW'   // قيد المراجعة
  | 'CONFIRMED'        // مؤكد
  | 'CHECKED_IN'       // حضر المريض (في قائمة النداء)
  | 'COMPLETED'        // مكتمل (تم الكشف)
  | 'CANCELLED';       // ملغي

export interface StatusHistoryItem {
  status: AppointmentStatus;
  timestamp: string;
  note?: string;
  updatedBy?: string;
}

export interface Clinic {
  id: string;
  name: string;
  description?: string;
  location: string;
  workingHours: string;
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday (Egypt outpatient usually Sun-Thu or Sat-Thu)
  maxDailySlots: number;
  slotDurationMinutes: number;
  instructions?: string;
  isActive: boolean;
  isHospitalConfirmed?: boolean;
}

export interface AppointmentSlot {
  id: string;
  clinicId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  capacity: number;
  bookedCount: number;
  isAvailable: boolean;
}

export interface Appointment {
  id: string;
  referenceNumber: string; // e.g. BSCH-7492
  clinicId: string;
  clinicName: string;
  patientName: string;
  phoneNumber: string;
  patientAge?: string;
  patientAddress?: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:mm
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  queueNumber?: number;
  lastCalledAt?: string;
  calledCount?: number;
  statusHistory: StatusHistoryItem[];
}

export type StaffRole = 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR';

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  clinicId?: string;
  active: boolean;
}

export interface CreateAppointmentInput {
  clinicId: string;
  patientName: string;
  phoneNumber: string;
  patientAge?: string;
  patientAddress?: string;
  appointmentDate: string;
  appointmentTime?: string;
  isWalkIn?: boolean;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  staffName: string;
  staffRole: string;
  action: string;
  details: string;
  referenceNumber?: string;
}
