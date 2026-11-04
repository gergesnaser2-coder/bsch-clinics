import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE, STAFF_SESSION_TTL_MS } from '@/lib/auth/token';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'اسم المستخدم وكلمة المرور مطلوبان' },
        { status: 400 }
      );
    }

    const session = await AuthService.validateCredentials(username, password);
    if (!session) {
      return NextResponse.json(
        { error: 'بيانات الدخول غير صحيحة، يرجى التأكد من اسم المستخدم وكلمة المرور' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
      supabaseEmail: session.supabaseEmail || null,
    });

    // httpOnly session cookie consumed by middleware.ts to protect /staff/*
    response.cookies.set({
      name: STAFF_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(STAFF_SESSION_TTL_MS / 1000),
    });

    return response;
  } catch (error) {
    console.error('Error during staff login:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' }, { status: 500 });
  }
}
