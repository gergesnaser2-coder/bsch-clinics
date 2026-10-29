'use server';

import { appointmentStore } from '@/services/appointmentService';
import { normalizeAndValidateEgyptianPhone, validatePatientName } from '@/lib/rules';
import type { Appointment } from '@/types';

export interface BookingFormData {
  clinicId: string;
  patientName: string;
  phoneNumber: string;
  patientAge?: string;
  patientAddress: string;
  nationalId?: string;
  serviceType: string;
  appointmentDate: string;
  appointmentTime?: string;
  notes?: string;
}

export async function submitBooking(data: BookingFormData): Promise<{
  success: boolean;
  appointment?: Appointment;
  error?: string;
}> {
  try {
    // 1. Strict Business Logic Check: Walk-in Only services are rejected server-side
    if (data.serviceType === 'WALK_IN_PROCEDURE' || data.serviceType === 'EMERGENCY') {
      return {
        success: false,
        error:
          'هذه الخدمة لا تقبل الحجز الإلكتروني المسبق. يلزم الحضور المباشر للمستشفى، ويتم تسجيل الحالة في نفس اليوم عبر موظف الاستقبال بناءً على التقييم الطبي.',
      };
    }

    // 2. Validate patient name
    const nameCheck = validatePatientName(data.patientName);
    if (!nameCheck.isValid) {
      return {
        success: false,
        error: nameCheck.error || 'يرجى إدخال الاسم الرباعي بشكل صحيح',
      };
    }

    // 3. Validate Egyptian phone number
    const phoneCheck = normalizeAndValidateEgyptianPhone(data.phoneNumber);
    if (!phoneCheck.isValid) {
      return {
        success: false,
        error: phoneCheck.error || 'يرجى إدخال رقم هاتف محمول مصري صحيح مكون من 11 رقماً',
      };
    }

    // 4. Validate National ID if provided
    if (data.nationalId && data.nationalId.trim().length > 0) {
      const cleanNID = data.nationalId.trim().replace(/\s+/g, '');
      if (!/^[0-9]{14}$/.test(cleanNID)) {
        return {
          success: false,
          error: 'الرقم القومي غير صحيح، يجب أن يتكون من 14 رقماً',
        };
      }
    }

    // 5. Validate Date
    if (!data.appointmentDate) {
      return {
        success: false,
        error: 'يرجى اختيار تاريخ الموعد المناسب',
      };
    }

    // 6. Create appointment in store / database
    const result = await appointmentStore.createAppointment({
      clinicId: data.clinicId,
      patientName: data.patientName.trim(),
      phoneNumber: phoneCheck.normalized,
      patientAge: data.patientAge?.trim(),
      patientAddress: data.patientAddress?.trim(),
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime || '09:00',
    });

    if (!result.success || !result.appointment) {
      return {
        success: false,
        error: result.error || 'تعذر تسجيل طلب الحجز، يرجى المحاولة لاحقاً',
      };
    }

    return {
      success: true,
      appointment: result.appointment,
    };
  } catch (err: any) {
    console.error('Error in submitBooking server action:', err);
    return {
      success: false,
      error: 'حدث خطأ في معالجة طلب الحجز، يرجى إعادة المحاولة',
    };
  }
}

