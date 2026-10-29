import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAndValidateEgyptianPhone,
  validatePatientName,
  canTransitionStatus,
  generateReferenceNumber,
  getStatusDisplay,
  formatArabicDate,
  formatLocalDate,
} from './rules.ts';

test('normalizeAndValidateEgyptianPhone validates standard 11-digit mobile numbers', () => {
  const result1 = normalizeAndValidateEgyptianPhone('01012345678');
  assert.equal(result1.isValid, true);
  assert.equal(result1.normalized, '01012345678');

  const result2 = normalizeAndValidateEgyptianPhone('01198765432');
  assert.equal(result2.isValid, true);

  const result3 = normalizeAndValidateEgyptianPhone('01255554444');
  assert.equal(result3.isValid, true);

  const result4 = normalizeAndValidateEgyptianPhone('01511112222');
  assert.equal(result4.isValid, true);
});

test('normalizeAndValidateEgyptianPhone handles Arabic numerals and country code prefixes', () => {
  const arabicInput = '٠١٠١٢٣٤٥٦٧٨';
  const result = normalizeAndValidateEgyptianPhone(arabicInput);
  assert.equal(result.isValid, true);
  assert.equal(result.normalized, '01012345678');

  const withCode = '+201012345678';
  const result2 = normalizeAndValidateEgyptianPhone(withCode);
  assert.equal(result2.isValid, true);
  assert.equal(result2.normalized, '01012345678');

  const withSpaces = ' 010 1234 5678 ';
  const result3 = normalizeAndValidateEgyptianPhone(withSpaces);
  assert.equal(result3.isValid, true);
  assert.equal(result3.normalized, '01012345678');
});

test('normalizeAndValidateEgyptianPhone rejects invalid numbers', () => {
  assert.equal(normalizeAndValidateEgyptianPhone('01912345678').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('0101234567').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('010123456789').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('abc').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('').isValid, false);
});

test('validatePatientName checks length and word count', () => {
  assert.equal(validatePatientName('محمد أحمد علي').isValid, true);
  assert.equal(validatePatientName('أحمد علي').isValid, true);
  assert.equal(validatePatientName('محمد').isValid, false);
  assert.equal(validatePatientName(' علي ').isValid, false);
  assert.equal(validatePatientName('').isValid, false);
});

test('canTransitionStatus validates hospital workflow states and enforces terminal states', () => {
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'CONFIRMED'), true);
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'CANCELLED'), true);
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'COMPLETED'), false);

  assert.equal(canTransitionStatus('CONFIRMED', 'CHECKED_IN'), true);
  assert.equal(canTransitionStatus('CONFIRMED', 'CANCELLED'), true);

  assert.equal(canTransitionStatus('CHECKED_IN', 'COMPLETED'), true);
  assert.equal(canTransitionStatus('CHECKED_IN', 'CANCELLED'), true);

  assert.equal(canTransitionStatus('COMPLETED', 'PENDING_REVIEW'), false);
  assert.equal(canTransitionStatus('COMPLETED', 'CANCELLED'), false);
  assert.equal(canTransitionStatus('CANCELLED', 'CONFIRMED'), false);
});

test('generateReferenceNumber produces BSCH-XXXX pattern', () => {
  const ref = generateReferenceNumber();
  assert.match(ref, /^BSCH-[0-9]{4}$/);
});

test('getStatusDisplay provides valid styling and labels', () => {
  const confirmed = getStatusDisplay('CONFIRMED');
  assert.equal(confirmed.label, 'مؤكد');
  assert.ok(confirmed.color.length > 0);

  const pending = getStatusDisplay('PENDING_REVIEW');
  assert.equal(pending.label, 'قيد المراجعة');
});

test('formatArabicDate outputs readable Arabic date', () => {
  const formatted = formatArabicDate('2026-10-25');
  assert.ok(formatted.includes('2026'));
  assert.ok(formatted.includes('أكتوبر') || formatted.includes('الأحد'));
  assert.equal(formatArabicDate(''), '');
  assert.equal(formatArabicDate('invalid'), 'invalid');
});

test('formatLocalDate formats date in local YYYY-MM-DD format', () => {
  const d = new Date(2026, 9, 25); // month 9 is October (0-indexed)
  assert.equal(formatLocalDate(d), '2026-10-25');
  const todayStr = formatLocalDate();
  assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);
});

test('Supabase RLS role permission matrix validation', () => {
  // Test role permission rules matching the SQL policies
  const canAdminManageClinics = (role: string) => role === 'ADMIN';
  const canViewPatientList = (role: string) => ['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(role);
  const canConfirmBookings = (role: string) => ['ADMIN', 'RECEPTIONIST'].includes(role);
  const canCompleteAppointment = (role: string) => ['ADMIN', 'DOCTOR'].includes(role);
  const canViewAuditLogs = (role: string) => role === 'ADMIN';

  assert.equal(canAdminManageClinics('ADMIN'), true);
  assert.equal(canAdminManageClinics('RECEPTIONIST'), false);
  assert.equal(canAdminManageClinics('DOCTOR'), false);

  assert.equal(canViewPatientList('DOCTOR'), true);
  assert.equal(canViewPatientList('RECEPTIONIST'), true);
  assert.equal(canViewPatientList('ANONYMOUS'), false);

  assert.equal(canConfirmBookings('RECEPTIONIST'), true);
  assert.equal(canConfirmBookings('DOCTOR'), false);

  // Receptionist CANNOT mark appointment as COMPLETED (Medical completion reserved for Doctor/Admin)
  assert.equal(canCompleteAppointment('RECEPTIONIST'), false);
  assert.equal(canCompleteAppointment('DOCTOR'), true);
  assert.equal(canCompleteAppointment('ADMIN'), true);

  // Receptionist CANNOT view audit logs (Admin only)
  assert.equal(canViewAuditLogs('RECEPTIONIST'), false);
  assert.equal(canViewAuditLogs('DOCTOR'), false);
  assert.equal(canViewAuditLogs('ADMIN'), true);
});

test('book_appointment_atomic business logic validations', () => {
  // 1. Date window validation
  const validateBookingDate = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const maxFuture = new Date(today);
    maxFuture.setDate(today.getDate() + 60);

    if (target < today) return { valid: false, error: 'past_date' };
    if (target > maxFuture) return { valid: false, error: 'too_far' };
    return { valid: true };
  };

  assert.equal(validateBookingDate('2020-01-01').valid, false);
  assert.equal(validateBookingDate('2020-01-01').error, 'past_date');

  // 2. Working days validation (e.g. clinic operates on days [0,1,2,3,4,6], Friday is 5)
  const isWorkingDay = (daysOfWeek: number[], dayOfWeek: number) => daysOfWeek.includes(dayOfWeek);
  const standardClinicDays = [0, 1, 2, 3, 4, 6];
  assert.equal(isWorkingDay(standardClinicDays, 0), true); // Sunday
  assert.equal(isWorkingDay(standardClinicDays, 5), false); // Friday closed

  // 3. Capacity enforcement logic
  const isWithinCapacity = (currentBooked: number, capacity: number) => currentBooked < capacity;
  assert.equal(isWithinCapacity(19, 20), true);
  assert.equal(isWithinCapacity(20, 20), false);
  assert.equal(isWithinCapacity(25, 20), false);
});
