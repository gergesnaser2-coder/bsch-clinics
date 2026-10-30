/**
 * Cloudflare Turnstile Server-Side Verification Helper
 *
 * Security Invariants:
 * 1. In production, if TURNSTILE_SECRET_KEY is unconfigured, fail securely (fail-closed).
 * 2. In production, if token is missing or invalid, reject the request.
 * 3. In non-production environments without TURNSTILE_SECRET_KEY configured, allow bypass for testing.
 */

export async function verifyTurnstileToken(
  token?: string | null,
  clientIp?: string
): Promise<{ success: boolean; error?: string }> {
  const isProd = process.env.NODE_ENV === 'production';
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

  if (isProd && !turnstileSecret) {
    console.error('CRITICAL: TURNSTILE_SECRET_KEY is not configured in production. Rejecting request to fail closed.');
    return {
      success: false,
      error: 'التحقق الأمني لمكافحة الروبوتات غير مهيأ في بيئة الإنتاج. يرجى مراجعة إدارة النظام.',
    };
  }

  // If secret is not set in non-production, permit test/dev bypass
  if (!turnstileSecret) {
    return { success: true };
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return {
      success: false,
      error: 'يرجى إكمال التحقق الأمني من مكافحة الروبوتات (Turnstile) للمتابعة.',
    };
  }

  try {
    const params = new URLSearchParams({
      secret: turnstileSecret,
      response: token.trim(),
    });
    if (clientIp) {
      params.append('remoteip', clientIp);
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const outcome = await verifyRes.json();
    if (!outcome.success) {
      console.warn('Turnstile verification failed:', outcome['error-codes']);
      return {
        success: false,
        error: 'فشل التحقق الأمني لمكافحة الروبوتات. يرجى إعادة المحاولة.',
      };
    }

    return { success: true };
  } catch (err) {
    console.error('Turnstile verification network error:', err);
    return {
      success: false,
      error: 'تعذر الاتصال بخدمة التحقق الأمني لمكافحة الروبوتات، يرجى المحاولة لاحقاً.',
    };
  }
}

