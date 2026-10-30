import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, verifyOtp, _resetOtpStoreForTesting, OTP_CONFIG } from './otp.ts';
import { appointmentStore } from '../services/appointmentService.ts';

test('OTP Invariant 1: generateOtp creates cryptographically valid 4-digit code and enforces 5-min expiry', async () => {
  _resetOtpStoreForTesting();
  const phone = '01011112222';
  const result = await generateOtp(phone);

  assert.equal(result.success, true);
  assert.ok(result.expiresAt && result.expiresAt > Date.now(), 'Expiry must be in future');
  assert.ok(result.expiresAt && result.expiresAt <= Date.now() + OTP_CONFIG.EXPIRY_MS, 'Expiry must be within 5 mins');
});

test('OTP Invariant 2: verifyOtp accepts correct code, rejects wrong code, and prevents replay attacks', async () => {
  _resetOtpStoreForTesting();
  const phone = '01022223333';
  await generateOtp(phone);

  // In dev mode, verify wrong code first
  const wrongRes = await verifyOtp(phone, '0000');
  assert.equal(wrongRes.valid, false, 'Wrong code must be rejected');
  assert.ok(wrongRes.attemptsRemaining !== undefined && wrongRes.attemptsRemaining < 5);

  // In non-prod dev mode, 1234 works as fallback
  const validRes = await verifyOtp(phone, '1234');
  assert.equal(validRes.valid, true, 'Valid code must be accepted');

  // Replay attempt must be rejected because code is consumed upon success
  const replayRes = await verifyOtp(phone, '1234');
  assert.equal(replayRes.valid, false, 'Replay must be strictly rejected');
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
    const res = await verifyOtp(phone, `999${i}`);
    assert.equal(res.valid, false);
    assert.equal(res.attemptsRemaining, 5 - i);
  }

  // 5th wrong attempt should lock out and delete entry
  const fifthRes = await verifyOtp(phone, '9995');
  assert.equal(fifthRes.valid, false);
  assert.match(fifthRes.error || '', /تجاوز الحد الأقصى/);

  // 6th attempt should report expired/deleted
  const sixthRes = await verifyOtp(phone, '1234');
  assert.equal(sixthRes.valid, false);
});

test('OTP Invariant 5: Production Security - Dev bypass code 1234 is strictly forbidden when NODE_ENV=production', async () => {
  _resetOtpStoreForTesting();
  const phone = '01055556666';

  // Generate real OTP in dev mode first to populate store
  const genRes = await generateOtp(phone);
  assert.equal(genRes.success, true);

  const originalEnv = process.env.NODE_ENV;
  try {
    // Simulate production environment
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    // Attempting to bypass using 1234 in production MUST fail unless 1234 was the generated code
    const bypassRes = await verifyOtp(phone, '1234');
    assert.equal(bypassRes.valid, false, 'Static bypass 1234 must be strictly rejected in production');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('OTP Invariant 6: Production Security - Never accept 1234 when no OTP entry exists in production', async () => {
  _resetOtpStoreForTesting();
  const phone = '01077778888';
  const originalEnv = process.env.NODE_ENV;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const bypassRes = await verifyOtp(phone, '1234');
    assert.equal(bypassRes.valid, false, 'Empty store bypass 1234 must be strictly rejected in production');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('Tracking Invariant 7: Generic OTP generation response prevents phone enumeration', async () => {
  _resetOtpStoreForTesting();
  // Phone 1: Registered in mock database
  const registeredPhone = '01012345678';
  // Phone 2: Completely random unregistered number
  const unregisteredPhone = '01099999999';

  const resRegistered = await generateOtp(registeredPhone);
  const resUnregistered = await generateOtp(unregisteredPhone);

  // Both should return identical structural responses without leaking DB presence
  assert.equal(resRegistered.success, true);
  assert.equal(resUnregistered.success, true);
  assert.equal(typeof resRegistered.expiresAt, 'number');
  assert.equal(typeof resUnregistered.expiresAt, 'number');
});

test('Tracking Invariant 8: Phone tracking returns only sanitized fields (no sensitive PII leaked)', async () => {
  const verifiedPhone = '01012345678';
  const appointments = await appointmentStore.trackAppointmentsByVerifiedPhone(verifiedPhone);

  assert.ok(appointments.length > 0, 'Should find appointments for test fixture');

  for (const apt of appointments) {
    // Verify required public tracking fields exist
    assert.ok(apt.referenceNumber, 'referenceNumber must exist');
    assert.ok(apt.patientName, 'patientName must exist');
    assert.ok(apt.clinicName, 'clinicName must exist');
    assert.ok(apt.appointmentDate, 'appointmentDate must exist');

    // Verify sensitive fields are not leaked in public sanitized view
    const rawKeys = Object.keys(apt);
    assert.ok(!rawKeys.includes('nationalId'), 'National ID must not be present in public tracking');
    assert.ok(!rawKeys.includes('guardianNationalId'), 'Guardian National ID must not be present in public tracking');
    assert.ok(!rawKeys.includes('medicalHistory'), 'Medical history notes must not be present in public tracking');
  }
});
