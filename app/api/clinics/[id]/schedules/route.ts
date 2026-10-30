import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedules = await appointmentStore.getClinicSchedules(id);
    return NextResponse.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching public clinic schedules:', error);
    return NextResponse.json({ error: 'حدث خطأ في جلب استثناءات المواعيد' }, { status: 500 });
  }
}

