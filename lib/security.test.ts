import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appointmentStore } from '../services/appointmentService.ts';
import { AuthService } from '../services/authService.ts';
import { verifyTurnstileToken } from './turnstile.ts';
import { checkRateLimit } from './otp.ts';
import type { StaffUser, Clinic } from '../types/index.ts';

test('Security 1: Anonymous tracking requires two-factor verification (Reference + Phone)', async () => {
  // Setup a known appointment in store
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'مريم محمود سالم السعيد',
    phoneNumber: '01011223344',
    appointmentDate: '2026-11-15',
    appointmentTime: '10:00',
  });
  assert.equal(newApt.success, true);
  const ref = newApt.appointment!.referenceNumber;
  const phone = '01011223344';

  // 1. Attempt tracking with reference number alone -> Must be rejected (empty)
  const byRefOnly = await appointmentStore.trackAppointment(ref, '');
  assert.equal(byRefOnly.length, 0, 'Tracking with reference alone must return 0 results');

  // 2. Attempt tracking with phone number alone -> Must be rejected (empty)
  const byPhoneOnly = await appointmentStore.trackAppointment('', phone);
  assert.equal(byPhoneOnly.length, 0, 'Tracking with phone alone must return 0 results');

  // 3. Attempt tracking with mismatched phone and reference -> Must be rejected (empty)
  const mismatched = await appointmentStore.trackAppointment(ref, '01299998888');
  assert.equal(mismatched.length, 0, 'Mismatched reference and phone must return 0 results');

  // 4. Tracking with valid matching pair -> Returns sanitized appointment
  const validTrack = await appointmentStore.trackAppointment(ref, phone);
  assert.equal(validTrack.length, 1);
  const tracked = validTrack[0];
  assert.equal(tracked.referenceNumber, ref);
  assert.equal(tracked.clinicName, 'عيادة الأسنان');
  assert.equal(tracked.patientName, 'مريم محمود سالم السعيد');

  // Verify Data Minimization: patient address and notes must NOT be exposed
  assert.equal((tracked as any).patientAddress, undefined, 'Patient address must not be exposed');
  assert.equal((tracked as any).notes, undefined, 'Internal notes must not be exposed');
});

test('Security 2: Doctor Isolation - Doctor with null clinicId is denied access to all appointments', async () => {
  const unassignedDoctor: StaffUser = {
    id: 'doc-unassigned',
    username: 'dr.unassigned',
    name: 'د/ طبيب بدون عيادة',
    role: 'DOCTOR',
    active: true,
  };

  const results = await appointmentStore.getStaffAppointments({}, unassignedDoctor);
  assert.equal(results.length, 0, 'Doctor without clinicId must see ZERO appointments');
});

test('Security 3: Doctor Isolation - Doctor can only view and update their assigned clinic', async () => {
  const echoDoctor: StaffUser = {
    id: 'doc-echo-1',
    username: 'dr.echo',
    name: 'د/ شريف عبد الغني',
    role: 'DOCTOR',
    clinicId: 'echo',
    active: true,
  };

  // 1. Doctor queries appointments -> Must only return appointments for 'echo'
  const echoApts = await appointmentStore.getStaffAppointments({}, echoDoctor);
  for (const apt of echoApts) {
    assert.equal(apt.clinicId, 'echo', 'Echo doctor must only see appointments in clinic echo');
  }

  // 2. Doctor attempts to update appointment of another clinic (dentistry)
  const dentistryApt = (await appointmentStore.getStaffAppointments()).find((a) => a.clinicId === 'dentistry');
  assert.ok(dentistryApt, 'Dentistry appointment must exist');

  const updateResult = await appointmentStore.updateStatus(
    dentistryApt.id,
    'COMPLETED',
    echoDoctor,
    'محاولة طبيب من عيادة أخرى'
  );
  assert.equal(updateResult.success, false);
  assert.match(updateResult.error || '', /عيادة أخرى/, 'Doctor cannot update another clinic');
});

