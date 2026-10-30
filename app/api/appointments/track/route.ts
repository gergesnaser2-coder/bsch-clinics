import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { normalizeAndValidateEgyptianPhone } from '@/lib/rules';
import { generateOtp, verifyOtp } from '@/lib/otp';

/**
 * POST /api/appointments/track
 * Secure endpoint for Phone-Based Tracking:
 *
 * Action 1: Request OTP (body: { action: 'request', phone: string } or body: { phone: string })
 * - Validates Egyptian phone format.
 * - Rate limits generation requests.
 * - Returns a generic uniform message preventing phone-number enumeration.
 * - Never returns plaintext OTP in production.
 *
 * Action 2: Verify OTP & Retrieve Appointments (body: { action: 'verify', phone: string, otp: string })
 * - Uses POST body so phone number and OTP code NEVER appear in URLs, access logs, or referrers.
 * - Enforces server-side expiration, brute-force lockout, and single-use replay protection.
 * - Exposes only sanitized, permitted appointment details for the authenticated phone number.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || (body.otp ? 'verify' : 'request');
    const phone = (body.phone || body.phoneNumber || '').toString().trim();

    // 1. Phone validation
    const phoneCheck = normalizeAndValidateEgyptianPhone(phone);
    if (!phoneCheck.isValid) {
      return NextResponse.json(
        { error: 'رقم الهاتف غير صحيح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01 (010 / 011 / 012 / 015)' },
        { status: 400 }
      );
    }

    const normalizedPhone = phoneCheck.normalized;

    // ACTION: REQUEST OTP
    if (action === 'request') {
      const otpGen = await generateOtp(normalizedPhone);

      if (!otpGen.success) {
        return NextResponse.json(
          { error: otpGen.error || 'تعذر إرسال رمز التحقق في الوقت الحالي' },
          { status: 429 }
        );
      }

      // Generic response: Does not indicate whether the phone number has appointments in DB,
      // which completely eliminates phone enumeration vulnerability.
      return NextResponse.json({
        success: true,
        message: 'تم إرسال رمز التحقق إلى رقم هاتفك المحمول بنجاح.',
        expiresAt: otpGen.expiresAt,
        demoNotice: otpGen.demoNotice, // Undefined in production
      });
    }

    // ACTION: VERIFY OTP & FETCH APPOINTMENTS
    if (action === 'verify') {
      const otp = (body.otp || body.code || '').toString().trim();

      if (!otp) {
        return NextResponse.json(
          { error: 'يرجى إدخال رمز التحقق المكون من 4 أرقام.' },
          { status: 400 }
        );
      }

      // Strict server-side verification
      const verifyRes = await verifyOtp(normalizedPhone, otp);
      if (!verifyRes.valid) {
        return NextResponse.json(
          {
            error: verifyRes.error || 'رمز التحقق غير صحيح أو انتهت صلاحيته.',
            attemptsRemaining: verifyRes.attemptsRemaining,
          },
          { status: 400 }
        );
      }

      // OTP verified successfully; retrieve appointments for this verified phone number
      const appointments = await appointmentStore.trackAppointmentsByVerifiedPhone(normalizedPhone);

      if (appointments.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          appointments: [],
          message: 'لا توجد حجوزات مسجلة برقم هذا الهاتف حالياً.',
        });
      }

      // Sanitize fields: Expose only permitted appointment data (No national ID, internal staff notes, or full address)
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
    }

    return NextResponse.json({ error: 'إجراء غير معروف.' }, { status: 400 });
  } catch (error) {
    // Log error safely without exposing user phone or credentials
    console.error('Error in /api/appointments/track POST handler');
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً.' }, { status: 500 });
  }
}

/**
 * GET /api/appointments/track
 *
 * Security notice: Passing OTP in GET query parameters is strictly rejected to prevent
 * exposing authentication tokens in browser history, proxy caches, and webserver access logs.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const otp = searchParams.get('otp');

  if (otp) {
    return NextResponse.json(
      {
        error: 'لأسباب أمنية لحماية الخصوصية، يرجى إرسال رمز التحقق عبر طلب POST لتجنب ظهوره في سجلات التصفح.',
      },
      { status: 400 }
    );
  }

  // Legacy internal two-factor lookup by exact referenceNumber + phone (preserved for internal systems if needed)
  const ref = searchParams.get('ref') || searchParams.get('referenceNumber') || '';
  const phone = searchParams.get('phone') || searchParams.get('phoneNumber') || '';

  if (ref && phone) {
    const phoneCheck = normalizeAndValidateEgyptianPhone(phone);
    if (!phoneCheck.isValid) {
      return NextResponse.json({ error: 'رقم الهاتف غير صحيح' }, { status: 400 });
    }

    const appointments = await appointmentStore.trackAppointment(ref, phoneCheck.normalized);
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
  }

  return NextResponse.json(
    {
      error: 'يرجى استخدام نموذج المتابعة برقم الهاتف المسجل وتأكيد رمز التحقق (OTP) عبر طلب POST.',
    },
    { status: 400 }
  );
}
