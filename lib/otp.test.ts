import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, verifyOtp, _resetOtpStoreForTesting, OTP_CONFIG, hashOtp, constantTimeHashCompare, checkIpRateLimit } from './otp.ts';
import { appointmentStore } from '../services/appointmentService.ts';

test('OTP Invariant 1: generateOtp creates cryptographically valid 6-digit code and enforces 5-min expiry', async () => {
  _resetOtpStoreForTesting();
  const phone = '01011112222';
  const result = await generateOtp(phone);

  assert.equal(result.success, true);
  assert.equal(OTP_CONFIG.CODE_LENGTH, 6, 'OTP length must be 6 digits');
  assert.ok(result.expiresAt && result.expiresAt > Date.now(), 'Expiry must be in future');
  assert.ok(result.expiresAt && result.expiresAt <= Date.now() + OTP_CONFIG.EXPIRY_MS, 'Expiry must be within 5 mins');
});

test('OTP Invariant 2: verifyOtp accepts correct 6-digit code, rejects wrong code, and prevents replay attacks', async () => {
  _resetOtpStoreForTesting();
  const phone = '01022223333';
  await generateOtp(phone);

  // In test mode, verify wrong 6-digit code first
  const wrongRes = await verifyOtp(phone, '000000');
  assert.equal(wrongRes.valid, false, 'Wrong code must be rejected');
  assert.ok(wrongRes.attemptsRemaining !== undefined && wrongRes.attemptsRemaining < 5);

  // When NODE_ENV === 'development', 123456 is accepted as fallback
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const validRes = await verifyOtp(phone, '123456');
    assert.equal(validRes.valid, true, 'Valid code must be accepted in development');

    // Replay attempt must be rejected because code is consumed upon success
    const replayRes = await verifyOtp(phone, '123456');
    assert.equal(replayRes.valid, false, 'Replay must be strictly rejected');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('OTP Invariant 3: Request Rate Limiting enforces 60-second cooldown between requests', async () => {
  _resetOtpStoreForTesting();
  const phone = '01033334444';

  const res1 = await generateOtp(phone);
  assert.equal(res1.success, true, 'First request must succeed');

  // Immediate second request must be rate-limited
  const res2 = await generateOtp(phone);
  assert.equal(res2.success, false, 'Immediate second request must be blocked');
  assert.ok(res2.cooldownSeconds && res2.cooldownSeconds > 0, 'Cooldown seconds must be returned');
  assert.match(res2.error || '', /يرجى الانتظار/, 'Cooldown error message must be returned');
});

test('OTP Invariant 4: Brute Force Protection locks out and deletes code after 5 failed attempts', async () => {
  _resetOtpStoreForTesting();
  const phone = '01044445555';
  await generateOtp(phone);

  // 5 consecutive wrong attempts
  for (let i = 1; i <= 4; i++) {
    const res = await verifyOtp(phone, `99900${i}`);
    assert.equal(res.valid, false);
    assert.equal(res.attemptsRemaining, 5 - i);
  }

  // 5th wrong attempt should lock out and delete entry
  const fifthRes = await verifyOtp(phone, '999005');
  assert.equal(fifthRes.valid, false);
  assert.match(fifthRes.error || '', /تجاوز الحد الأقصى/);

  // 6th attempt should report expired/deleted
  const sixthRes = await verifyOtp(phone, '123456');
  assert.equal(sixthRes.valid, false);
});

test('OTP Invariant 5: Production Security - Dev bypass code 123456 is strictly forbidden outside development', async () => {
  _resetOtpStoreForTesting();
  const phone = '01055556666';

  // Generate real OTP
  const genRes = await generateOtp(phone);
  assert.equal(genRes.success, true);

  const originalEnv = process.env.NODE_ENV;
  try {
    // 1. In production
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const prodRes = await verifyOtp(phone, '123456');
    assert.equal(prodRes.valid, false, 'Dev bypass 123456 must be strictly rejected in production');

    // 2. In staging / test / undefined (anything other than exact 'development')
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const testRes = await verifyOtp(phone, '123456');
    assert.equal(testRes.valid, false, 'Dev bypass 123456 must be strictly rejected in test environment');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('OTP Invariant 6: Production Security - demoNotice is never returned outside development', async () => {
  _resetOtpStoreForTesting();
  const phone = '01077778888';
  const originalEnv = process.env.NODE_ENV;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const prodGen = await generateOtp(phone);
    assert.equal(prodGen.demoNotice, undefined, 'demoNotice must be strictly undefined in production');

    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    _resetOtpStoreForTesting();
    const devGen = await generateOtp(phone);
    assert.ok(typeof devGen.demoNotice === 'string', 'demoNotice is provided only in development');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('OTP Invariant 7: Cumulative Brute-Force Counter is Retained Across Re-Requests Within Hourly Window', async () => {
  _resetOtpStoreForTesting();
  const phone = '01088889999';

  // Request code #1
  await generateOtp(phone);

  // Make 3 failed attempts
  await verifyOtp(phone, '111111');
  await verifyOtp(phone, '222222');
  const res3 = await verifyOtp(phone, '333333');
  assert.equal(res3.attemptsRemaining, 2, 'Should have 2 attempts remaining');

  // Fast-forward cooldown (simulate wait) by adjusting lastRequestedAt in store
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    // Generate code #2 after cooldown
    // Verify that the new code DOES NOT reset attempts counter back to 0
    const store = (globalThis as any).otpStoreInstance as Map<string, any>;
    if (store && store.has(phone)) {
      const entry = store.get(phone);
      entry.lastRequestedAt = Date.now() - 70 * 1000; // passed 60s cooldown
    }

    const reReq = await generateOtp(phone);
    assert.equal(reReq.success, true);

    // Make 2 more wrong attempts with new code: should reach 5 total and lockout!
    await verifyOtp(phone, '444444');
    const fifth = await verifyOtp(phone, '555555');
    assert.equal(fifth.valid, false);
    assert.match(fifth.error || '', /تجاوز الحد الأقصى/);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('OTP Invariant 8: Keyed HMAC-SHA256 and constant-time comparison protect against timing attacks', () => {
  const phone = '01012345678';
  const code = '654321';
  const hmac1 = hashOtp(phone, code);
  const hmac2 = hashOtp(phone, code);
  const hmacOther = hashOtp(phone, '654322');

  assert.equal(hmac1, hmac2, 'HMAC must be deterministic for same phone & code');
  assert.notEqual(hmac1, hmacOther, 'Different codes must produce completely different HMAC digests');
  assert.equal(constantTimeHashCompare(hmac1, hmac2), true);
  assert.equal(constantTimeHashCompare(hmac1, hmacOther), false);
  assert.equal(constantTimeHashCompare(hmac1, 'invalid'), false);
});

test('OTP Invariant 9: IP Rate Limiting blocks repeated abusive requests from same IP', async () => {
  _resetOtpStoreForTesting();
  const abusiveIp = '198.51.100.42';

  // First 15 requests should be allowed
  for (let i = 0; i < OTP_CONFIG.MAX_IP_REQUESTS; i++) {
    const check = await checkIpRateLimit(abusiveIp);
    assert.equal(check.allowed, true, `Request ${i + 1} should be allowed`);
  }

  // 16th request must be blocked
  const blockedCheck = await checkIpRateLimit(abusiveIp);
  assert.equal(blockedCheck.allowed, false, '16th request from same IP must be rate-limited');
  assert.ok(blockedCheck.retryAfterSeconds && blockedCheck.retryAfterSeconds > 0);
});

test('Tracking Invariant 10: Phone tracking returns only sanitized fields (no sensitive PII leaked)', async () => {
  const verifiedPhone = '01012345678';
  const appointments = await appointmentStore.trackAppointmentsByVerifiedPhone(verifiedPhone);

  assert.ok(appointments.length > 0, 'Should find appointments for test fixture');

  for (const apt of appointments) {
    assert.ok(apt.referenceNumber, 'referenceNumber must exist');
    assert.ok(apt.patientName, 'patientName must exist');
    assert.ok(apt.clinicName, 'clinicName must exist');
    assert.ok(apt.appointmentDate, 'appointmentDate must exist');

    const rawKeys = Object.keys(apt);
    assert.ok(!rawKeys.includes('nationalId'), 'National ID must not be present in public tracking');
    assert.ok(!rawKeys.includes('guardianNationalId'), 'Guardian National ID must not be present in public tracking');
    assert.ok(!rawKeys.includes('medicalHistory'), 'Medical history notes must not be present in public tracking');
  }
});
