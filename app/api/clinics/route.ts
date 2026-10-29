import { NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function GET() {
  try {
    const clinics = await appointmentStore.getAllClinics();
    return NextResponse.json({ clinics });
  } catch (error) {
    console.error('Error fetching clinics:', error);
    return NextResponse.json({ error: 'تعذر جلب بيانات العيادات' }, { status: 500 });
  }
}
