import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    const result = await appointmentStore.cancelAppointment(id, reason);
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