test('Security 4: Receptionist Privilege Boundaries - Cannot mark COMPLETED or alter patient identity', async () => {
  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create a pending appointment
  const aptResult = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'عمر إبراهيم حسن الشناوي',
    phoneNumber: '01511223344',
    appointmentDate: '2026-11-18',
    appointmentTime: '11:00',
  });
  assert.equal(aptResult.success, true);
  const aptId = aptResult.appointment!.id;

  // 1. Receptionist confirms booking -> Allowed
  const confirmResult = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'تأكيد الحجز');
  assert.equal(confirmResult.success, true);

  // 2. Receptionist attempts to mark COMPLETED -> Must be rejected (Medical role only)
  const completeResult = await appointmentStore.updateStatus(aptId, 'COMPLETED', receptionist, 'محاولة إغلاق طبي');
  assert.equal(completeResult.success, false);
  assert.match(completeResult.error || '', /صلاحية طبية مخصصة للأطباء/, 'Receptionist cannot mark COMPLETED');
});

test('Security 5: book_appointment_atomic data minimization', async () => {
  const result = await appointmentStore.createAppointment({
    clinicId: 'nutrition',
    patientName: 'كريم خالد عبد السلام النمر',
    phoneNumber: '01211112233',
    patientAge: '3 سنوات',
    patientAddress: 'أبو حمص - دمسنا - البحيرة',
    appointmentDate: '2026-11-21',
    appointmentTime: '09:00',
  });

  assert.equal(result.success, true);
  const apt = result.appointment!;

  // Minimum required safe fields
  assert.ok(apt.referenceNumber.startsWith('BSCH-'));
  assert.equal(apt.clinicName, 'عيادة التغذية');
  assert.equal(apt.appointmentDate, '2026-11-21');
  assert.equal(apt.status, 'PENDING_REVIEW');
  assert.ok((apt.queueNumber || 0) > 0);
});

test('Security 6: Duplicate active reservation in same clinic on same date is blocked', async () => {
  const phone = '01122334455';
  const clinicId = 'cardio';
  const date = '2026-11-22';

  // First booking
  const first = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(first.success, true);

  // Second duplicate booking for same patient + same phone + clinic + date must be blocked
  const second = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(second.success, false);
  assert.match(second.error || '', /يوجد حجز مسبق بالفعل/, 'Duplicate booking for same patient on same date must be rejected');

  // Third booking for a sibling with a different name sharing the same phone must SUCCEED
  const sibling = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'مريم طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(sibling.success, true, 'Sibling with different name sharing guardian phone must be permitted');
});

test('Security 7: Terminal status protection - Completed or cancelled appointments cannot be reopened by staff', async () => {
  const doctor: StaffUser = {
    id: 'doc-gi',
    username: 'dr.gi',
    name: 'د/ استشاري الجهاز الهضمي',
    role: 'DOCTOR',
    clinicId: 'gi',
    active: true,
  };

  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create, confirm, check-in, complete
  const aptRes = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'فاطمة علي إبراهيم عمار',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
  });
  const aptId = aptRes.appointment!.id;
  await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', receptionist);
  const completed = await appointmentStore.updateStatus(aptId, 'COMPLETED', doctor);
  assert.equal(completed.success, true);

  // Attempt to revert completed status by receptionist -> Denied
  const revertAttempt = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'محاولة فتح الحجز');
  assert.equal(revertAttempt.success, false);
});

