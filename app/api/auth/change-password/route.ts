import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { createAdminClient } from '@/lib/supabase/admin';

// Server-side password change fallback: verifies the staff session first,
// then updates the Supabase Auth password with the service-role admin client.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const user = await AuthService.verifySession(token);
    if (!user) {
      return NextResponse.json({ error: 'جلسة غير صالحة، يرجى إعادة تسجيل الدخول' }, { status: 401 });
    }

    const body = await req.json();
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword.trim() : '';
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' },
        { status: 400 }
      );
    }
    if (newPassword.length > 72) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة طويلة جداً (الحد الأقصى 72 حرفاً)' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (error) {
      console.error('Change password updateUserById error:', error.message);
      return NextResponse.json(
        { error: 'تعذر تغيير كلمة المرور، يرجى المحاولة لاحقاً' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. استخدم كلمة المرور الجديدة في عمليات الدخول القادمة.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'تعذر تغيير كلمة المرور في الوقت الحالي، يرجى المحاولة لاحقاً' },
      { status: 500 }
    );
  }
}
