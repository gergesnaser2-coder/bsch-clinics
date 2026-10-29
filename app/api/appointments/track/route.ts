import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let ref = searchParams.get('ref') || searchParams.get('referenceNumber') || '';
    let phone = searchParams.get('phone') || searchParams.get('phoneNumber') || '';
    const q = searchParams.get('q') || '';

    // If q is provided and either ref or phone is missing, try parsing two tokens
    if (q && (!ref || !phone)) {
      const parts = q.trim().split(/\s+/);
      if (parts.length >= 2) {
        for (const p of parts) {
          if (/^BSCH-[0-9]{4,6}$/i.test(p) || /^[0-9]{4}$/.test(p)) {
            ref = p;
          } else if (/^01[0125][0-9]{8}$/.test(p) || /^\+?201[0125][0-9]{8}$/.test(p)) {
            phone = p;
          }
        }
      } else {
        // Only one token passed in q
        if (/^BSCH-[0-9]{4,6}$/i.test(q) || /^[0-9]{4}$/.test(q)) {
          ref = q;
        } else if (/^01[0125][0-9]{8}$/.test(q) || /^\+?201[0125][0-9]{8}$/.test(q)) {
          phone = q;
        }
      }
    }

    // Two-factor verification requirement
    if (!ref || !phone) {
      return NextResponse.json(
        {
          error:
            'لأسباب أمنية وحماية خصوصية بيانات المرضى، يلزم إدخال كل من الرقم المرجعي (BSCH-XXXX) ورقم الهاتف المسجل معاً للاستعلام عن الحجز.',
        },
        { status: 400 }
      );
    }

    const appointments = await appointmentStore.trackAppointment(ref, phone);

    if (appointments.length === 0) {
      return NextResponse.json(
        {
          success: true,
          count: 0,
          appointments: [],
          message: 'لم يتم العثور على حجز يطابق هذا الرقم المرجعي ورقم الهاتف.',
        },
        { status: 200 }
      );
    }

    // Return minimized safe fields only
    const sanitizedAppointments = appointments.map((a) => ({
      referenceNumber: a.referenceNumber,
      clinicId: a.clinicId,
      clinicName: a.clinicName,
      patientName: a.patientName,
      appointmentDate: a.appointmentDate,
      appointmentTime: a.appointmentTime,
      status: a.status,
      queueNumber: a.queueNumber,
    }));

    return NextResponse.json({
      success: true,
      count: sanitizedAppointments.length,
      appointments: sanitizedAppointments,
    });
  } catch (error) {
    console.error('Error tracking appointment:', error);
    return NextResponse.json({ error: 'تعذر الاستعلام عن الحجز' }, { status: 500 });
  }
}
