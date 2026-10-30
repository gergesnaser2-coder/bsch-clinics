import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason, phoneNumber } = body;

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = token ? await AuthService.verifySession(token) : null;

    if (!staffUser && !phoneNumber) {
      return NextResponse.json(
        { error: 'غير مصرح بإلغاء الحجز. يلزم تسجيل دخول الموظفين أو إدخال رقم هاتف الحجز.' },
        { status: 401 }
      );
    }

    const result = await appointmentStore.cancelAppointment(id, reason, {
      staffUser: staffUser || undefined,
      phoneNumber: phoneNumber || undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر إلغاء الحجز' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إلغاء الحجز بنجاح',
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

