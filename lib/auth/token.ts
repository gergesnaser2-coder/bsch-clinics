// Shared staff session token utilities.
// Web Crypto only — safe for Edge middleware AND Node.js runtimes.
// Token format: bsch_staff_<base64url(payload)>.<base64url(hmac-sha256)>

export const STAFF_SESSION_COOKIE = 'bsch_staff_session';
export const STAFF_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface StaffTokenClaims {
  sub: string;
  username: string;
  name: string;
  role: string;
  clinicId: string | null;
  exp: number;
}

const TOKEN_PREFIX = 'bsch_staff_';
const MIN_SECRET_LENGTH = 32;

export function getStaffSessionSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      'STAFF_SESSION_SECRET غير مضبوط: مطلوب سر توقيع جلسات الموظفين بطول 32 حرفاً على الأقل.'
    );
  }
  return secret.trim();
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function issueStaffToken(claims: StaffTokenClaims, secret: string): Promise<string> {
  const payloadB64 = bytesToB64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await importHmacKey(secret, 'sign');
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  );
  return `${TOKEN_PREFIX}${payloadB64}.${bytesToB64Url(signature)}`;
}

export async function verifyStaffToken(
  token: string | null | undefined,
  secret: string
): Promise<StaffTokenClaims | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const rest = token.slice(TOKEN_PREFIX.length);
  const parts = rest.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  let claims: StaffTokenClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadB64))) as StaffTokenClaims;
  } catch {
    return null;
  }

  if (typeof claims.exp !== 'number' || claims.exp <= Date.now()) return null;

  try {
    const key = await importHmacKey(secret, 'verify');
    const signatureValid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64UrlToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!signatureValid) return null;
  } catch {
    return null;
  }

  return claims;
}