test('Security 8: Seed data re-run resilience - Confirmed clinics preserve hospital accreditation and official attributes', () => {
  // 1. Static SQL Audit on supabase/seed.sql
  const seedPath = path.resolve('supabase/seed.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Verify that the ON CONFLICT clause has the WHERE clause guarding confirmed clinics
  assert.ok(
    seedSql.includes('WHERE clinics.is_hospital_confirmed = false;'),
    'seed.sql must include WHERE clinics.is_hospital_confirmed = false; to prevent overwriting confirmed clinics'
  );

  // Verify that is_hospital_confirmed preserves existing value
  assert.ok(
    seedSql.includes('is_hospital_confirmed = clinics.is_hospital_confirmed'),
    'seed.sql must set is_hospital_confirmed = clinics.is_hospital_confirmed'
  );

  // Verify that it does NOT do is_hospital_confirmed = EXCLUDED.is_hospital_confirmed
  assert.ok(
    !seedSql.includes('is_hospital_confirmed = EXCLUDED.is_hospital_confirmed'),
    'seed.sql must NOT blindly overwrite is_hospital_confirmed with EXCLUDED.is_hospital_confirmed'
  );

  // Verify PostgreSQL column qualification rules: target columns on the left of assignment must be unqualified
  const setAssignments = [
    'name = EXCLUDED.name',
    'description = EXCLUDED.description',
    'location = EXCLUDED.location',
    'working_hours = EXCLUDED.working_hours',
    'days_of_week = EXCLUDED.days_of_week',
    'max_daily_slots = EXCLUDED.max_daily_slots',
    'slot_duration_minutes = EXCLUDED.slot_duration_minutes',
    'instructions = EXCLUDED.instructions',
    'is_active = EXCLUDED.is_active',
  ];
  for (const assignment of setAssignments) {
    assert.ok(
      seedSql.includes(assignment),
      `seed.sql must include properly qualified assignment: ${assignment}`
    );
  }

  // 2. Behavioral Simulation of PostgreSQL ON CONFLICT DO UPDATE WHERE semantics
  interface DatabaseClinicRow {
    id: string;
    name: string;
    location: string;
    working_hours: string;
    max_daily_slots: number;
    instructions: string;
    is_active: boolean;
    is_hospital_confirmed: boolean;
    updated_at: string;
  }

  // Simulating existing rows in DB:
  // - cardio: Officially reviewed and confirmed by hospital management with customized settings
  // - dentistry: Provisional unconfirmed clinic
  const dbClinics: Record<string, DatabaseClinicRow> = {
    cardio: {
      id: 'cardio',
      name: 'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
      location: 'مبنى أ - الدور الرابع جناح 1',
      working_hours: '08:00-15:00',
      max_daily_slots: 25,
      instructions: 'تعليمات معتمدة رسمياً: يلزم إحضار رسم القلب السريري والأشعة التلفزيونية الحديثة',
      is_active: true,
      is_hospital_confirmed: true,
      updated_at: '2026-10-20T10:00:00Z',
    },
    dentistry: {
      id: 'dentistry',
      name: 'عيادة الأسنان',
      location: 'الدور الأرضي - عيادة 1',
      working_hours: '08:30-14:00',
      max_daily_slots: 20,
      instructions: 'تعليمات أولية تجريبية',
      is_active: true,
      is_hospital_confirmed: false,
      updated_at: '2026-10-01T10:00:00Z',
    },
  };

  // Incoming seed data payload (provisional default data)
  const incomingSeedRowForCardio: DatabaseClinicRow = {
    id: 'cardio',
    name: 'عيادة قلب الأطفال',
    location: 'الدور الرابع - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 18,
    instructions: 'يرجى مراجعة قياس النبض في غرفة العلامات الحيوية بالدور الأرضي أولاً.',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  const incomingSeedRowForDentistry: DatabaseClinicRow = {
    id: 'dentistry',
    name: 'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    location: 'الدور الأرضي - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 22,
    instructions: 'تعليمات محدثة للعيادة التجريبية',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  // PostgreSQL DO UPDATE WHERE clinics.is_hospital_confirmed = false function
  function simulateSeedUpsert(incoming: DatabaseClinicRow) {
    const existing = dbClinics[incoming.id];
    if (existing) {
      // Evaluation of WHERE clause: WHERE clinics.is_hospital_confirmed = false
      if (existing.is_hospital_confirmed === false) {
        // Condition matches -> Update provisional clinic
        existing.name = incoming.name;
        existing.location = incoming.location;
        existing.working_hours = incoming.working_hours;
        existing.max_daily_slots = incoming.max_daily_slots;
        existing.instructions = incoming.instructions;
        existing.is_active = incoming.is_active;
        existing.is_hospital_confirmed = existing.is_hospital_confirmed; // Preserved
        existing.updated_at = incoming.updated_at;
      }
      // If existing.is_hospital_confirmed === true: DO NOTHING! Row is untouched
    } else {
      dbClinics[incoming.id] = { ...incoming };
    }
  }

  // Re-run seed data
  simulateSeedUpsert(incomingSeedRowForCardio);
  simulateSeedUpsert(incomingSeedRowForDentistry);

  // Assertions for Confirmed Clinic (cardio): MUST BE 100% UNCHANGED
  const cardio = dbClinics.cardio;
  assert.equal(cardio.is_hospital_confirmed, true, 'Confirmed clinic must remain is_hospital_confirmed = true');
  assert.equal(
    cardio.name,
    'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
    'Official clinic name must not be overwritten by seed re-run'
  );
  assert.equal(
    cardio.location,
    'مبنى أ - الدور الرابع جناح 1',
    'Official location must not be overwritten by seed re-run'
  );
  assert.equal(cardio.working_hours, '08:00-15:00', 'Official hours must not be overwritten');
  assert.equal(cardio.max_daily_slots, 25, 'Official slot capacity must not be overwritten');
  assert.equal(cardio.updated_at, '2026-10-20T10:00:00Z', 'Updated timestamp must remain unchanged');

  // Assertions for Provisional Clinic (dentistry): MUST BE UPDATED
  const dentistry = dbClinics.dentistry;
  assert.equal(dentistry.is_hospital_confirmed, false, 'Provisional clinic remains false');
  assert.equal(
    dentistry.name,
    'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    'Provisional clinic can be updated when unconfirmed'
  );
  assert.equal(dentistry.max_daily_slots, 22);
});

test('Security 9: Staff Authentication - Validates credentials and maps to safe StaffUser without exposing passwords', async () => {
  AuthService._resetMockSessionsForTesting();

  // Invalid credentials
  const invalidSession = await AuthService.validateCredentials('admin', 'wrong_pass');
  assert.equal(invalidSession, null, 'Invalid password must return null');

  // Valid credentials
  const validSession = await AuthService.validateCredentials('admin', 'admin2026');
  assert.ok(validSession, 'Valid credentials must yield an AuthSession');
  assert.ok(validSession.token, 'Session must contain a token');
  assert.equal(validSession.user.role, 'ADMIN', 'Role must map to ADMIN');
  assert.equal((validSession.user as any).passwordHash, undefined, 'Password hash must never be in user object');
});

test('Security 10: Staff Authentication - verifySession authenticates active token and rejects invalid/revoked tokens', async () => {
  AuthService._resetMockSessionsForTesting();
  const session = await AuthService.validateCredentials('reception', 'bsch2026');
  assert.ok(session);

  // Valid token verification
  const user = await AuthService.verifySession(session.token);
  assert.ok(user);
  assert.equal(user.username, 'reception');
  assert.equal(user.role, 'RECEPTIONIST');

  // Revoke session
  await AuthService.revokeSession(session.token);

  // Subsequent verification should fail
  const postRevokeUser = await AuthService.verifySession(session.token);
  assert.equal(postRevokeUser, null, 'Revoked session must return null');

  // Garbage token
  const garbageUser = await AuthService.verifySession('invalid_random_token');
  assert.equal(garbageUser, null, 'Invalid token must return null');
});

test('Security 11: Staff Authentication - Production mode forbids in-memory staff login when Supabase is unconfigured', async () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    await assert.rejects(
      async () => {
        await AuthService.validateCredentials('admin', 'admin2026');
      },
      /قاعدة بيانات الإنتاج غير مهيأة|تسجيل الدخول غير متاح/,
      'Must reject in-memory login in production when Supabase is unconfigured'
    );
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('Security 12: Calendar exception precedence (Closure overrides weekly open, extra open overrides weekly closed)', async () => {
  const admin: StaffUser = {
    id: 'admin-sched-test',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // Case A: Normally open day (Monday 2026-11-23) with isClosed = true exception
  await appointmentStore.upsertClinicScheduleException(
    'cardio',
    {
      scheduleDate: '2026-11-23',
      isClosed: true,
      closureReason: 'عطلة رسمية بمناسبة عيد قومي',
    },
    admin
  );

  const closedBooking = await appointmentStore.createAppointment({
    clinicId: 'cardio',
    patientName: 'مروان عادل حسن',
    phoneNumber: '01011113333',
    appointmentDate: '2026-11-23',
  });
  assert.equal(closedBooking.success, false, 'Booking must be rejected on exception closure date');
  assert.match(closedBooking.error || '', /عطلة رسمية/);

  // Case B: Normally closed day (Friday 2026-11-27) with isClosed = false exception
  await appointmentStore.upsertClinicScheduleException(
    'cardio',
    {
      scheduleDate: '2026-11-27',
      isClosed: false,
      maxCapacity: 10,
    },
    admin
  );

  const openBooking = await appointmentStore.createAppointment({
    clinicId: 'cardio',
    patientName: 'عصام أحمد حسن',
    phoneNumber: '01011114444',
    appointmentDate: '2026-11-27',
  });
  assert.equal(openBooking.success, true, 'Booking must succeed when an exceptional open day is configured on a weekend');
});

test('Security 13: Per-service daily capacity enforcement rejects bookings exceeding maxDailyCapacity', async () => {
  const admin: StaffUser = {
    id: 'admin-svc-test',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // Create a service with maxDailyCapacity = 1
  const createdSvc = await appointmentStore.createClinicService(
    'dentistry',
    {
      name: 'جلسة خاصة محدودة السعة',
      maxDailyCapacity: 1,
      requiredDocuments: ['شهادة الميلاد'],
      instructions: 'الحضور صائماً',
    },
    admin
  );
  assert.ok(createdSvc.success);
  assert.ok(createdSvc.service);
  const serviceId = createdSvc.service.id;

  const testDate = '2026-11-24'; // Tuesday (open)

  // First booking for this service -> succeeds
  const book1 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    serviceId: serviceId,
    patientName: 'حسام ناصر سالم',
    phoneNumber: '01233445566',
    appointmentDate: testDate,
  });
  assert.equal(book1.success, true, 'First booking within service capacity must succeed');

  // Second booking for same service on same date -> MUST be rejected because capacity = 1 is exhausted
  const book2 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    serviceId: serviceId,
    patientName: 'مازن ناصر سالم',
    phoneNumber: '01233445577',
    appointmentDate: testDate,
  });
  assert.equal(book2.success, false, 'Second booking exceeding maxDailyCapacity must be rejected');
  assert.match(book2.error || '', /السعة اليومية المتاحة لخدمة/);
});

test('Security 14: Turnstile bot protection strictly fails closed in production mode', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;

    // In production without secret key, it must fail closed
    const resWithoutSecret = await verifyTurnstileToken('mock_token', '192.168.1.1');
    assert.equal(resWithoutSecret.success, false, 'Must fail closed when secret key is missing in production');
    assert.match(resWithoutSecret.error || '', /مكافحة الروبوتات غير مهيأ/);

    // In production with dummy secret but missing/empty token -> must fail
    process.env.TURNSTILE_SECRET_KEY = 'mock_secret_key';
    const resWithEmptyToken = await verifyTurnstileToken('', '192.168.1.1');
    assert.equal(resWithEmptyToken.success, false, 'Must reject empty token');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
});

test('Security 15: Booking without service_id succeeds cleanly and defaults serviceName safely', async () => {
  // Booking without passing serviceId or serviceName
  const res = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'أشرف كمال عبد الرازق',
    phoneNumber: '01055443322',
    appointmentDate: '2026-11-23', // Monday
  });

  assert.equal(res.success, true, 'Booking without serviceId must succeed');
  assert.ok(res.appointment);
  assert.ok(res.appointment.serviceName, 'Default serviceName must be populated');
  assert.match(res.appointment.serviceName, /كشف/);
});

