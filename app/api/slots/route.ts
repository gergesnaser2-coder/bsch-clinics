import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const clinicId = searchParams.get('clinicId');
    const date = searchParams.get('date');

    if (!clinicId || !date) {
      return NextResponse.json(
        { error: 'معرف العيادة والتاريخ مطلوبان' },
        { status: 400 }
      );
    }

    const slots = appointmentStore.getAvailableSlots(clinicId, date);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    return NextResponse.json({ error: 'تعذر جلب المواعيد المتاحة' }, { status: 500 });
  }
}
