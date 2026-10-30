import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const services = await appointmentStore.getClinicServices(id);
    return NextResponse.json({ services });
  } catch (error) {
    console.error('Error fetching clinic services:', error);
    return NextResponse.json(
      { error: 'تعذر جلب خدمات العيادة التخصصية' },
      { status: 500 }
    );
  }
}