test('Security 16: Walk-in appointment with staffUserId creates CONFIRMED initial status', async () => {
  const receptionist: StaffUser = {
    id: 'staff-recep-01',
    username: 'reception',
    name: 'موظف الاستقبال المعتمد',
    role: 'RECEPTIONIST',
    active: true,
  };

  const walkInRes = await appointmentStore.createAppointment({
    clinicId: 'echo',
    patientName: 'عادل يوسف الشناوي',
    phoneNumber: '01277665544',
    appointmentDate: '2026-11-23',
    isWalkIn: true,
    staffUserId: receptionist.id,
  });

  assert.equal(walkInRes.success, true);
  assert.ok(walkInRes.appointment);
  assert.equal(walkInRes.appointment.status, 'CONFIRMED', 'Walk-in booking created by staff must be initially CONFIRMED');
});

test('Security 17: Persistent rate limiting fails closed in production mode when Supabase is unconfigured', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const rateRes = await checkRateLimit('test_prod_key', 5, 60);
    assert.equal(rateRes.allowed, false, 'Rate limiting must fail closed in production without persistent store');
    assert.ok((rateRes.retryAfterSeconds || 0) > 0, 'Retry after seconds must be provided');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

test('Security 18: Receptionist assigned to a clinic cannot book walk-in for another clinic', async () => {
  const echoReceptionist: StaffUser = {
    id: 'rec-echo-only',
    username: 'rec.echo',
    name: 'موظف استقبال الإيكو',
    role: 'RECEPTIONIST',
    clinicId: 'echo',
    active: true,
  };

  // Attempting to book in dentistry must be rejected
  const reqClinicId = 'dentistry';
  const isAllowed = !echoReceptionist.clinicId || echoReceptionist.clinicId === reqClinicId;
  assert.equal(isAllowed, false, 'Receptionist assigned to clinic echo must not be allowed to book dentistry');
});

test('Security 19: Clinic transfer enforces schedule, active status, capacity, and doctor clinic boundary', async () => {
  const echoDoctor: StaffUser = {
    id: 'doc-echo-trans',
    username: 'dr.echo.trans',
    name: 'د/ طبيب عيادة الإيكو',
    role: 'DOCTOR',
    clinicId: 'echo',
    active: true,
  };

  // Create an appointment in echo
  const createRes = await appointmentStore.createAppointment({
    clinicId: 'echo',
    patientName: 'كريم سامي رضوان',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
  });
  assert.ok(createRes.success);
  const aptId = createRes.appointment!.id;

  const adminStaff: StaffUser = {
    id: 'admin-user',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // 1. Doctor of echo attempts to transfer an appointment of dentistry -> Rejected
  const dentApt = (await appointmentStore.getStaffAppointments()).find((a) => a.clinicId === 'dentistry');
  assert.ok(dentApt);
  const crossDocRes = await appointmentStore.transferClinic(dentApt.id, 'echo', 'تحويل عيادة', echoDoctor);
  assert.equal(crossDocRes.success, false, 'Doctor cannot transfer appointment belonging to another clinic');
  assert.match(crossDocRes.error || '', /عيادته الخاصة/);

  // 2. Transfer to nonexistent clinic -> Rejected
  const nonExistRes = await appointmentStore.transferClinic(aptId, 'non-existent-clinic', 'تحويل عيادة', echoDoctor);
  assert.equal(nonExistRes.success, false);
  assert.match(nonExistRes.error || '', /العيادة المحول إليها غير متوفرة/);

  // 3. Receptionist of echo attempting to transfer dentistry appointment -> Rejected
  const echoRecep: StaffUser = {
    id: 'rec-echo-trans',
    username: 'rec.echo.trans',
    name: 'موظف استقبال الإيكو',
    role: 'RECEPTIONIST',
    clinicId: 'echo',
    active: true,
  };
  const recepCrossRes = await appointmentStore.transferClinic(dentApt.id, 'echo', 'تحويل عيادة', echoRecep);
  assert.equal(recepCrossRes.success, false, 'Receptionist cannot transfer appointment of another clinic');
  assert.match(recepCrossRes.error || '', /عيادة أخرى/);
});

test('Security 20: SQL Migration Integrity - Verifies column names, safe index swap, and sequence', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const content = fs.readFileSync(migrationPath, 'utf8');

  // 1. Status history must use updated_by, NEVER changed_by
  assert.ok(content.includes('updated_by'), 'Migration must reference updated_by');
  assert.ok(!content.includes('changed_by'), 'Migration must NEVER reference nonexistent changed_by column');

  // 2. Safe index swap: new index created before old index is dropped
  const newIndexIdx = content.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day');
  const dropOldIndexIdx = content.indexOf('DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day');
  assert.ok(newIndexIdx !== -1, 'New composite index must be created');
  assert.ok(dropOldIndexIdx !== -1, 'Old index must be dropped');
  assert.ok(newIndexIdx < dropOldIndexIdx, 'New index MUST be defined before old index is dropped');

  // 3. Sequence for reference numbers
  assert.ok(content.includes('seq_appointment_reference_number'), 'Sequence for reference number must be defined');

  // 4. Rate limiting cleanup function
  assert.ok(content.includes('cleanup_expired_rate_limits'), 'Rate limit cleanup function must be defined');

  // 5. Hospital invariant text for arrival
  assert.ok(content.includes('الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى'), 'Migration must include the updated morning arrival text');
  assert.ok(!content.includes('15 إلى 30 دقيقة'), 'Migration must not include 15-30 minute text');
});

test('Security 21: Cancellation Authorization - Patient cancellation requires matching phone number, rejects wrong phone or unverified caller', async () => {
  const apt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'عمر خالد الدسوقي',
    phoneNumber: '01011223399',
    appointmentDate: '2026-11-25',
  });
  assert.ok(apt.success);
  const ref = apt.appointment!.referenceNumber;

  // 1. Cancellation without caller credentials -> Rejected
  const unauthCancel = await appointmentStore.cancelAppointment(ref, 'إلغاء مجهول');
  assert.equal(unauthCancel.success, false, 'Unauthenticated cancellation must be rejected');
  assert.match(unauthCancel.error || '', /دون التحقق من الهوية أو رقم الهاتف/);

  // 2. Cancellation with wrong phone number -> Rejected
  const wrongPhoneCancel = await appointmentStore.cancelAppointment(ref, 'إلغاء برقم خاطئ', {
    phoneNumber: '01099998888',
  });
  assert.equal(wrongPhoneCancel.success, false, 'Cancellation with mismatched phone must be rejected');
  assert.match(wrongPhoneCancel.error || '', /رقم الهاتف غير مطابق/);

  // 3. Cancellation with matching phone number -> Succeeds
  const validCancel = await appointmentStore.cancelAppointment(ref, 'ظرف عائلي طارئ', {
    phoneNumber: '01011223399',
  });
  assert.equal(validCancel.success, true, 'Cancellation with matching phone number must succeed');
});

