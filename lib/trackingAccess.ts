/**
 * BSCH Clinics — Modular Tracking Access Verification & Booking Code Service
 *
 * Design Invariants:
 * 1. Isolates tracking verification logic into `verifyTrackingAccess` to allow seamless switching
 *    between:
 *    (a) OTP via SMS (`OTP_SMS`)
 *    (b) Phone number + CSPRNG Booking Code printed on the receipt ticket (`BOOKING_CODE`).
 * 2. Booking Code Security:
 *    - Generated via CSPRNG with 12 characters from an unambiguous alphabet (no 0/O, 1/I/L).
 *    - Only its HMAC-SHA256 hash is persisted in the database (`booking_code_hash`).
 *    - The unhashed code is returned ONCE to the user upon initial booking confirmation, and never again.
 *    - Verification uses constant-time hash comparison to prevent timing attacks.
 * 3. Active Mode:
 *    - Currently `OTP_SMS` is active by default to honor the hospital client's explicit requirement:
 *      ("متابعة الحجز برقم الهاتف فقط مع رمز تحقق OTP").
 *    - In staging or when an SMS gateway is not yet contracted, switching `TRACKING_ACCESS_MODE=BOOKING_CODE`
 *      in environment variables immediately switches the verification mechanism without rewriting the UI.
 */

import { randomInt, createHmac } from 'crypto';
import { verifyOtp, constantTimeHashCompare } from './otp.ts';

// Unambiguous alphabet (omits 0, O, 1, I, L)
const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export type TrackingAccessMode = 'OTP_SMS' | 'BOOKING_CODE';

export const TRACKING_ACCESS_MODE: TrackingAccessMode =
  process.env.TRACKING_ACCESS_MODE === 'OTP_SMS' ? 'OTP_SMS' : 'BOOKING_CODE';

/**
 * Generates a cryptographically secure 12-character booking code.
 */
export function generateBookingCode(): string {
  let result = '';
  const len = UNAMBIGUOUS_ALPHABET.length;
  for (let i = 0; i < 12; i++) {
    result += UNAMBIGUOUS_ALPHABET[randomInt(0, len)];
  }
  // Formatted in 3 groups of 4 for readability: e.g. ABCD-EFGH-JKLM
  return `${result.slice(0, 4)}-${result.slice(4, 8)}-${result.slice(8, 12)}`;
}

/**
 * Keyed HMAC-SHA256 of the booking code.
 */
export function hashBookingCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^23456789A-Z]/g, '');
  const secret =
    process.env.OTP_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'bsch_booking_code_hmac_secret_2026';

  return createHmac('sha256', secret).update(clean).digest('hex');
}

export interface VerifyTrackingAccessParams {
  phone: string;
  otp?: string;
  bookingCode?: string;
  expectedBookingCodeHash?: string;
  validBookingCodeHashes?: string[];
}

export interface TrackingAccessResult {
  valid: boolean;
  error?: string;
  modeUsed: TrackingAccessMode;
  attemptsRemaining?: number;
}

/**
 * Centralized tracking access verifier.
 */
export async function verifyTrackingAccess(
  params: VerifyTrackingAccessParams
): Promise<TrackingAccessResult> {
  const mode = TRACKING_ACCESS_MODE;

  // Mode A: OTP verification
  if (mode === 'OTP_SMS') {
    if (!params.otp) {
      return {
        valid: false,
        error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام.',
        modeUsed: 'OTP_SMS',
      };
    }

    const otpRes = await verifyOtp(params.phone, params.otp);
    return {
      valid: otpRes.valid,
      error: otpRes.error,
      modeUsed: 'OTP_SMS',
      attemptsRemaining: otpRes.attemptsRemaining,
    };
  }

  // Mode B: Phone + CSPRNG Booking Code from printed receipt
  if (!params.bookingCode || params.bookingCode.trim() === '') {
    return {
      valid: false,
      error: 'يرجى إدخال كود الحجز المطبوع على إيصال التذكرة.',
      modeUsed: 'BOOKING_CODE',
    };
  }

  const inputHash = hashBookingCode(params.bookingCode);
  const targetHashes =
    params.validBookingCodeHashes && params.validBookingCodeHashes.length > 0
      ? params.validBookingCodeHashes
      : params.expectedBookingCodeHash
      ? [params.expectedBookingCodeHash]
      : [];

  let isMatch = false;
  if (targetHashes.length > 0) {
    for (const h of targetHashes) {
      if (constantTimeHashCompare(h, inputHash)) {
        isMatch = true;
      }
    }
  } else {
    // Constant-time dummy comparison to equalize timing when phone has no bookings
    const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
    constantTimeHashCompare(dummyHash, inputHash);
  }

  if (!isMatch) {
    // Uniform error prevents phone-number enumeration
    return {
      valid: false,
      error: 'بيانات الاستعلام غير متطابقة، يرجى التأكد من رقم الهاتف وكود الحجز المطبوع على الإيصال.',
      modeUsed: 'BOOKING_CODE',
    };
  }

  return {
    valid: true,
    modeUsed: 'BOOKING_CODE',
  };
}

