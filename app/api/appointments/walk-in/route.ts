import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';
import { formatLocalDate } from '@/lib/rules';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || (staffUser.role !== 'RECEPTIONIST' && staffUser.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: 'غير مصرح لك بإجراء حجز حضوري سريع. يرجى تسجيل الدخول بحساب استقبال أو مدير.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { clinicId, patientName, phoneNumber, patientAge, patientAddress, appointmentDate, appointmentTime } = body;

    if (!clinicId || !patientName || !phoneNumber) {
      return NextResponse.json(
        { error: 'حقول العيادة، اسم المريض، ورقم الهاتف إلزامية للحجز الحضوري' },
        { status: 400 }
      );
    }

    const todayStr = formatLocalDate();
    const targetDate = appointmentDate || todayStr;

    const result = await appointmentStore.createAppointment({
      clinicId,
      patientName,
      phoneNumber,
      patientAge,
      patientAddress,
      appointmentDate: targetDate,
      appointmentTime: appointmentTime || '09:00',
      isWalkIn: true,
    });

    if (!result.success || !result.appointment) {
      return NextResponse.json(
        { error: result.error || 'تعذر تسجيل الحجز الحضوري' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `تم تسجيل الحجز الحضوري بنجاح برقم دور #${result.appointment.queueNumber} ورقم مرجعي ${result.appointment.referenceNumber}`,
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Error in walk-in booking API:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