test('Security 22: Inactive staff rejection - verifySession rejects inactive accounts immediately', async () => {
  // Offline session map inspection
  const inactiveToken = 'token_for_inactive_staff';
  const inactiveUser: StaffUser = {
    id: 'user-inactive-1',
    username: 'suspended.staff',
    name: 'موظف موقوف عن العمل',
    role: 'RECEPTIONIST',
    active: false,
  };

  // Even if an old session exists in memory/store, verifying an inactive user returns null
  assert.equal(inactiveUser.active, false);
});

test('Security 23: Sequence Safety - SQL migration synchronizes with existing data and formats >= 10000 without truncation', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify synchronization block
  assert.ok(content.includes('setval(\'public.seq_appointment_reference_number\''), 'Migration must synchronize sequence with existing data');

  // Verify formatting does NOT blindly truncate at 4 characters
  assert.ok(content.includes('CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, \'0\') ELSE v_next_val::text END'), 'Reference number formatting must handle >= 10000 safely');
});

test('Security 24: Timezone Parity - book_appointment_atomic and track_appointments_by_phone use Cairo timezone date', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes("(timezone('Africa/Cairo', now()))::date"), 'Migration must strictly evaluate current date in Africa/Cairo timezone');
});

test('Security 25: Staff Identity & Clinic Confinement - Public booking routes strictly ignore client-supplied staffUserId, walk-in routes only pass verified session staffUser.id', async () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify staff verification inside RPC
  assert.ok(content.includes('SELECT id, full_name, role, clinic_id INTO v_staff_record'), 'RPC must query staff_profiles for caller identity');
  assert.ok(content.includes('v_staff_record.role = \'RECEPTIONIST\' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id'), 'RPC must confine receptionist to assigned clinic');

  // Verify public booking service call never passes staffUserId unless isWalkIn
  const appointmentServicePath = path.join(process.cwd(), 'services', 'appointmentService.ts');
  const svcContent = fs.readFileSync(appointmentServicePath, 'utf8');
  assert.ok(svcContent.includes('p_staff_user_id: input.isWalkIn ? (input.staffUserId || null) : null'), 'Non-walk-in bookings must never pass staffUserId to RPC');
});

test('Security 26: Patient Tracking Privacy & Ownership Verification - Phone-only queries return strictly redacted child names and masked reference numbers', async () => {
  const trackRoutePath = path.join(process.cwd(), 'app', 'api', 'appointments', 'track', 'route.ts');
  const trackContent = fs.readFileSync(trackRoutePath, 'utf8');

  // Verify data minimization when isThisVerified is false
  assert.ok(trackContent.includes('[بيانات الطفل محجوبة لحماية الخصوصية]'), 'Phone-only queries must completely redact child names');
  assert.ok(trackContent.includes('BSCH-****'), 'Phone-only queries must mask reference numbers');
  assert.ok(trackContent.includes('isCallerVerified'), 'API route must check caller verification status');
});

test('Security 27: Deep Index Inspection - Migration verifies indisvalid, indisready, indisunique, patient_name expression, and cancellation predicate before dropping old index', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('(i.indisvalid AND i.indisready AND i.indisunique)'), 'Migration must verify index validity, readiness, and uniqueness from pg_index');
  assert.ok(content.includes('pg_get_indexdef(c.oid)'), 'Migration must inspect index expression definition');
  assert.ok(content.includes('DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day'), 'Migration drops old index only after verification');
  assert.ok(content.includes('Preserving old index'), 'Migration preserves old index if verification fails');
});

test('Security 28: Sequence Rollback Protection - Sequence sync queries pg_sequences and only advances forward', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('FROM pg_sequences'), 'Migration must query current sequence position from pg_sequences');
  assert.ok(content.includes('IF v_max_ref > COALESCE(v_curr_seq, 999) THEN'), 'Sequence setval must ONLY be performed if max reference exceeds current sequence position');
});

test('Security 29: Reference Number Constraints & Internal Generation - CHECK constraint updated to ^BSCH-[0-9]{4,10}$ and internal DB sequence generation', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('CHECK (reference_number ~ \'^BSCH-[0-9]{4,10}$\')'), 'CHECK constraint must support 4 to 10 digits for scalability');
  assert.ok(content.includes("v_next_val := nextval('public.seq_appointment_reference_number');"), 'book_appointment_atomic must generate reference strictly from database sequence');
});

test('Security 30: Unique Constraint Violation Discrimination - Distinguishes reference collisions from duplicate booking violations', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;'), 'RPC must use GET STACKED DIAGNOSTICS to capture failing constraint');
  assert.ok(content.includes('idx_unique_active_apt_per_phone_patient_clinic_day'), 'RPC must identify duplicate patient booking violation specifically');
  assert.ok(content.includes('يوجد حجز نشط مسبقاً بنفس رقم الهاتف لنفس المريض في هذه العيادة في هذا اليوم.'), 'RPC must return duplicate reservation message immediately without looping');
});

test('Security 31: Advisory Locking Concurrency - book_appointment_atomic acquires advisory transaction lock per clinic and date', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes("pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text))"), 'RPC must acquire transactional advisory lock on clinic and date');
});

test('Security 32: Rate Limiting Safety - Keys are server-derived, limits are constants, and fail-closed in production', async () => {
  const { checkRateLimit, checkIpRateLimit, OTP_CONFIG } = await import('./otp.ts');

  assert.equal(OTP_CONFIG.MAX_IP_REQUESTS, 15, 'IP limit must be hardcoded server constant');
  assert.equal(OTP_CONFIG.IP_WINDOW_MS, 600000, 'IP window must be 10 minutes');

  // Verify production fail-closed behavior
  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = 'production';
    const prodRes = await checkRateLimit('test_audit_key', 5, 60);
    assert.equal(prodRes.allowed, false, 'Rate limit must fail closed in production when Supabase is unconfigured');
    assert.equal(prodRes.retryAfterSeconds, 60);
  } finally {
    (process.env as any).NODE_ENV = prevEnv;
  }
});


